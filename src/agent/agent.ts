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
import { loadFamilyMemory, saveFamilyMemory, addGetting, startInitiative } from '../integrations/family-memory.js';
import { deriveFamilyMemory } from '../domain/memory.js';
import { startVerification, verifyCode, isVerified, sendVerificationCode } from '../integrations/verification.js';
import { KnowledgeGraph, autoResearchDistrict } from '../knowledge/graph.js';
import { resolveAnyDistrict } from '../knowledge/discovery.js';
import { researchDistrictNodes, inferCategory } from '../knowledge/research.js';
import type { CandidateNode } from '../knowledge/research.js';
import { searchSchoolGraph, chainSummary } from '../knowledge/resource-graph.js';
import { buildPreCallBrief } from '../knowledge/precall.js';
import { embeddingsConfigured, embedTexts } from '../integrations/embeddings.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from '../domain/knowledge.js';
import { answerSchoolInfo } from '../knowledge/school-info.js';
import { resolveDistrict, researchDistrictProfile, districtIdFromName, getResearchedDistrict, getResearchedDistrictById, type DistrictProfile } from '../knowledge/districts.js';
import { StepExecutor } from './steps/executor.js';
import { planSteps } from './steps/planner.js';
import { buildAdapters } from './steps/registry.js';
import {
  FollowUpEngine,
  DEFAULT_FOLLOWUP_POLICY,
  isQuietHours,
  type FollowUpRunResult,
  type FollowUpPolicy,
} from './followup.js';
import { detectGaps, staleKnowledgeNodes } from './gaps.js';
import type { Counterparty, Mode, StepResult, ExecutionContext, Step } from './steps/types.js';
import type { SeedDb } from '../seed.js';
import { provisionFamily } from '../seed.js';
import { persistProvisionedFamily } from '../integrations/identity.js';
import { executeTool } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
import type { IntentEngine } from './intent/engine.js';
import { hypothesesFromLLM, buildIntention, decide, concentrated, hypothesize, askFromUnknowns, groundIntention, extractGrounding } from './intention.js';
import type { Hypothesis, Intention, SubClaimKind } from './intention.js';
import { InMemoryStore, type ChatMessage } from './memory.js';
import { resolveLocale, localizeFollowup, detectLocale } from '../lib/bilingual.js';
import { createFollowUpStore } from '../integrations/followup-store.js';
import { advanceMckinney, openMckinney } from './mckinney.js';
import { advanceOnboarding, finalizeOnboarding, openOnboarding } from './onboarding.js';
import { advanceAttendance, openAttendance } from './attendance.js';
import { addCase, makeCase, openCaseSummary } from './family.js';
import { LLM_TOOLS, runTool, systemPrompt, pendingActionsSummary, type ToolDeps } from './tools.js';
import { LlmClient } from './llm.js';
import { extractSlots, missingRequired, SLOT_SPECS, type Roster, type SlotSpec } from './slots.js';
import { initialState, type ConversationState, type Plan } from './state.js';
import { assessKnowledgeNode } from './verify.js';
import { findSkillFor, skillSummary } from './skills.js';

/** Tools that take long enough that we tell the parent we're on it. */
const SLOW_TEXT_TOOLS = new Set(['web_search', 'web_fetch', 'browser_open', 'browser_observe', 'browser_act', 'browser_extract', 'browser_fill', 'browser_vision', 'extract_pdf', 'pdf_fields', 'pdf_fill']);

/** Varied, human "stepping away to look this up" acknowledgments (no repeats). */
const BUSY_LINES = [
  'One sec, let me check that.',
  'On it — give me a moment.',
  'Let me pull that up…',
  "Hang tight, I'm looking now.",
  'Give me a minute.',
  'Looking into it…',
  'Let me dig into that for you.',
  'On it now.',
  'Checking for you — one moment.',
  "One moment, I'm on it.",
];
let lastBusyLine = -1;
function nextBusyLine(): string {
  let i = lastBusyLine;
  while (i === lastBusyLine) i = Math.floor(Math.random() * BUSY_LINES.length);
  lastBusyLine = i;
  return BUSY_LINES[i]!;
}

/** School name with its city/state disambiguation, so research targets the right one. */
function qualifiedSchool(p?: FamilyProfile): string {
  if (!p?.school) return 'their school';
  return p.location?.trim() ? `${p.school} ${p.location.trim()}` : p.school;
}

/** Parent-facing description of an action step, incl. its concrete target + data (informed consent). */
function describeStepWithTarget(step: Step): string {
  const base = step.successCondition.describe;
  const p = step.payload;
  if (p.channel === 'browser') {
    const data = p.fields?.length ? ` — ${p.fields.map((f) => `${f.label}: ${f.value}`).join(', ')}` : '';
    return `${base} at ${p.url}${data}`;
  }
  if (p.channel === 'email') {
    const to = step.counterparty.email ? ` to ${step.counterparty.email}` : '';
    return `${base}${to} — "${p.subject}"`;
  }
  if (p.channel === 'form') {
    return `${base} — form ${p.formId}`;
  }
  return base;
}

