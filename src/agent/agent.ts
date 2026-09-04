import { AgentError } from '../domain/errors.js';
import type { ActionIntent, IntentName } from '../domain/intents.js';
import { isActionIntent } from '../domain/intents.js';
import { getBool, getString, getStudentIds, type CollectedSlots } from '../domain/slots.js';
import { fullName, type CaseRecord, type FamilyProfile } from '../domain/types.js';
import { formatDate, parseDateHint } from '../lib/dates.js';
import type { CalendarProvider } from '../integrations/calendar.js';
import type { MealsProvider } from '../integrations/meals.js';
import type { Sis } from '../integrations/sis.js';
import type { EmailProvider } from '../integrations/email.js';
import { MockEmailProvider } from '../integrations/email.js';
import type { CallResult } from '../integrations/phones.js';
import { getSupabase, ensureSeedDistrict, saveFamilyProfile, saveCaseRecord, loadFamilySnapshot } from '../integrations/db.js';
import { answerSchoolInfo, DISTRICT, LIAISON, BUS_PASSES, SOQUEL_ELEMENTARY } from '../knowledge/suesd.js';
import { StepExecutor } from './steps/executor.js';
import { planSteps } from './steps/planner.js';
import { buildAdapters } from './steps/registry.js';
import { Scheduler } from './scheduler.js';
import type { Counterparty, Mode, StepResult, ExecutionContext, Step } from './steps/types.js';
import { resolveDistrict, type DistrictProfile } from '../knowledge/districts.js';
import type { SeedDb } from '../seed.js';
import { executeTool } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
import type { IntentEngine } from './intent/engine.js';
import { InMemoryStore, type ChatMessage } from './memory.js';
import { advanceMckinney, openMckinney } from './mckinney.js';
import { advanceOnboarding, finalizeOnboarding, openOnboarding } from './onboarding.js';
import { advanceAttendance, openAttendance } from './attendance.js';
import { addCase, makeCase, openCaseSummary } from './family.js';
import { LLM_TOOLS, runTool, systemPrompt, type ToolDeps } from './tools.js';
import { LlmClient } from './llm.js';
import { extractSlots, missingRequired, SLOT_SPECS, type Roster, type SlotSpec } from './slots.js';
import { initialState, type ConversationState, type Plan } from './state.js';

export interface Suggestion {
  kind: 'quickReplies' | 'listPicker';
  title?: string;
  options: string[];
}

export interface AgentTurn {
  text: string;
  suggestions?: Suggestion[];
  phase: ConversationState['phase'];
  /** Signal to the channel: the parent wants a (demo) phone call to us. */
  callMe?: boolean;
  /** Signal to the channel: the parent wants us to call the school. */
  callSchool?: boolean;
  /** What to brief the voice agent with on the call (replaces generic demo text). */
  callContext?: CallContext;
}

export type CallContext = {
  parent_name: string;
  student: string;
  grade: string;
  school: string;
  district: string;
  issue: string;
  goal: string;
  what_we_know: string;
};

export interface AgentOptions {
  intentEngine: IntentEngine;
  sis: Sis;
  calendar: CalendarProvider;
  meals: MealsProvider;
  db: SeedDb;
  /** Fallback identity used by CLI conversations. */
  defaultParentId?: string;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** Optional LLM brain (research + grounded answers). Falls back offline without it. */
  llm?: LlmClient;
  /** Email sender. Defaults to a mock that just logs. */
  email?: EmailProvider;
}

const HELP_TEXT = [
  "Hi! I'm your school helper. I can learn about your family and their school, then help with what you need.",
  '',
  'I can help with:',
  "• School bus / transportation (incl. McKinney-Vento if you're homeless or displaced)",
  '• Parent-teacher conferences',
  '• Absences',
  '• Free & reduced meals',
  '• Enrollment, special education, language support, and more',
  '',
  'New here? Say "set up" and I\'ll learn about your kids and their school.',
  '',
  "(This is a demo — I won't actually submit anything to the school.)",
].join('\n');

const UNKNOWN_TEXT =
  `I'm not sure I can help with that. I can help with school bus / transportation (McKinney-Vento), parent-teacher conferences, absences, and meals. For anything else, the ${SOQUEL_ELEMENTARY.name} office can point you right: ${SOQUEL_ELEMENTARY.phone}.`;