/** Scan candidate nodes for the first evidence matching `pattern`; return `{value, source}`. */

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
  /** True when this turn RESOLVED something for the family (a win) — the channel reacts accordingly. */
  resolved?: boolean;
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
  /** When true, a first-contact phone must pass OTP before onboarding. */
  requireVerification?: boolean;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** Optional LLM brain (research + grounded answers). Falls back offline without it. */
  llm?: LlmClient;
  /** Small/specialized model for research/extraction (cheap tier). Defaults to `llm`. */
  researchLlm?: LlmClient;
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
  `I'm not sure I can help with that. I can help with school bus / transportation (McKinney-Vento), parent-teacher conferences, absences, and meals. For anything else, your school's office can point you right.`;

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
  private readonly requireVerification: boolean;

  constructor(private readonly opts: AgentOptions) {
    this.now = opts.now ?? (() => new Date());
    this.requireVerification = opts.requireVerification ?? process.env.REQUIRE_VERIFICATION !== 'false';
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

    // Tag this turn so any follow-ups scheduled while handling it reach THIS family,
    // and record that they just messaged us so proactive pings don't interrupt.
    this.currentConversationId = conversationId;
    this.lastMessageAt.set(conversationId, Date.now());

    // Defensive: a single message must never crash the loop.
    try {
      const record = this.store.ensure(conversationId, parentId);
      const state = record.state;
      this.store.appendHistory(conversationId, 'user', text.trim());

      // ── Consent resolution for a pending consequential action ───────────────
      // If we proposed consent-gated steps (intelligence layer or brain) and the parent is now
      // replying, this message is consent resolution ONLY. Anything that isn't a strict whole-message
      // YES or NO EXPIRES the proposal, so a stray "ok thanks" (continuing some other exchange) can
      // never fire a stale submission. We clear the LIVE `state.pendingSteps` — not just write a new
      // object via save() — so nothing downstream (advance/brain) can ever see it again.
      if (state.pendingSteps?.some((s) => s.requiresConsent)) {
        if (isStrictConsent(text)) {
          const steps = state.pendingSteps;
          state.pendingSteps = undefined;
          const results = await this.runSteps(steps, this.resolveMode(), state);
          const summary = results.map((r) => r.parentSummary).join('\n');
          this.save(conversationId, { phase: 'done', collected: {}, pendingSteps: undefined }, state);
          return { text: `Done!\n${summary}`, phase: 'done', resolved: true };
        }
        if (isStrictDecline(text)) {
          state.pendingSteps = undefined;
          state.phase = 'idle';
          this.save(conversationId, { phase: 'idle', collected: {}, pendingSteps: undefined }, state);
          return { text: 'No problem — I won\u2019t send anything. What else can I help with?', phase: 'idle' };
        }
        // Not a clear yes/no: the parent changed subject or wasn't consenting. Expire on the LIVE
        // object and fall through to respond to the NEW message — never loop on "reply yes/no".
        state.pendingSteps = undefined;
        state.phase = 'idle';
        this.save(conversationId, { phase: 'idle', collected: {}, pendingSteps: undefined }, state);
      }

      // ── Phone + OTP identity ────────────────────────────────────────────────
      // Phone = parent ID. When verification is on and this number isn't verified,
      // gate onboarding behind a one-time SMS code (parent replies the code over
      // iMessage to prove they own the number). On by default (REQUIRE_VERIFICATION=false disables).
      if (this.requireVerification && ctx.parent.phone && !(await isVerified(ctx.parent.phone))) {
        if (!state.verify) {
          const started = await startVerification(ctx.parent.phone);
          if (started.ok) {
            await sendVerificationCode(ctx.parent.phone, started.code).catch(() => {});
            this.save(conversationId, { phase: 'clarifying', collected: {}, verify: { phone: ctx.parent.phone } }, state);
            return {
              text: "To make sure it's you, I texted a 6-digit code to your number. Reply with the code to continue.",
              phase: 'clarifying',
            };
          }
        } else {
          const reply = text.trim();
          if (/^\d{6}$/.test(reply)) {
            const r = await verifyCode(ctx.parent.phone, reply);
            if (r.ok) {
              this.save(conversationId, { phase: 'idle', collected: {}, verify: undefined }, state);
              return { text: "Thanks — you're confirmed. What can I help with?", phase: 'idle' };
            }
            return { text: "That code didn't work. Reply with the 6-digit code I texted, or say 'resend'.", phase: 'clarifying' };
          }
          if (/^resend$/i.test(reply)) {
            const started = await startVerification(ctx.parent.phone);
            if (started.ok) await sendVerificationCode(ctx.parent.phone, started.code).catch(() => {});
            return { text: "I sent you a new code. Reply with the 6-digit code to continue.", phase: 'clarifying' };
          }
          return { text: "Reply with the 6-digit confirmation code I texted to your number, or say 'resend'.", phase: 'clarifying' };
        }
      }

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
        // The family's continuing memory graph (needs/getting/initiatives/issues).
        if (!state.memory) {
          try {
            const memory = await loadFamilyMemory(parentId);
            if (memory) {
              state.memory = deriveFamilyMemory(state.profile, state.cases ?? []);
              // Keep externally-recorded getting/initiatives (may be richer than derived).
              state.memory.getting = memory.getting ?? state.memory.getting;
              state.memory.initiatives = memory.initiatives ?? state.memory.initiatives;
            } else {
              state.memory = deriveFamilyMemory(state.profile, state.cases ?? []);
            }
          } catch (e) {
            console.error('[hydrate] memory error:', e);
          }
        }
      }

      // Bilingual: remember the family's preferred language (Spanish is first-class,
      // and never downgrades back off once set). The LLM also matches per-message.
      if (state.profile) {
        const detected = detectLocale(text);
        if (state.profile.locale !== 'es') state.profile = { ...state.profile, locale: detected };
      }

      let turn: AgentTurn;

      // Fresh family (created for an unknown phone, no children yet): onboard.
      const freshFamily =
        this.opts.db.parents.some((p) => p.id === parentId && p.studentIds.length === 0) &&
        !state.onboarding &&
        !state.profile;

      // Onboarding: learn the family + district, reconcile with law, propose help.
      if (freshFamily) {
        const ob = openOnboarding();
        this.save(conversationId, { phase: 'clarifying', collected: {}, onboarding: ob.state, profile: ob.state.profile }, state);
        turn = { text: ob.text, phase: 'clarifying' };
      } else if (state.onboarding) {
        const ob = advanceOnboarding(state.onboarding, text.trim());
        if (ob.done) {
          const district = await this.resolveDistrictAsync(ob.state.profile);
          // Persist the resolved school type so the entitlement audit + system
          // prompt don't over-claim public-school programs for a private/unknown school.
          ob.state.profile.schoolType = district.type;
          // Materialize the parent + students from the profile (true fresh start),
          // and persist them (durable, SIS-free).
          provisionFamily(this.opts.db, parentId, ob.state.profile);
          await persistProvisionedFamily(this.opts.db, parentId);
          const plan = finalizeOnboarding(ob.state.profile, district);
          this.save(conversationId, { phase: 'done', collected: {}, profile: ob.state.profile, awaitingCallDemo: true }, state);
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
        const mc = advanceMckinney(state.mckinney, text.trim(), ctx.students, state.profile ? this.researchedDistrict(state.profile) ?? resolveDistrict(state.profile.school ?? state.profile.district ?? '') : undefined);
        this.save(conversationId, { phase: mc.done ? 'done' : 'clarifying', collected: {}, mckinney: mc.done ? undefined : mc.state }, state);
        turn = { text: mc.text, phase: mc.done ? 'done' : 'clarifying' };
      } else {
        const r = await this.advance(state, text.trim(), ctx, this.store.getHistory(conversationId), parentId);
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

  /** Test/dev hook: inject a conversation state (e.g. a pre-set pendingSteps) so the consent flow can
   * be regression-tested without a full OTP/onboarding run. */
  setStateForTest(conversationId: string, state: ConversationState): void {
    this.store.setState(conversationId, state);
  }
  /** Test/dev hook: read a conversation's current state. */
  getStateForTest(conversationId: string): ConversationState | undefined {
    return this.store.getState(conversationId);
  }

  /** Persist the conversation's family profile + cases to Postgres (Supabase API). */
  async persist(conversationId: string): Promise<void> {
    const db = getSupabase();
    if (!db) return;
    const record = this.store.ensure(conversationId, this.opts.defaultParentId ?? '');
    const guardianId = record.parentId ?? this.opts.defaultParentId;
    if (!guardianId) return;
    const { profile, cases, memory } = record.state;
    const districtId = await ensureSeedDistrict(
      profile?.districtId || profile?.district
        ? { id: profile.districtId ?? districtIdFromName(profile.district ?? profile.school ?? ''), name: profile.district ?? profile.school ?? 'School', state: profile.location?.slice(-2) ?? 'CA' }
        : undefined,
    );
    if (profile) await saveFamilyProfile(guardianId, profile);
    for (const c of cases ?? []) await saveCaseRecord(guardianId, districtId, c);
    try {
      await saveFamilyMemory(guardianId, memory ?? deriveFamilyMemory(profile, cases ?? []));
    } catch (e) {
      console.error('[persist] family-memory error:', e);
    }
  }

  // ── Step spine: plan → consent → execute → schedule (channel-agnostic) ──
  private readonly executor = new StepExecutor(buildAdapters());
  // Durable follow-up queue when Supabase is configured, else in-memory.
  private readonly followups = new FollowUpEngine(createFollowUpStore() ?? undefined);
  // Grounded per-district knowledge graph (verifiable RAG corpus).
  private readonly knowledge = new KnowledgeGraph();

  /** Per-conversation messenger (the Spectrum space) so background pings reach the right family. */
  private readonly spaceMessengers = new Map<string, (text: string) => Promise<void>>();
  /** Last time each family sent us a message (for cooldown). */
  private readonly lastMessageAt = new Map<string, number>();
  /** Proactive pings sent today, per conversation. */
  private readonly sentToday = new Map<string, { day: string; count: number }>();
  /** Which gap alerts we've already raised today, per conversation (avoid repeat). */
  private readonly gapAlerts = new Map<string, { day: string; labels: Set<string> }>();
  /** The conversation being handled right now (so scheduled follow-ups are tagged correctly). */
  private currentConversationId = '';

  private resolveMode(): Mode {
    return process.env.AGENT_MODE === 'live' ? 'live' : 'demo';
  }

  /** How follow-ups + verify prompts reach the parent (set by the channel). */
  private parentSender: (text: string) => Promise<void> = async (t) => console.log('[parent]', t);

  setParentSender(fn: (text: string) => Promise<void>): void {
    this.parentSender = fn;
  }

  /** Register the messenger for a conversation (the family's iMessage space). */
  registerConversation(conversationId: string, send: (text: string) => Promise<void>): void {
    const logged = (text: string) => {
      console.log(`[out] ${text}`);
      return send(text);
    };
    this.spaceMessengers.set(conversationId, logged);
    this.parentSender = logged; // keep the in-band path working too
  }

  /** Send a message to a specific conversation (e.g. a voice→text handoff). */
  async sendToConversation(conversationId: string, text: string): Promise<boolean> {
    const send = this.spaceMessengers.get(conversationId);
    if (!send) {
      console.warn('[agent] no messenger registered for', conversationId);
      return false;
    }
    await send(text);
    return true;
  }

  /** Run parent-approved voice actions and return the parent-facing summary. */
  async executeVoiceSteps(conversationId: string, steps: Step[]): Promise<string> {
    const results = await this.runSteps(steps, this.resolveMode(), undefined, conversationId);
    return results.map((r) => r.parentSummary).join('\n') || 'Done.';
  }

  /** Record an inbound message (used BEFORE the proactive pass so cooldown kicks in). */
  noteInbound(conversationId: string): void {
    this.currentConversationId = conversationId;
    this.lastMessageAt.set(conversationId, Date.now());
  }

  /** Localized text for a follow-up body. */
  private localize(conversationId: string, text: string): string {
    const state = this.store.getState(conversationId);
    return localizeFollowup(text, resolveLocale(state?.profile?.locale));
  }

  private scheduleFollowUp(
    conversationId: string,
    caseId: string,
    at: Date,
    verify: boolean,
    prompt?: string,
  ): void {
    const kind = verify ? 'verify' : 'chase';
    const body = verify ? this.localize(conversationId, prompt ?? 'Any update on this?') : '';
    this.followups.schedule({ conversationId, caseId, kind, dueAt: at, body });
  }

  /**
   * The background "advocate" pass. Runs on a timer (and on each inbound message)
   * to fire relevant, throttled follow-ups for every family. Never pings a family
   * for an agent-side chase, respects quiet hours, cooldown, and a daily cap.
   */
  async runProactive(now: Date = new Date()): Promise<FollowUpRunResult> {
    const policy: FollowUpPolicy = {
      maxPerFamilyPerDay: Number(process.env.PROACTIVE_MAX_PER_DAY) || DEFAULT_FOLLOWUP_POLICY.maxPerFamilyPerDay,
      cooldownMs: Number(process.env.PROACTIVE_COOLDOWN_MS) || DEFAULT_FOLLOWUP_POLICY.cooldownMs,
      quietHours: {
        start: Number(process.env.PROACTIVE_QUIET_START) || DEFAULT_FOLLOWUP_POLICY.quietHours.start,
        end: Number(process.env.PROACTIVE_QUIET_END) || DEFAULT_FOLLOWUP_POLICY.quietHours.end,
      },
      maxDueDays: Number(process.env.PROACTIVE_MAX_DUE_DAYS) || DEFAULT_FOLLOWUP_POLICY.maxDueDays,
    };
    const dayKey = () => now.toISOString().slice(0, 10);
    const sentCount = (conversationId: string) =>
      this.sentToday.get(conversationId)?.day === dayKey() ? this.sentToday.get(conversationId)!.count : 0;
    const bumpSent = (conversationId: string) => {
      const cur = this.sentToday.get(conversationId);
      this.sentToday.set(conversationId, { day: dayKey(), count: cur?.day === dayKey() ? cur.count + 1 : 1 });
    };
    const lastMessage = (conversationId: string) => {
      const t = this.lastMessageAt.get(conversationId);
      return t ? new Date(t) : undefined;
    };

    const result = await this.followups.run({
      now,
      policy,
      isCaseResolved: (conversationId, caseId) =>
        this.followups.isResolved(this.store.getState(conversationId)?.cases, caseId),
      lastMessageAt: lastMessage,
      sentToday: sentCount,
      messenger: async (conversationId, text) => {
        const send = this.spaceMessengers.get(conversationId) ?? this.parentSender;
        await send(text);
      },
      recordSent: bumpSent,
    });

    // ── Always-on advocate: surface actionable gaps (throttled, never repeated) ──
    for (const conversationId of this.spaceMessengers.keys()) {
      const st = this.store.getState(conversationId);
      const profile = st?.profile;
      if (!profile) continue;
      const gaps = detectGaps(profile, st?.cases ?? [], st?.memory?.getting ?? []);
      const top = gaps[0];
      if (!top) continue;
      if (isQuietHours(now, policy.quietHours)) continue;
      const last = lastMessage(conversationId);
      if (last && now.getTime() - last.getTime() < policy.cooldownMs) continue;
      if (sentCount(conversationId) >= policy.maxPerFamilyPerDay) continue;
      const rec = this.gapAlerts.get(conversationId);
      if (rec?.day === dayKey() && rec.labels.has(top.id)) continue;

      const send = this.spaceMessengers.get(conversationId) ?? this.parentSender;
      await send(this.localize(conversationId, top.message)).catch((e) =>
        console.error('[gap] send failed:', (e as Error)?.message ?? e),
      );
      bumpSent(conversationId);
      const cur = this.gapAlerts.get(conversationId);
      this.gapAlerts.set(conversationId, {
        day: dayKey(),
        labels: new Set([...(cur?.day === dayKey() ? cur.labels : []), top.id]),
      });
      console.log(`[gap] alerted ${conversationId}: ${top.title}`);
    }

    // ── Freshness: flag stale knowledge nodes for re-verification ─────────────
    const maxAgeDays = Number(process.env.KNOWLEDGE_STALE_DAYS) || 30;
    for (const conversationId of this.spaceMessengers.keys()) {
      const district = this.store.getState(conversationId)?.profile?.district;
      if (!district) continue;
      const nodes = await this.knowledge.get(resolveAnyDistrict(district).id).catch(() => []);
      const stale = staleKnowledgeNodes(nodes, maxAgeDays);
      if (stale.length) console.log(`[freshness] ${stale.length} stale node(s) for ${district} (re-crawl next)`);
    }

    if (result.fired) console.log(`[proactive] sent ${result.fired} follow-up(s)`);
    if (result.skipped.length) {
      const by = new Map<string, number>();
      for (const s of result.skipped) by.set(s.reason, (by.get(s.reason) ?? 0) + 1);
      console.log('[proactive] skipped:', [...by.entries()].map(([k, v]) => `${k}=${v}`).join(', '));
    }
    return result;
  }

  /** The researched district profile for a family (sync registry lookup). */
  private researchedDistrict(profile?: FamilyProfile): DistrictProfile | undefined {
    if (!profile) return undefined;
    if (profile.districtId) return getResearchedDistrictById(profile.districtId);
    return getResearchedDistrict(profile.district ?? qualifiedSchool(profile));
  }

  /** Resolve the counterparty by role + mode. Contacts come from the researched district (never env). */
  private resolveCounterparty(role: Counterparty['role'], mode: Mode, profile?: FamilyProfile): Counterparty {
    if (mode === 'demo') {
      return { role, name: 'Demo School Liaison', email: 'demo-liaison@example.com', phone: '+15550001111' };
    }
    const school = profile?.school?.trim() || 'the school';
    const district = profile?.district?.trim() || school;
    const researched = this.researchedDistrict(profile);
    switch (role) {
      case 'HOMELESS_LIAISON': {
        const l = researched?.liaison;
        if (l) return { role, name: l.name, email: l.email, phone: l.phone };
        // No researched liaison yet — don't invent a number/address; the step will
        // fail-safe until the district is researched.
        return { role, name: `${district} homeless liaison` };
      }
      case 'BUS_PASSES': {
        const b = researched?.busPasses;
        return b ? { role, name: b.name, phone: b.phone } : { role, name: `${district} transportation` };
      }
      case 'PRINCIPAL':
        return { role, name: `principal at ${school}` };
      default:
        return { role, name: school };
    }
  }

  private buildExecContext(
    record: { state: ConversationState },
    mode: Mode,
    conversationId: string = this.currentConversationId,
  ): ExecutionContext {
    return {
      mode,
      demoClockScale: 1440,
      parentPhone: process.env.CALL_ME_NUMBER,
      resolveCounterparty: (r, m) => this.resolveCounterparty(r, m, record.state.profile),
      logAction: async (_caseId, a) => {
        record.state.cases = addCase(
          record.state.cases,
          makeCase({ kind: 'action', summary: a.content.slice(0, 120), status: 'open' }),
        );
        return 'action-' + Date.now().toString(36);
      },
      scheduleFollowUp: async (caseId, at, verify, prompt) =>
        this.scheduleFollowUp(conversationId, caseId, at, verify, prompt),
      messageParent: async (text) => this.parentSender(text),
    };
  }

  /** Run the given steps through the executor (caller sets consent/executing). */
  async runSteps(
    steps: Step[],
    mode: Mode,
    state?: ConversationState,
    conversationId: string = this.currentConversationId,
  ): Promise<StepResult[]> {
    const record = { state: state ?? this.store.ensure('steps', this.opts.defaultParentId ?? '').state };
    const ctx = this.buildExecContext(record, mode, conversationId);
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
    const counterparty = this.resolveCounterparty('HOMELESS_LIAISON', mode, profile);
    const steps = planSteps({ intent, family: profile, student, counterparty });
    return this.runSteps(steps, mode, undefined, conversationId);
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
    parentId: string,
  ): Promise<{ turn: AgentTurn; state: ConversationState } | null> {
    const llm = this.opts.llm;
    if (!llm?.enabled) return null;

    const deps: ToolDeps = {
      profile: state.profile,
      district: this.researchedDistrict(state.profile),
      llm: this.opts.researchLlm ?? this.opts.llm,
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
            ...this.resolveCounterparty(s.counterparty.role, this.resolveMode(), state.profile),
            ...s.counterparty,
          },
        }));
      },
      knowledge: async (category, query) => {
        const input = state.profile?.district ?? qualifiedSchool(state.profile);
        const profile = state.profile;
        // Key the district by the profile's STABLE id so the knowledge graph,
        // contacts, and entitlements all look up the same district.
        const district = profile?.districtId
          ? { id: profile.districtId, name: profile.district ?? profile.school ?? input, state: 'CA', schools: [] }
          : resolveAnyDistrict(input);
        const cat = category?.trim().toUpperCase().replace(/\s+/g, '_');
        const validCat =
          cat && (KNOWLEDGE_CATEGORIES as string[]).includes(cat) ? (cat as KnowledgeCategory | 'LAW') : undefined;
        let nodes = await this.knowledge.get(district.id, validCat);
        // Prefer meaning-based (vector) retrieval when embeddings are configured.
        const qText = (query ?? category ?? '').trim();
        if (qText && embeddingsConfigured()) {
          const qb = await embedTexts([qText])
            .then((a) => a?.[0])
            .catch(() => undefined);
          if (qb?.length) {
            const hits = await this.knowledge.search(district.id, qb, 6, validCat);
            if (hits.length) nodes = hits;
          }
        }
        if (nodes.length === 0) {
          // Auto-create knowledge for an un-researched district: real crawl + LLM
          // categorization into grounded `draft` nodes (marked "confirm with the
          // school" so nothing unverified is ever stated as authoritative).
          const schoolName = profile?.school?.trim() || district.name;
          const added = await autoResearchDistrict(this.knowledge, district.id, schoolName, district.name, () =>
            researchDistrictNodes(district.name, schoolName, this.opts.researchLlm ?? this.opts.llm, qText),
          );
          if (added.length) nodes = await this.knowledge.get(district.id, validCat);
        }
        if (!nodes.length) return 'No researched knowledge for that yet.';
        const nodeText = nodes
          .map((n) => `- [${assessKnowledgeNode(n)}] ${n.category}: ${n.title} — ${n.summary}${n.law ? ` (${n.law})` : ''}`)
          .join('\n');
        // Reuse path: prefer the typed resource graph's concrete chain (form/
        // contact/deadline) and a saved procedure over re-deriving them.
        const chainCat = validCat && validCat !== 'LAW' ? validCat : inferCategory(qText);
        const chain = chainCat ? await searchSchoolGraph(district.id, chainCat) : null;
        const skill = chainCat ? await findSkillFor(chainCat.toLowerCase(), district.id) : null;
        const parts = [nodeText];
        if (chain && chain.nodes.length) parts.push(`RESOURCE CHAIN (forms/contacts/deadlines):\n${chainSummary(chain)}`);
        if (skill) parts.push(`SAVED PROCEDURE (reuse this):\n${skillSummary(skill)}`);
        return parts.join('\n\n');
      },
      memory: {
        addGetting: async (item) => {
          await addGetting(parentId, item);
          return `Recorded "${item}" as something the family now has.`;
        },
        startInitiative: async (label) => {
          await startInitiative(parentId, label);
          return `Started initiative "${label}".`;
        },
      },
      studentName: state.profile?.children[0]?.name,
    };

    console.log('[brain] invoked:', text.slice(0, 60));
    const messages: unknown[] = [...history];
    let guard = 0;
    let narrated = false;
    let resolved = false;
    while (guard < 6) {
      const res = await llm.chatWithTools(
        systemPrompt({ profile: state.profile, cases: state.cases, activeGoal: state.activeGoal, lastAction: state.lastAction, pendingActions: pendingActionsSummary(state.pendingSteps) }),
        messages,
        LLM_TOOLS,
        'auto',
      );
      if (!res) break;
      // If the model wants to call tools, do it — never return early on a preamble.
      if (res.calls?.length) {
        // Tell the parent we're on it before any slow research (web/browser/PDF).
        if (!narrated && res.calls.some((c) => SLOW_TEXT_TOOLS.has(c.name))) {
          narrated = true;
          void this.parentSender(nextBusyLine());
        }
        if (res.calls.some((c) => c.name === 'record_getting')) resolved = true;
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
          if (!narrated) {
            narrated = true;
            void this.parentSender(nextBusyLine());
          }
          const srch = await runTool('web_search', { query: text }, deps);
          messages.push({
            role: 'user',
            content: `I looked this up online and found:\n${srch}\n\nUse this to answer the parent accurately.`,
          });
          guard++;
          continue;
        }
        return { turn: { text: res.text, phase: 'done', resolved }, state };
      }
      break;
    }
    // Tool loop didn't resolve → fall back to a plain, grounded answer.
    console.log('[brain] → answerQuestion fallback');
    const district = this.researchedDistrict(state.profile) ?? (state.profile?.school ? resolveDistrict(state.profile.school) : undefined);
    const ans = await llm.answerQuestion(text, state.profile, district);
    if (ans) return { turn: { text: ans, phase: 'done' }, state };
    return null;
  }

  private async resolveDistrictAsync(profile: FamilyProfile): Promise<DistrictProfile> {
    // Research the (ANY) district the parent named — the researched profile is the
    // single source of truth for contacts/school type. Never a hardcoded district.
    const input = qualifiedSchool(profile) || profile.district || profile.school || '';
    const researched = await researchDistrictProfile(input, this.opts.researchLlm ?? this.opts.llm);
    // Persist the stable district key so every subsequent lookup (knowledge graph,
    // contacts, entitlements) keys the same district.
    if (researched.id) profile.districtId = researched.id;
    if (researched.name) profile.district = researched.name;
    // Set the resolved school type so entitlement audit + prompt don't over-claim.
    profile.schoolType = researched.type ?? profile.schoolType;
    return researched;
  }

  private buildCallContext(state: ConversationState, hint?: string): CallContext {
    const profile = state.profile;
    const lastCase = (state.cases ?? []).slice().reverse().find((c) => c.kind !== 'call');
    const hinted = profile?.children?.find((ch) => hint?.toLowerCase().includes(ch.name.toLowerCase()));
    const nameFromHint = hint?.match(/\b([A-Z][a-z]{1,})\b/)?.[1];
    const child = hinted ?? profile?.children?.[0];
    const student = child?.name ?? lastCase?.child ?? (nameFromHint ?? 'your child');
    const grade = child?.grade ?? '';
    const qualified = qualifiedSchool(profile);
    const school = profile?.school ? qualified : 'your child\u2019s school';
    const district = profile?.district ?? (profile?.location && profile?.school ? `${profile.school} ${profile.location}` : '');
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

  /**
   * Research the school/district BEFORE the call and fold the result into the
   * brief, so the voice agent starts informed (rights + forms + contacts) and
   * never has to research live. Deterministic + cached — fast even for a cold
   * district; empty for a district we've never researched.
   */
  private async enrichCallContext(base: CallContext): Promise<CallContext> {
    try {
      const research = await buildPreCallBrief(base.district, base.school);
      if (research) {
        return {
          ...base,
          what_we_know: `${base.what_we_know}\n\nResearched about this school before the call:\n${research}`,
        };
      }
    } catch (e) {
      console.error('[precall] brief build failed:', (e as Error)?.message ?? e);
    }
    return base;
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
        if (b) return this.enrichCallContext({ ...base, issue: b.issue, goal: b.goal, what_we_know: b.what_we_know || base.what_we_know });
      } catch {
        /* fall through to the deterministic brief */
      }
    }
    return this.enrichCallContext(base);
  }

  private buildToolContext(parentId: string): ToolContext | undefined {
    const parent = this.opts.db.parents.find((p) => p.id === parentId);
    if (!parent) return undefined;

    const students = this.opts.db.students.filter((s) => parent.studentIds.includes(s.id));
    const schoolId = students[0]?.schoolId;
    // The family's school comes from their OWN students (provisioned from the
    // parent-supplied children), never a hardcoded default. A fresh family (no
    // students yet) gets a school-less context — onboarding provides the school.
    const school = schoolId ? this.opts.db.schools.find((s) => s.id === schoolId) : undefined;

    const teachers = school ? this.opts.db.teachers.filter((t) => t.schoolId === school.id) : [];
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
    parentId: string,
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
          const counterparty = this.resolveCounterparty('OTHER', mode, profile);
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
      // Not yes/no — the parent changed the subject. Drop the pending plan and
      // fall through to respond to the new message (never loop on "reply yes/no").
      state.phase = 'idle';
      state.pendingPlan = undefined;
      state.intent = undefined;
      state.collected = {};
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

    // Onboarding call-demo offer: the parent replied after we offered to call.
    if (state.awaitingCallDemo) {
      state.awaitingCallDemo = false;
      if (/^(yes|yeah|yep|sure|ok|okay|call me|call|do it|go ahead|please|absolutely)\b/i.test(text.trim())) {
        const callContext = await this.enrichCallContext(this.buildCallContext(state));
        return {
          turn: {
            text: "Great — calling you now. Pick up and I'll show you how I'd handle a real call.",
            callMe: true,
            callContext,
            phase: 'done',
          },
          state: { phase: 'done', collected: {}, cases: state.cases },
        };
      }
    }

    let detected = await this.opts.intentEngine.detect(text);

    // Rule-based fast-path for call requests — the LLM classifier is slow and
    // flaky, and "call me" MUST never fall through to the brain (which can only
    // call the school, not ring the parent). These are unambiguous phrases.
    const intentText = text.toLowerCase();
    if (detected.name !== 'call_me' && /\b(call me|call my (phone|number)|call me back|call this number|give me a call|ring me|have (the agent|axolotl) call)\b/.test(intentText)) {
      detected = { name: 'call_me', confidence: 1 };
    } else if (detected.name !== 'call_school' && /\b(call the (school|office|district|principal|them|front desk)|call (the )?(school|office|district))\b/.test(intentText)) {
      detected = { name: 'call_school', confidence: 1 };
    }

    // Step consent is resolved at the TOP of handle() via the strict whole-message gate — it clears
    // the live `state.pendingSteps`, so by here nothing can fire stale steps. No loose gate below.

    if (detected.name === 'call_me') {
      const callContext = await this.enrichCallContext(this.buildCallContext(state));
      return {
        turn: {
          text: "Alright — calling you now. Pick up and I'll show you how I'd handle that on a real call.",
          callMe: true,
          callContext,
          phase: 'done',
        },
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
      const brain = await this.brain(text, state, history, parentId);
      if (brain) {
        // Any pending consent-gated steps are resolved at the top of handle() (before the brain),
        // so a brain turn here never also fires stale steps.
        return brain;
      }
    }

    // Fallback (no key, or the LLM couldn't resolve): structured flows.
    if (detected.name === 'case_status') {
      return { turn: { text: openCaseSummary(state.cases), phase: 'done' }, state: { phase: 'done', collected: {}, cases: state.cases } };
    }
    if (detected.name === 'unknown') {
      // Before giving up with "I don't understand", let the intelligence layer resolve the fuzzy
      // intent: build the belief state (LLM solution-generation, else the stub), ground it if
      // needed, and surface the most informative clarifying question, a grounded answer, or an
      // honest handoff.
      const fuzzy = await this.resolveFuzzyIntent(text, state);
      if (fuzzy) return fuzzy;
      return { turn: { text: UNKNOWN_TEXT, phase: 'idle' }, state: { phase: 'idle', collected: {}, cases: state.cases } };
    }
    return this.startDetectedIntent(detected.name, text, ctx, roster, state.profile);
  }

  /** Start a freshly-detected intent from scratch (used for new requests and pivots). */
  /**
   * Intelligence-layer resolution for an ambiguous ("unknown-intent") parent message.
   * Builds the belief state (preferring the LLM's solution-generation, falling back to the stub),
   * grounds the leading hypothesis if needed, then acts: ask the most informative clarifying
   * question, present a grounded answer, or hand off honestly. Returns null when the message is
   * not genuinely multi-hypothesis (so the caller falls through to the generic fallback).
   */
  private async resolveFuzzyIntent(text: string, state: ConversationState): Promise<{ turn: AgentTurn; state: ConversationState } | null> {
    const profile = state.profile ?? { children: [], needs: [], challenges: [] };

    // 1. Generate the hypothesis space (H). Prefer the LLM; the stub is a deterministic fallback.
    let hypotheses: Hypothesis[] = [];
    if (this.opts.llm?.enabled) {
      const profileSummary = [profile.location, profile.school, profile.schoolType, profile.children?.[0]?.grade, (profile.challenges ?? []).join(', '), profile.locale].filter(Boolean).join('; ');
      const raw = await this.opts.llm.generateIntentHypotheses(text, profileSummary);
      hypotheses = raw ? hypothesesFromLLM(raw) : [];
    }
    if (hypotheses.length < 2) hypotheses = hypothesize(text, profile);
    if (hypotheses.length < 2) return null;

    // In a displaced/homeless context, never interrogate sensitive housing/residency dimensions —
    // hand off (or ask a non-sensitive question) instead of probing where the family lives.
    const displaced = /homeless|displaced|mckinney|evict(ed)?|no (permanent|fixed|stable) address|staying (at|in a)? ?(the )?(car|motel|hotel|shelter|sofa|couch)|doubled.?up|transitional housing|couch ?surf/i.test(`${(profile.challenges ?? []).join(' ')} ${text}`);
    const allowSensitive = !displaced;

    let intention: Intention = buildIntention(text, profile, hypotheses);
    let decision = decide(intention, [], { minValue: 0.05, budgetUsed: 0, budgetCap: 3, askCost: 0.4, decisionFlipQuestion: askFromUnknowns(intention.unknowns, allowSensitive), allowSensitive });

    // 2. If the policy wants (grounding) research, run it once, then re-decide.
    if (decision.action === 'research' && decision.researchQuery) {
      const grounded = await groundIntention(intention, (claim, kinds) => this.groundClaim(claim, kinds, profile));
      if (grounded !== intention) {
        intention = grounded;
        decision = decide(intention, [], { minValue: 0.05, budgetUsed: 1, budgetCap: 3, askCost: 0.4, decisionFlipQuestion: askFromUnknowns(intention.unknowns, allowSensitive), allowSensitive });
      } else {
        // Grounding returned nothing (no district to research / no LLM): don't guess a form or
        // deadline the parent could act on — hand off honestly instead.
        decision = { action: 'handoff', reason: 'Could not verify the exact form or deadline, so I will not guess.', scored: [] };
      }
    }

    // 3. Act on the final decision.
    if (decision.action === 'ask' && decision.question) {
      return { turn: { text: decision.question, phase: 'clarifying' }, state: { phase: 'clarifying', collected: {}, profile } };
    }

    const best = concentrated(intention.hypotheses);
    if ((decision.action === 'commit' || decision.action === 'research') && best) {
      // If the intention is genuinely committed and we have an actionable grounded step (a form URL
      // or an email contact), map it to a consent-gated Step set and ask the parent for YES before
      // doing anything consequential. This is the "never act without consent" rule.
      if (intention.status === 'committed') {
        const steps = this.stepsForCommittedIntention(intention, best);
        if (steps.length) {
          return {
            turn: {
              text: `I found the path for this. Here's what I'd do — and it needs your OK before I send anything:\n\n` +
                steps.map((s, i) => `${i + 1}. ${describeStepWithTarget(s)}`).join('\n') +
                `\n\nReply "submit it" and I'll go ahead.`,
              phase: 'confirming',
            },
            state: { phase: 'confirming', collected: {}, pendingSteps: steps, profile, cases: state.cases },
          };
        }
      }
      const groundedLines = best.subClaims
        .filter((s) => s.attested && (s.value || s.source))
        .map((s) => `• ${s.kind}: ${s.value ?? s.source}`);
      const groundedInfo = groundedLines.length ? `\n${groundedLines.join('\n')}` : '';
      const grounded = intention.status === 'committed'
        ? `Here's what I found for you:\n\n• ${best.claim}${best.program ? ` (${best.program})` : ''}${groundedInfo}\n\nWant me to take the next step for you?`
        : `I believe this is about "${best.claim}"${best.program ? ` (${best.program})` : ''}, but I couldn't yet verify the exact form and deadline, so I'd rather not guess. Share a bit more and I'll pin it down.`;
      return { turn: { text: grounded, phase: 'done', resolved: intention.status === 'committed' }, state: { phase: intention.status === 'committed' ? 'done' : 'idle', collected: {}, profile } };
    }

    return {
      turn: { text: `I want to be straight with you rather than guess, and I don't yet have enough to answer that reliably.`, phase: 'idle' },
      state: { phase: 'idle', collected: {}, profile },
    };
  }

  /**
   * Ground a claim by running real web research for the district/school and attesting the claim's
   * sub-claims. Each sub-claim kind is attested ONLY from evidence that actually supports that kind:
   *  - formUrl      → a real URL from a retrieved node (never a made-up one);
   *  - deadline     → a concrete date/date-range string found in the evidence;
   *  - contact      → an email/phone found in the evidence;
   *  - eligibility  → an explicit eligibility signal (free/reduced, SNAP/CalFresh, income threshold).
   * A single node is never allowed to "attest" every kind at once — that was a bug: `deadline`,
   * `contact`, and `eligibility` were all being copied verbatim from the same `summary`, so
   * "evidence-confidence ≥ 0.6" reduced to "the research call returned at least one node." Now a
   * kind that isn't genuinely evidenced stays unattested, so the hypothesis can only `commit` on
   * real grounding. Returns null (a no-op for `groundIntention`) when little/no evidence exists —
   * which makes the system under-commit rather than guess — or when the research call throws.
   */
  private async groundClaim(
    claim: string,
    kinds: SubClaimKind[],
    profile: FamilyProfile,
  ): Promise<Partial<Record<SubClaimKind, { value: string; source: string }>> | null> {
    const llm = this.opts.researchLlm ?? this.opts.llm;
    const districtName = profile.district ?? profile.location ?? '';
    const schoolName = profile.school ?? '';
    if (!districtName || !llm?.enabled) return null;
    let nodes: CandidateNode[];
    try {
      nodes = await researchDistrictNodes(districtName, schoolName, llm, claim);
    } catch {
      // Never let a research failure surface as a generic error — hand off honestly.
      return null;
    }
    if (!nodes.length) return null;
    // Attest each sub-claim kind ONLY from evidence that genuinely supports that kind (a single
    // node can no longer "attest" deadline/contact/eligibility from one summary blob).
    return extractGrounding(nodes, kinds);
  }

  /**
   * Map a committed intention (grounded hypothesis) to consent-gated Steps. Prefers a browser
   * form-fill+submit at the grounded form URL; falls back to an email to the grounded contact.
   * Returns [] when nothing actionable is grounded — caller then just informs the parent.
   */
  private stepsForCommittedIntention(intention: Intention, best: Hypothesis): Step[] {
    const profile = intention.profile;
    const formUrl = best.subClaims.find((s) => s.kind === 'formUrl' && s.attested)?.value;
    const contact = best.subClaims.find((s) => s.kind === 'contact' && s.attested)?.value;
    const student = profile.children?.[0]?.name ?? 'your child';
    const mode = this.resolveMode();
    const sped = /special|iep|speech|504|evaluation/i.test(`${best.program ?? ''} ${best.claim}`);
    const role: Counterparty['role'] = sped ? 'SPED_COORDINATOR' : 'DISTRICT';
    const counterparty = this.resolveCounterparty(role, mode, intention.profile);
    const intentId = (best.program ?? best.claim).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'request';

    if (formUrl) {
      const fields: Array<{ label: string; value: string }> = [
        { label: 'student', value: student },
        { label: 'school', value: profile.school ?? '' },
      ];
      if (profile.children?.[0]?.grade) fields.push({ label: 'grade', value: profile.children[0].grade });
      return [{
        id: `${intentId}-browser`,
        caseId: intentId,
        intent: intentId,
        channel: 'browser',
        counterparty,
        payload: { channel: 'browser', url: formUrl, fields, submit: true },
        successCondition: { describe: `${best.program ?? 'the request'} — fill and submit the form`, kind: 'confirmation_parsed' },
        requiresConsent: true,
        status: 'planned',
      }];
    }

    if (contact && /@/.test(contact)) {
      return [{
        id: `${intentId}-email`,
        caseId: intentId,
        intent: intentId,
        channel: 'email',
        counterparty,
        payload: {
          channel: 'email',
          subject: `Request regarding ${student}`,
          body: `Hi,\n\n${student} attends ${profile.school ?? 'our school'}.\n\n${best.claim}.\n\n${intention.message}\n\nThanks.`,
        },
        successCondition: { describe: `${best.program ?? 'the request'} — send the request to the contact`, kind: 'reference_received' },
        requiresConsent: true,
        status: 'planned',
      }];
    }

    return [];
  }

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
      const d = profile ? this.researchedDistrict(profile) ?? resolveDistrict(profile.school ?? profile.district ?? '') : undefined;
      const answer = d ? answerSchoolInfo(d, text) : undefined;
      const text2 =
        answer ??
        `I don't have that for ${d?.name ?? 'your district'} yet — tell me the school and city/state and I'll research it, or call the school office and they can tell you right away.`;
      return { turn: { text: text2, phase: 'done' }, state: { phase: 'done', collected: {}, profile } };
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
  if (/^(y|yes|yeah|yep|sure|ok|okay|confirm|go ahead|do it|please do|submit|submit it|go)\b/i.test(text)) return true;
  if (/^(n|no|nope|cancel|change|not that|stop|hold on)\b/i.test(text)) return false;
  return null;
}

/**
 * Strict, whole-message consent for a consequential action (filling/submitting a form on behalf of a
 * child). Unlike the looser "yes/submit it" prefix match used for casual affirmatives, this requires
 * the entire message to BE a confirmation phrase, so a stray "ok thanks" (which continues another
 * exchange) can never fire a stale submission.
 */
function isStrictConsent(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  return /^(y|yes|yeah|yep|yup|sure|ok|okay|kk|confirm|do it|go ahead|go ahead and do it|go|please|absolutely|definitely|submit|submit it|submit it now|yes please|go for it|do it now)\s*$/.test(t);
}

/** Strict, whole-message refusal for a pending consequential action. */
function isStrictDecline(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  return /^(n|no|nope|cancel|change|not that|stop|hold on|don't|dont|never mind|nevermind|skip|change it)\s*$/.test(t);
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