/**
 * The orchestrator. Two flows share one conversation store:
 *
 *  - Action flows (schedule/absence/meals) run a state machine:
 *      idle ──detect──▶ clarifying ──complete──▶ confirming ──YES──▶ done
 *  - The McKinney-Vento / transportation flow runs its own guided conversation
 *    (see mckinney.ts) and, in v1, never takes action — it explains the path.
 *
 * If the parent clearly changes topic mid-flow, the agent pivots to the new
 * request instead of continuing a stale flow.
 */
export class Agent {
  private readonly store = new InMemoryStore();
  private readonly hydrated = new Set<string>();
  private readonly now: () => Date;

  constructor(private readonly opts: AgentOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  async handle(conversationId: string, text: string): Promise<AgentTurn> {
    const parentId = this.store.getParentId(conversationId) ?? this.opts.defaultParentId;
    if (!parentId) {
      return {
        text: "Hi! I couldn't link this number to a family account. Please ask your school to verify your contact info.",
        phase: 'idle',
      };
    }

    const ctx = this.buildToolContext(parentId);
    if (!ctx) {
      return { text: "I couldn't find your family record. Please contact your school.", phase: 'idle' };
    }

    // Defensive: a single message must never crash the loop.
    try {
      const record = this.store.ensure(conversationId, parentId);
      const state = record.state;
      this.store.appendHistory(conversationId, 'user', text.trim());

      // Remember a returning family from Postgres so it doesn't re-onboard.
      if (!this.hydrated.has(conversationId)) {
        this.hydrated.add(conversationId);
        if (!state.profile && !state.cases?.length) {
          try {
            const snap = await loadFamilySnapshot(parentId);
            if (snap.profile) state.profile = snap.profile;
            if (snap.cases?.length) state.cases = snap.cases;
          } catch (e) {
            console.error('[hydrate] error:', e);
          }
        }
      }

      let turn: AgentTurn;

      // Onboarding: learn the family + district, reconcile with law, propose help.
      if (state.onboarding) {
        const ob = advanceOnboarding(state.onboarding, text.trim());
        if (ob.done) {
          const district = await this.resolveDistrictAsync(ob.state.profile);
          const plan = finalizeOnboarding(ob.state.profile, district);
          this.save(conversationId, { phase: 'done', collected: {}, profile: ob.state.profile }, state);
          turn = { text: plan, phase: 'done' };
        } else {
          this.save(conversationId, { phase: 'clarifying', collected: {}, onboarding: ob.state, profile: ob.state.profile }, state);
          turn = { text: ob.text, phase: 'clarifying' };
        }
      } else if (state.attendance) {
        const at = advanceAttendance(state.attendance, text.trim());
        if (at.done && at.state.chosen) {
          const c = at.state.chosen;
          const cases = addCase(state.cases, makeCase({
            kind: c.category,
            summary: c.title,
            child: at.state.child,
            contact: c.contact.split(';')[0]?.trim(),
            reminder: c.reminder,
            status: 'open',
          }));
          this.save(conversationId, { phase: 'done', collected: {}, profile: state.profile, cases }, state);
          turn = { text: at.text, phase: 'done' };
        } else {
          this.save(conversationId, { phase: at.done ? 'done' : 'clarifying', collected: {}, attendance: at.done ? undefined : at.state, profile: state.profile }, state);
          turn = { text: at.text, phase: at.done ? 'done' : 'clarifying' };
        }
      } else if (state.mckinney) {
        const mc = advanceMckinney(state.mckinney, text.trim(), ctx.students);
        this.save(conversationId, { phase: mc.done ? 'done' : 'clarifying', collected: {}, mckinney: mc.done ? undefined : mc.state }, state);
        turn = { text: mc.text, phase: mc.done ? 'done' : 'clarifying' };
      } else {
        const r = await this.advance(state, text.trim(), ctx, this.store.getHistory(conversationId));
        this.save(conversationId, r.state, state);
        turn = r.turn;
      }

      if (state.pendingCall) {
        turn = { ...turn, callSchool: true };
        state.pendingCall = false;
      }

      // Refresh working memory every turn so the agent always knows what we're doing.
      const st = record.state;
      if (turn.callSchool || turn.callMe) {
        st.activeGoal = turn.callContext?.goal ?? 'resolve the school matter';
        st.lastAction = turn.callSchool
          ? `calling the school about ${turn.callContext?.issue ?? 'the matter'}`
          : 'showing a phone call';
      } else if (!st.activeGoal) {
        const latest = (st.cases ?? []).slice().reverse().find((c) => c.status !== 'resolved');
        if (latest) st.activeGoal = latest.summary;
      }
      if (turn.callContext?.issue && st.lastAction === 'showing a phone call') {
        st.lastAction = `calling the school about ${turn.callContext.issue}`;
      }

      this.store.appendHistory(conversationId, 'assistant', turn.text);
      return turn;
    } catch (err) {
      console.error('[school-agent] unexpected error:', err);
      return {
        text: "Sorry, something went wrong on my end. Let's try that again — or if you'd rather, call the school office and someone can help right away.",
        phase: 'idle',
      };
    }
  }

  bindParent(conversationId: string, parentId: string): void {
    this.store.bindParent(conversationId, parentId);
  }

  reset(conversationId: string): void {
    this.store.reset(conversationId);
  }

  /** Record a phone-call outcome into the family's case (from the Retell webhook). */
  logCallResult(conversationId: string, result: CallResult): CaseRecord[] {
    const record = this.store.ensure(conversationId, this.opts.defaultParentId ?? '');
    const rec = makeCase({
      kind: 'call',
      summary: result.summary ?? `Called the school${result.contact ? ` (${result.contact})` : ''}.`,
      contact: result.contact,
      reminder: result.next_step,
      status: 'open',
    });
    record.state.cases = addCase(record.state.cases, rec);
    return record.state.cases;
  }

  /** Persist the conversation's family profile + cases to Postgres (Supabase API). */
  async persist(conversationId: string): Promise<void> {
    const db = getSupabase();
    if (!db) return;
    const record = this.store.ensure(conversationId, this.opts.defaultParentId ?? '');
    const guardianId = record.parentId ?? this.opts.defaultParentId;
    if (!guardianId) return;
    const districtId = await ensureSeedDistrict();
    const { profile, cases } = record.state;
    if (profile) await saveFamilyProfile(guardianId, profile);
    for (const c of cases ?? []) await saveCaseRecord(guardianId, districtId, c);
  }

  // ── Step spine: plan → consent → execute → schedule (channel-agnostic) ──
  private readonly executor = new StepExecutor(buildAdapters());
  private readonly scheduler = new Scheduler();

  private resolveMode(): Mode {
    return process.env.AGENT_MODE === 'live' ? 'live' : 'demo';
  }

  /** How follow-ups + verify prompts reach the parent (set by the channel). */
  private parentSender: (text: string) => Promise<void> = async (t) => console.log('[parent]', t);

  setParentSender(fn: (text: string) => Promise<void>): void {
    this.parentSender = fn;
  }

  /** Fire any due follow-up / verify prompts to the parent. Returns how many fired. */
  async runScheduler(now: Date = new Date()): Promise<number> {
    const due = this.scheduler.due(now);
    for (const t of due) {
      await this.parentSender(
        t.verify
          ? (t.prompt ?? 'Any update on this?')
          : 'Quick follow-up — I\u2019m still on this and will chase the school. Anything new on your end?',
      );
    }
    return due.length;
  }

  /** Resolve the counterparty by role + mode. Demo NEVER resolves a real contact. */
  private resolveCounterparty(role: Counterparty['role'], mode: Mode): Counterparty {
    if (mode === 'demo') {
      return { role, name: 'Demo School Liaison', email: 'demo-liaison@example.com', phone: '+15550001111' };
    }
    switch (role) {
      case 'HOMELESS_LIAISON':
        return { role, name: LIAISON.name, email: LIAISON.email, phone: LIAISON.phone };
      case 'BUS_PASSES':
        return { role, name: BUS_PASSES.name, phone: BUS_PASSES.phone };
      case 'PRINCIPAL':
        return { role, name: SOQUEL_ELEMENTARY.principal, phone: SOQUEL_ELEMENTARY.phone };
      default:
        return { role, name: SOQUEL_ELEMENTARY.name, phone: SOQUEL_ELEMENTARY.phone };
    }
  }

  private buildExecContext(record: { state: ConversationState }, mode: Mode): ExecutionContext {
    return {
      mode,
      demoClockScale: 1440,
      parentPhone: process.env.CALL_ME_NUMBER,
      resolveCounterparty: (r, m) => this.resolveCounterparty(r, m),
      logAction: async (_caseId, a) => {
        record.state.cases = addCase(
          record.state.cases,
          makeCase({ kind: 'action', summary: a.content.slice(0, 120), status: 'open' }),
        );
        return 'action-' + Date.now().toString(36);
      },
      scheduleFollowUp: async (caseId, at, verify, prompt) => this.scheduler.schedule(caseId, at, verify, prompt),
      messageParent: async (text) => this.parentSender(text),
    };
  }

  /** Run the given steps through the executor (caller sets consent/executing). */
  async runSteps(steps: Step[], mode: Mode, state?: ConversationState): Promise<StepResult[]> {
    const record = { state: state ?? this.store.ensure('steps', this.opts.defaultParentId ?? '').state };
    const ctx = this.buildExecContext(record, mode);
    const results: StepResult[] = [];
    for (const s of steps) results.push(await this.executor.run({ ...s, status: 'executing' }, ctx));
    return results;
  }

  /** Plan the steps for an intent and run them all through the executor. */
  async runStepsFor(conversationId: string, intent: string, mode: Mode): Promise<StepResult[]> {
    const record = this.store.ensure(conversationId, this.opts.defaultParentId ?? '');
    const profile = record.state.profile;
    if (!profile) throw new Error('No family profile to plan from — onboard first.');

    const student = profile.children?.[0]?.name ?? 'your child';
    const counterparty = this.resolveCounterparty('HOMELESS_LIAISON', mode);
    const steps = planSteps({ intent, family: profile, student, counterparty });
    return this.runSteps(steps, mode);
  }

  private save(conversationId: string, next: ConversationState, prev: ConversationState): void {
    if (next.profile === undefined) next.profile = prev.profile;
    if (next.cases === undefined) next.cases = prev.cases;
    this.store.setState(conversationId, next);
  }

  /**
   * LLM tool-calling loop ("the brain"). Grounded tools (law, barriers, school
   * info, case memory) drive the resolution; falls back to the structured path
   * when the LLM is unavailable or the loop can't resolve.
   */
  private async brain(
    text: string,
    state: ConversationState,
    history: ChatMessage[],
  ): Promise<{ turn: AgentTurn; state: ConversationState } | null> {
    const llm = this.opts.llm;
    if (!llm?.enabled) return null;

    const deps: ToolDeps = {
      profile: state.profile,
      getCases: () => state.cases ?? [],
      appendCase: (rec: Omit<CaseRecord, 'id' | 'createdAt'>) => {
        state.cases = addCase(state.cases, makeCase(rec));
      },
      saveProfile: (p: FamilyProfile) => {
        state.profile = p;
      },
      proposeSteps: (steps) => {
        // Resolve each counterparty (real contact in live, sandbox in demo) so a
        // call/email never escalates for a missing number/email.
        state.pendingSteps = steps.map((s) => ({
          ...s,
          counterparty: {
            ...this.resolveCounterparty(s.counterparty.role, this.resolveMode()),
            ...s.counterparty,
          },
        }));
      },
      studentName: state.profile?.children[0]?.name,
    };

    console.log('[brain] invoked:', text.slice(0, 60));
    const messages: unknown[] = [...history];
    let guard = 0;
    while (guard < 6) {
      const res = await llm.chatWithTools(
        systemPrompt({ profile: state.profile, cases: state.cases, activeGoal: state.activeGoal, lastAction: state.lastAction }),
        messages,
        LLM_TOOLS,
        'auto',
      );
      if (!res) break;
      // If the model wants to call tools, do it — never return early on a preamble.
      if (res.calls?.length) {
        const assistantMsg = {
          role: 'assistant',
          content: null,
          tool_calls: res.calls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: c.arguments },
          })),
        };
        const results: unknown[] = [];
        for (const c of res.calls) {
          let out: string;
          try {
            out = await runTool(c.name, JSON.parse(c.arguments || '{}') as Record<string, unknown>, deps);
          } catch {
            out = 'tool error';
          }
          results.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ result: out }) });
        }
        messages.push(assistantMsg, ...results);
        guard++;
        continue;
      }
      if (res.text) {
        // If the model refuses to look something up ("can't browse / check the website"),
        // the agent does the web search itself and feeds the results back.
        if (isLookupRefusal(res.text) && guard < 4) {
          const srch = await runTool('web_search', { query: text }, deps);
          messages.push({
            role: 'user',
            content: `I looked this up online and found:\n${srch}\n\nUse this to answer the parent accurately.`,
          });
          guard++;
          continue;
        }
        return { turn: { text: res.text, phase: 'done' }, state };
      }
      break;
    }
    // Tool loop didn't resolve → fall back to a plain, grounded answer.
    console.log('[brain] → answerQuestion fallback');
    const district = state.profile?.school ? resolveDistrict(state.profile.school) : undefined;
    const ans = await llm.answerQuestion(text, state.profile, district);
    if (ans) return { turn: { text: ans, phase: 'done' }, state };
    return null;
  }

  private async resolveDistrictAsync(profile: FamilyProfile): Promise<DistrictProfile> {
    const input = profile.school ?? profile.district ?? '';
    if (this.opts.llm?.enabled) {
      const researched = await this.opts.llm.researchDistrict(input);
      if (researched) return researched;
    }
    return resolveDistrict(input);
  }

  private buildCallContext(state: ConversationState, hint?: string): CallContext {
    const profile = state.profile;
    const lastCase = (state.cases ?? []).slice().reverse().find((c) => c.kind !== 'call');
    const hinted = profile?.children?.find((ch) => hint?.toLowerCase().includes(ch.name.toLowerCase()));
    const nameFromHint = hint?.match(/\b([A-Z][a-z]{1,})\b/)?.[1];
    const child = hinted ?? profile?.children?.[0];
    const student = child?.name ?? lastCase?.child ?? (nameFromHint ?? 'your child');
    const grade = child?.grade ?? '';
    const school = profile?.school ?? 'your child\u2019s school';
    const district = profile?.district ?? '';
    const need = (profile?.needs ?? []).join(' and ');
    const notes = profile?.notes ?? '';
    const isTransport = /transport|bus|ride/.test(need) || /bus|route|far|transport|drive/.test(notes);
    const isMeals = /meal|food|lunch|breakfast/.test(need) || /meal|lunch|food/.test(notes);

    let rawIssue: string;
    let goal: string;
    if (isTransport) {
      rawIssue = /mom|other home|route|no longer|discontinued|far|sister|aunt|grandma/.test(notes)
        ? 'the bus cannot reliably get the student to school — the route no longer serves the other household and the family lives far away'
        : 'transportation to school';
      goal = 'find out what transportation support the school can provide so the student gets to school reliably';
    } else if (isMeals) {
      rawIssue = 'free or reduced-price meals';
      goal = 'make sure the student is getting meals at school';
    } else {
      rawIssue = hint?.trim() ?? lastCase?.summary ?? 'a school matter';
      goal = `resolve this for ${student}`;
    }

    let issue = rawIssue.replace(/^(it'?s\s+(for|about)|it is\s+(for|about)|for|about|regarding|going on with)\s+/i, '');
    if (student && student !== 'your child') issue = issue.replace(new RegExp(`^${student}[,\\s]+`, 'i'), '');
    issue = issue.charAt(0).toLowerCase() + issue.slice(1);

    const what_we_know = lastCase
      ? `${lastCase.kind} case: ${lastCase.summary}`
      : `The family is low-income and ${need ? `needs help with ${need}` : 'has an ongoing school matter'}. ${notes}`;

    return { parent_name: profile?.parentName ?? 'the parent', student, grade, school, district, issue, goal, what_we_know };
  }

  /** Brief for the voice call, built from the LIVE chat (history) + family context. */
  private async resolveCallBrief(
    state: ConversationState,
    history: ChatMessage[],
    hint?: string,
  ): Promise<CallContext> {
    const base = this.buildCallContext(state, hint);
    if (this.opts.llm?.enabled) {
      try {
        const b = await this.opts.llm.buildCallBrief(state.profile, history, hint ?? '');
        if (b) return { ...base, issue: b.issue, goal: b.goal, what_we_know: b.what_we_know || base.what_we_know };
      } catch {
        /* fall through to the deterministic brief */
      }
    }
    return base;
  }

  private buildToolContext(parentId: string): ToolContext | undefined {
    const parent = this.opts.db.parents.find((p) => p.id === parentId);
    if (!parent) return undefined;

    const students = this.opts.db.students.filter((s) => parent.studentIds.includes(s.id));
    const schoolId = students[0]?.schoolId;
    const school = this.opts.db.schools.find((s) => s.id === schoolId);
    if (!school) return undefined;

    const teachers = this.opts.db.teachers.filter((t) => t.schoolId === school.id);
    return {
      parent,
      students,
      school,
      teachers,
      sis: this.opts.sis,
      calendar: this.opts.calendar,
      meals: this.opts.meals,
      now: this.now(),
    };
  }

  private async advance(
    state: ConversationState,
    text: string,
    ctx: ToolContext,
    history: ChatMessage[],
  ): Promise<{ turn: AgentTurn; state: ConversationState }> {
    const roster: Roster = { students: ctx.students, teachers: ctx.teachers };

    // If we're mid-flow and the parent clearly asks for something else, pivot.
    if ((state.phase === 'clarifying' || state.phase === 'confirming') && state.intent) {
      const fresh = await this.opts.intentEngine.detect(text);
      if (fresh.name !== 'unknown' && fresh.name !== state.intent) {
        return this.startDetectedIntent(fresh.name, text, ctx, roster, state.profile);
      }
    }

    // 1. Confirmation gate.
    if (state.phase === 'confirming' && state.pendingPlan && state.intent) {
      const answer = parseYesNo(text);
      if (answer === true) {
        try {
          const plan = state.pendingPlan;
          const profile = state.profile ?? { children: [], needs: [], challenges: [] };
          const student = state.profile?.children?.[0]?.name ?? 'your child';
          const mode = this.resolveMode();
          const counterparty = this.resolveCounterparty('OTHER', mode);
          const steps = planSteps({
            intent: state.intent,
            family: profile,
            student,
            counterparty,
            details: plan.slots as Record<string, unknown>,
          });
          const results = await this.runSteps(steps, mode, state);
          const summary = results.map((r) => r.parentSummary).join('\n');
          return {
            turn: {
              text: `Done!\n${summary}\n\n(Just so you know: this is a demo build — nothing was actually sent to the school.)\nIs there anything else I can help with?`,
              phase: 'done',
            },
            state: { phase: 'done', collected: {} },
          };
        } catch (err) {
          return {
            turn: { text: friendlyError(err), phase: 'idle' },
            state: { phase: 'idle', collected: {} },
          };
        }
      }
      if (answer === false) {
        const first = SLOT_SPECS[state.intent][0]!;
        const q = this.questionFor(first, roster, ctx);
        return {
          turn: { text: `No problem. ${q.text}`, suggestions: q.suggestions, phase: 'clarifying' },
          state: { phase: 'clarifying', intent: state.intent, collected: {} },
        };
      }
      return {
        turn: {
          text: "Sorry, I didn't catch that. Reply YES to confirm or NO to change.",
          suggestions: yesNo(),
          phase: 'confirming',
        },
        state,
      };
    }

    // 2. Continue collecting slots.
    if (state.phase === 'clarifying' && state.intent) {
      const intent = state.intent;
      const collected = mergeSlots(state.collected, extractSlots(intent, text, roster, this.now()));
      const missing = missingRequired(intent, collected);
      if (missing.length === 0) {
        const plan = this.buildPlan(intent, collected, ctx);
        return {
          turn: {
            text: `${plan.summary}\n\nReply YES to confirm or NO to change.`,
            suggestions: yesNo(),
            phase: 'confirming',
          },
          state: { phase: 'confirming', intent, collected, pendingPlan: plan },
        };
      }
      const q = this.questionFor(missing[0]!, roster, ctx);
      return {
        turn: { text: q.text, suggestions: q.suggestions, phase: 'clarifying' },
        state: { phase: 'clarifying', intent, collected },
      };
    }

    // 3. Fresh request. LLM-first: the brain drives every message when available.
    const detected = await this.opts.intentEngine.detect(text);

    // Step consent gate: the brain proposed steps; the parent's YES/NO resolves them.
    if (state.pendingSteps?.length) {
      const answer = parseYesNo(text);
      if (answer === true) {
        const results = await this.runSteps(state.pendingSteps, this.resolveMode(), state);
        const summary = results.map((r) => r.parentSummary).join('\n');
        return { turn: { text: `Done!\n${summary}`, phase: 'done' }, state: { phase: 'done', collected: {}, cases: state.cases, pendingSteps: undefined } };
      }
      if (answer === false) {
        return { turn: { text: 'No problem — nothing was sent. What would you like to change?', phase: 'idle' }, state: { phase: 'idle', collected: {}, cases: state.cases, pendingSteps: undefined } };
      }
      return { turn: { text: 'Reply YES to send this, or NO to change.', suggestions: yesNo(), phase: 'done' }, state };
    }

    if (detected.name === 'call_me') {
      return {
        turn: { text: "Alright — calling you now. Pick up and I'll show you how I'd handle that on a real call.", callMe: true, phase: 'done' },
        state: { phase: 'done', collected: {}, cases: state.cases },
      };
    }
    // Clarify-first: if we asked what the call is about, treat this reply as the brief.
    if (state.awaitingCallClarify) {
      state.awaitingCallClarify = false;
      const cc = await this.resolveCallBrief(state, history, text.trim());
      return { turn: { text: 'Got it — calling the school now about that and I\u2019ll report back.', callSchool: true, callContext: cc, phase: 'done' }, state: { phase: 'done', collected: {}, cases: state.cases } };
    }

    if (detected.name === 'call_school') {
      const cc = await this.resolveCallBrief(state, history);
      if (cc.issue && cc.issue !== 'this matter') {
        return { turn: { text: `Calling the school now about ${cc.issue}. I\u2019ll share what they say.`, callSchool: true, callContext: cc, phase: 'done' }, state: { phase: 'done', collected: {}, cases: state.cases } };
      }
      return { turn: { text: 'Happy to call. Which child is this about, and what\u2019s the appointment or issue? Tell me and I\u2019ll call the school with that.', phase: 'clarifying' }, state: { phase: 'clarifying', collected: {}, awaitingCallClarify: true, cases: state.cases } };
    }

    if (this.opts.llm?.enabled) {
      const brain = await this.brain(text, state, history);
      if (brain) return brain;
    }

    // Fallback (no key, or the LLM couldn't resolve): structured flows.
    if (detected.name === 'case_status') {
      return { turn: { text: openCaseSummary(state.cases), phase: 'done' }, state: { phase: 'done', collected: {}, cases: state.cases } };
    }
    if (detected.name === 'unknown') {
      return { turn: { text: UNKNOWN_TEXT, phase: 'idle' }, state: { phase: 'idle', collected: {}, cases: state.cases } };
    }
    return this.startDetectedIntent(detected.name, text, ctx, roster, state.profile);
  }

  /** Start a freshly-detected intent from scratch (used for new requests and pivots). */
  private startDetectedIntent(
    name: IntentName,
    text: string,
    ctx: ToolContext,
    roster: Roster,
    profile: FamilyProfile | undefined,
  ): { turn: AgentTurn; state: ConversationState } {
    if (name === 'list_students') {
      return { turn: { text: this.rosterText(ctx), phase: 'done' }, state: { phase: 'done', collected: {}, profile } };
    }
    if (name === 'help') {
      return { turn: { text: HELP_TEXT, phase: 'done' }, state: { phase: 'done', collected: {}, profile } };
    }
    if (name === 'onboarding') {
      const ob = openOnboarding();
      return {
        turn: { text: ob.text, phase: 'clarifying' },
        state: { phase: 'clarifying', collected: {}, onboarding: ob.state, profile },
      };
    }
    if (name === 'attendance_issue') {
      const ob = openAttendance(profile?.children[0]?.name);
      return {
        turn: { text: ob.text, phase: 'clarifying' },
        state: { phase: 'clarifying', collected: {}, attendance: ob.state, profile },
      };
    }
    if (name === 'mckinney_vento_bus') {
      const mc = openMckinney();
      return {
        turn: { text: mc.text, phase: 'clarifying' },
        state: { phase: 'clarifying', collected: {}, mckinney: mc.state, profile },
      };
    }
    if (name === 'school_info') {
      const answer = answerSchoolInfo(text) ?? UNKNOWN_TEXT;
      return { turn: { text: answer, phase: 'done' }, state: { phase: 'done', collected: {}, profile } };
    }
    if (name === 'demo_status') {
      return {
        turn: {
          text: "Honest answer: no — this is a demo build, so nothing I do actually reaches the school. I only explain the steps and give you the real contacts to call. A real version would submit it to the district for you.",
          phase: 'done',
        },
        state: { phase: 'done', collected: {}, profile },
      };
    }
    if (isActionIntent(name)) {
      const collected = extractSlots(name, text, roster, this.now());
      const missing = missingRequired(name, collected);
      if (missing.length === 0) {
        const plan = this.buildPlan(name, collected, ctx);
        return {
          turn: {
            text: `${plan.summary}\n\nReply YES to confirm or NO to change.`,
            suggestions: yesNo(),
            phase: 'confirming',
          },
          state: { phase: 'confirming', intent: name, collected, pendingPlan: plan, profile },
        };
      }
      const q = this.questionFor(missing[0]!, roster, ctx);
      return {
        turn: { text: q.text, suggestions: q.suggestions, phase: 'clarifying' },
        state: { phase: 'clarifying', intent: name, collected, profile },
      };
    }
    return { turn: { text: UNKNOWN_TEXT, phase: 'idle' }, state: { phase: 'idle', collected: {}, profile } };
  }

  private questionFor(
    spec: SlotSpec,
    roster: Roster,
    ctx: ToolContext,
  ): { text: string; suggestions?: Suggestion[] } {
    if (spec.kind === 'student') {
      const lines = ctx.students.map((s, i) => {
        const teacher = ctx.teachers.find((t) => t.id === s.homeroomTeacherId);
        return `${i + 1}) ${s.firstName} — Grade ${s.grade}${teacher ? ` (${teacher.lastName})` : ''}`;
      });
      return {
        text: `${spec.question}\n${lines.join('\n')}\n\n(You can say "both".)`,
        suggestions: [{ kind: 'quickReplies', options: ctx.students.map((s) => s.firstName) }],
      };
    }
    if (spec.kind === 'teacher') {
      const lines = ctx.teachers.map((t, i) => `${i + 1}) ${fullName(t)} — ${t.subject}`);
      return {
        text: `${spec.question}\n${lines.join('\n')}`,
        suggestions: [{ kind: 'quickReplies', options: ctx.teachers.map((t) => t.lastName) }],
      };
    }
    if (spec.kind === 'choice' && spec.choices) {
      const lines = spec.choices.map((c, i) => `${i + 1}) ${c}`);
      return {
        text: `${spec.question}\n${lines.join('\n')}`,
        suggestions: [{ kind: 'quickReplies', options: spec.choices }],
      };
    }
    return { text: spec.question };
  }

  private buildPlan(intent: ActionIntent, collected: CollectedSlots, ctx: ToolContext): Plan {
    const ids = getStudentIds(collected);
    const kids = ctx.students.filter((s) => ids.includes(s.id));
    const names = kids.map((s) => s.firstName).join(' and ') || 'your child';
    const firstKid = kids[0];

    let summary: string;
    switch (intent) {
      case 'schedule_conference': {
        const teacherId = getString(collected, 'teacherId');
        const teacher =
          (teacherId && ctx.teachers.find((t) => t.id === teacherId)) ||
          ctx.teachers.find((t) => t.id === firstKid?.homeroomTeacherId);
        const when = getString(collected, 'when') ?? 'next week';
        const parsedWhen = parseDateHint(when, ctx.now);
        const whenDisplay = parsedWhen ? formatDate(parsedWhen) : when;
        const topic = getString(collected, 'topic');
        summary = `Here's what I'll do:\n• Schedule a parent-teacher conference for ${names} with ${teacher ? fullName(teacher) : 'their teacher'}${topic ? ` about "${topic}"` : ''} (around ${whenDisplay}).`;
        break;
      }
      case 'report_absence': {
        const date = getString(collected, 'date') ?? 'the date you choose';
        const reason = getString(collected, 'reason') ?? 'not specified';
        const fullDay = getBool(collected, 'fullDay') ?? true;
        summary = `Here's what I'll do:\n• Mark ${names} absent on ${formatDate(date)} (${fullDay ? 'full day' : 'half day'}) — reason: ${reason}.`;
        break;
      }
      case 'request_meal_voucher': {
        const program = getString(collected, 'program');
        const label =
          program === 'free_reduced_application'
            ? 'Submit a free & reduced meal application'
            : 'Request a meal voucher';
        summary = `Here's what I'll do:\n• ${label} for ${names}.`;
        break;
      }
    }
    return { intent, slots: collected, summary };
  }

  private rosterText(ctx: ToolContext): string {
    const lines = ctx.students.map((s) => {
      const teacher = ctx.teachers.find((t) => t.id === s.homeroomTeacherId);
      return `• ${fullName(s)} — Grade ${s.grade}${teacher ? ` (${teacher.lastName})` : ''}`;
    });
    return `Here are the children on your account:\n${lines.join('\n')}`;
  }
}

function parseYesNo(text: string): boolean | null {
  if (/^(y|yes|yeah|yep|sure|ok|okay|confirm|go ahead|do it|please do)\b/i.test(text)) return true;
  if (/^(n|no|nope|cancel|change|not that|stop|hold on)\b/i.test(text)) return false;
  return null;
}

function yesNo(): Suggestion[] {
  return [{ kind: 'quickReplies', options: ['Yes', 'No'] }];
}

function mergeSlots(base: CollectedSlots, incoming: CollectedSlots): CollectedSlots {
  const out: CollectedSlots = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

function friendlyError(err: unknown): string {
  if (err instanceof AgentError) return err.message;
  return 'Something went wrong on my end. Please try again, or call the school office.';
}

/** True when the model gave up saying it can't look something up online. */
function isLookupRefusal(s: string): boolean {
  const a = "['’]";
  return new RegExp(
    `can${a}?t (browse|search|look|access)|no (internet|web) (access|connection)|don${a}?t have (internet|web|live|access)|cannot (browse|search|access)|unable to (browse|search|look up|access)|check (the )?(school|district|official|website)|visit (the )?(school|district|website)|i don${a}?t (have|know) (internet|web|current|live)`,
    'i',
  ).test(s);
}
