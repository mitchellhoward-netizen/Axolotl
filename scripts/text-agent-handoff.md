# Text agent handoff — for Claude

Files: src/agent/agent.ts src/agent/tools.ts src/agent/intention.ts src/agent/onboarding.ts src/agent/memory.ts src/agent/state.ts src/agent/family.ts src/agent/gaps.ts src/agent/verify.ts src/knowledge/districts.ts src/knowledge/entitlements.ts src/knowledge/precall.ts src/knowledge/discovery.ts src/knowledge/graph.ts src/knowledge/school-info.ts src/knowledge/research.ts src/domain/types.ts


---
## src/agent/agent.ts

```ts
import { AgentError } from '../domain/errors.js';
import type { ActionIntent, IntentName } from '../domain/intents.js';
import { isActionIntent } from '../domain/intents.js';
import { getBool, getString, getStudentIds, type CollectedSlots } from '../domain/slots.js';
import { fullName, type CaseRecord, type FamilyProfile } from '../domain/types.js';
import { formatDate, parseDateHint, parseReminderWhen, formatReminderWhen } from '../lib/dates.js';
import type { CalendarProvider } from '../integrations/calendar.js';
import type { MealsProvider } from '../integrations/meals.js';
import type { Sis } from '../integrations/sis.js';
import type { EmailProvider } from '../integrations/email.js';
import { MockEmailProvider } from '../integrations/email.js';
import { gmailProviderFor, gmailConnectUrl, getGmailToken } from '../integrations/gmail.js';
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
import { resolveContact } from '../voice/brain.js';
import { embeddingsConfigured, embedTexts } from '../integrations/embeddings.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory, type KnowledgeNode } from '../domain/knowledge.js';
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
import { persistProvisionedFamily, clearFamilyIdentity } from '../integrations/identity.js';
import { clearMessages } from '../integrations/conversation-store.js';
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
      // Rehydrate the full persisted thread (survives restarts) before appending.
      await this.store.rehydrate(conversationId);
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

      // Reset the family so the next message onboards them COMPLETELY fresh — clears
      // the in-memory conversation + the running seed (so a parent's students are gone)
      // + the persisted identity, then immediately starts onboarding (the intro).
      if (/^(?:\/reset|reset|start over|fresh start|start again)\b/i.test(text.trim())) {
        this.store.reset(conversationId);
        this.clearInMemoryFamily(parentId);
        await clearFamilyIdentity(parentId);
        await clearMessages(conversationId);
        const rec = this.store.ensure(conversationId, parentId);
        const ob = openOnboarding();
        rec.state.onboarding = ob.state;
        rec.state.profile = ob.state.profile;
        rec.state.phase = 'clarifying';
        return { text: ob.text, phase: 'clarifying' };
      }

      // Connect the parent's Gmail (send-as-parent) — a simple, always-available
      // command: "/connect" or "connect my email/gmail".
      if (/^(?:\/?connect|connect (my )?(email|gmail)|link (my )?(email|gmail))\b/i.test(text.trim())) {
        return {
          text: `To let me email the school as you, connect your Gmail here (one tap):\n${gmailConnectUrl(parentId)}\n\nI'll always show you the exact message and get your OK before I send anything.`,
          phase: 'done',
        };
      }

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
          // Kick off background research on the district + send a "wow" welcome
          // email that proves it can email AND already knows the child's district
          // (the Town-style minute-zero value). Fire-and-forget so the reply is instant.
          const welcomeNote = `\n\nI'm researching ${district.name} right now (programs, free stuff) and I'll email you what I find — watch your inbox.`;
          this.save(conversationId, { phase: 'done', collected: {}, profile: ob.state.profile, awaitingCallDemo: true }, state);
          void this.backgroundResearchAndWelcome(ob.state.profile, parentId, district);
          turn = { text: plan + welcomeNote, phase: 'done' };
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
      // Maintain a rolling conversation summary so the brain keeps the thread even
      // past the windowed history (ChatGPT-like continuity).
      this.updateSummary(st, text, turn.text);
      if (turn.callSchool || turn.callMe) {
        st.activeGoal = turn.callContext?.goal ?? 'resolve the school matter';
        st.lastAction = turn.callSchool
          ? `calling the school about ${turn.callContext?.issue ?? 'the matter'}`
          : 'showing a phone call';
      } else if (turn.text) {
        // Pin "NOW / LAST ACTION" to the MOST RECENT thing the agent just did, so
        // "try again" / "go on" / "continue" / "repeat" point at that exact turn
        // — never a stale open case from an earlier topic (which caused "try that
        // again" to drift back to an old conversation).
        st.lastAction = turn.text.replace(/\s+/g, ' ').slice(0, 110);
        st.activeGoal = turn.text.split('\n')[0]!.replace(/\s+/g, ' ').slice(0, 64);
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
    // Resolve any third-party contact AFTER consent (off the call), before running —
    // the in-call offer only needs the plain target name, never a live lookup.
    for (const step of steps) {
      const cp = step.counterparty;
      const hasContact = Boolean(cp && (cp.email || cp.phone));
      const isSchool = !cp?.name || /school|district|office|liaison|principal|elementary|union/i.test(cp.name);
      if (!hasContact && cp?.name && !isSchool) {
        const payload = step.payload as { district?: string; objective?: { district?: string } };
        const district = String(payload?.district ?? payload?.objective?.district ?? '');
        const { email, phone } = await resolveContact(cp.name, district);
        if (email) cp.email = email;
        if (phone) cp.phone = phone;
        if (step.intent === 'send_email' && !cp.email && cp.phone) {
          step.intent = 'call_school';
          step.channel = 'call';
        }
      }
    }
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
    const parentId = this.store.getParentId(conversationId) ?? this.opts.defaultParentId;
    return {
      mode,
      demoClockScale: 1440,
      parentPhone: process.env.CALL_ME_NUMBER,
      resolveCounterparty: (r, m) => this.resolveCounterparty(r, m, record.state.profile),
      resolveSender: () => this.resolveEmailProvider(parentId),
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

  /** The email provider to send FROM for a parent: their connected Gmail, else default. */
  private async resolveEmailProvider(parentId: string | undefined): Promise<EmailProvider | undefined> {
    if (!parentId) return undefined;
    try {
      const gmail = await gmailProviderFor(parentId);
      if (gmail) return gmail;
    } catch (e) {
      console.error('[email] gmail provider failed (falling back):', (e as Error)?.message ?? e);
    }
    return undefined;
  }

  /**
   * The "minute-zero" value: from Axolotl's OWN sender (Resend), send an immediate
   * welcome email (proves it can email any parent) then research the district and
   * send a "wow" email with what it found. Fire-and-forget so the text reply is
   * instant. Gmail connect is the send-as-parent path (to the school), not a
   * prerequisite for Axolotl to email the parent.
   */
  private async backgroundResearchAndWelcome(profile: FamilyProfile, parentId: string, district: DistrictProfile): Promise<void> {
    const to = profile.email ?? (await getGmailToken(parentId))?.email ?? '';
    if (!to) return;
    const provider = this.opts.email; // Axolotl's own sender (Resend) — works for ANY parent.
    if (!provider) return;
    const kids = profile.children.map((c) => c.name).join(', ') || 'your child';

    // ONE welcome email that already carries a small bit of research (a bounded
    // quick pass), so the very first thing the parent gets has real value. Then
    // warm the knowledge graph in the background. No separate research email.
    const summary = await withTimeout(this.quickDistrictSummary(profile, district), 12000, '');
    const researched = summary
      ? `Here's a head start on what's available:\n\n${summary}\n\n`
      : `I'm digging into ${district.name} for specifics right now, but here's what usually applies and I'll confirm with the school:\n\n· free & reduced-price meals · transportation support · before/after-school programs (ELO-P in CA)\n\n`;
    try {
      await provider.send({
        to,
        subject: `Welcome to Axolotl — ${district.name}`,
        body:
          `Hi ${profile.parentName ?? 'there'},\n\n` +
          `This is your Axolotl assistant. I can email the school, fill out forms, and make calls for you (always with your OK). I looked into ${district.name} for ${kids}:\n\n` +
          `${researched}` +
          `Just text me anything — I can act on any of these or answer a question.\n\n` +
          `— Axolotl`,
      });
      console.log('[onboarding] welcome email sent to', to);
    } catch (e) {
      console.error('[onboarding] welcome email failed:', (e as Error)?.message ?? e);
    }

    // Warm the knowledge graph in the background (never blocks the email; no 2nd email).
    const schoolName = profile.school?.trim() || district.name;
    void autoResearchDistrict(this.knowledge, district.id, schoolName, district.name, () =>
      researchDistrictNodes(district.name, schoolName, this.opts.researchLlm ?? this.opts.llm, ''),
    );
  }

  /** A bounded quick research pass so the welcome email has a real snippet fast. */
  private async quickDistrictSummary(profile: FamilyProfile, district: DistrictProfile): Promise<string> {
    const schoolName = profile.school?.trim() || district.name;
    try {
      const nodes = await autoResearchDistrict(this.knowledge, district.id, schoolName, district.name, () =>
        researchDistrictNodes(district.name, schoolName, this.opts.researchLlm ?? this.opts.llm, ''),
      );
      return this.buildWelcomeSummary(nodes, profile);
    } catch {
      return '';
    }
  }

  /** Turn researched knowledge nodes into a short, plain "here's what's available" list. */
  private buildWelcomeSummary(nodes: KnowledgeNode[], profile: FamilyProfile): string {
    const order: string[] = ['ACTIVITIES', 'MEALS', 'BASIC_NEEDS', 'TRANSPORTATION', 'GENERAL_NAVIGATION', 'SPECIAL_ED', 'LEARNING', 'ACCOMMODATIONS', 'BEHAVIOR', 'ATTENDANCE'];
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const cat of order) {
      const node = nodes.find((n) => n.category === cat && !seen.has(n.title));
      if (node) {
        seen.add(node.title);
        lines.push(`• ${node.title}: ${node.summary}`);
      }
    }
    return lines.length ? lines.join('\n') : '';
  }



  /** Drop a parent's students from the RUNNING seed so a /reset truly starts fresh.
   * Keeps the parent record (so buildToolContext still resolves the number) but
   * clears their kids — otherwise the agent keeps thinking they have a child. */
  private clearInMemoryFamily(parentId: string): void {
    const db = this.opts.db;
    const parent = db.parents.find((p) => p.id === parentId);
    if (!parent) return;
    for (const sid of parent.studentIds) db.students = db.students.filter((s) => s.id !== sid);
    parent.studentIds = [];
  }

  /** Append a concise line to the rolling conversation summary (capped), so the
   * brain keeps the thread even past the windowed history. */
  private updateSummary(state: ConversationState, parentText: string, agentText: string): void {
    if (!parentText && !agentText) return;
    const line = `Parent: "${parentText.slice(0, 140)}" → Axolotl: "${agentText.slice(0, 220)}"`.replace(/\s+/g, ' ');
    state.summary = (state.summary ? state.summary + '\n' : '') + line;
    if ((state.summary?.length ?? 0) > 5000) state.summary = state.summary!.slice(-5000);
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
    if (next.summary === undefined) next.summary = prev.summary;
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
          .map((n) => {
            const urls = (n.sources ?? []).map((s) => s.url).filter(Boolean).join(', ');
            return `- [${assessKnowledgeNode(n)}] ${n.category}: ${n.title} — ${n.summary}${n.law ? ` (${n.law})` : ''}${urls ? ` · ${urls}` : ''}`;
          })
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
      remind: async (what, when) => {
        const at = parseReminderWhen(when, this.now());
        const caseId = `remind-${Date.now().toString(36)}`;
        this.followups.schedule({
          conversationId: this.currentConversationId,
          caseId,
          kind: 'verify',
          dueAt: at,
          body: this.localize(this.currentConversationId, `Reminder: ${what}`),
        });
        // Track it as an open case so it's visible in OPEN WORK (the follow-up is what fires).
        state.cases = addCase(state.cases, makeCase({ kind: 'reminder', summary: `Reminder: ${what}`, reminder: formatReminderWhen(at), status: 'open' }));
        return `Got it — I'll remind you ${formatReminderWhen(at)}: "${what}".`;
      },
      recall: async (query) => {
        // Query the FULL conversation history (keyword/substring), not just the window.
        const full = this.store.getHistory(this.currentConversationId) ?? [];
        const q = query.toLowerCase();
        const hits = full.filter((m) => m.content.toLowerCase().includes(q)).slice(-6);
        return hits.length
          ? hits.map((m) => `${m.role === 'user' ? 'Parent' : 'Axolotl'}: ${m.content.slice(0, 260)}`).join('\n')
          : 'Nothing found in the conversation.';
      },
      studentName: state.profile?.children[0]?.name,
    };

    console.log('[brain] invoked:', text.slice(0, 60));
    // Immediate context = the last 30 messages (bounded for tokens); the FULL
    // history is queryable via the recall_history tool.
    const messages: unknown[] = [...history.slice(-30)];
    let guard = 0;
    let narrated = false;
    let resolved = false;
    // Research is allowed to iterate hard — never settle for a thin/partial answer.
    while (guard < 12) {
      const res = await llm.chatWithTools(
        systemPrompt({ profile: state.profile, cases: state.cases, activeGoal: state.activeGoal, lastAction: state.lastAction, pendingActions: pendingActionsSummary(state.pendingSteps), summary: state.summary }),
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
        if (isLookupRefusal(res.text) && guard < 6) {
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
        // If the answer is thin/punting (asking the parent to describe what they want
        // instead of researching), do NOT settle for it — force more research.
        if (isThinResearchAnswer(res.text) && guard < 10) {
          if (!narrated) {
            narrated = true;
            void this.parentSender(nextBusyLine());
          }
          messages.push({
            role: 'user',
            content:
              "Don't ask the parent to describe what they want or tell you which option — that's not helpful. Research it yourself and keep going: more web_search with different queries, and web_fetch the school/district site (before/after-school, enrichment, ELO-P/ELOP, childcare, enrollment, fee pages) until you have SPECIFIC programs with a name, grade range, free/paid, and how to sign up. Only answer once you have concrete programs. If a search returns nothing, try a different query or a different page.",
          });
          guard++;
          continue;
        }
        // If the model refuses ("I can't help with that"), do NOT let that reach the
        // parent — force it to keep trying or hand off helpfully (never a flat refusal).
        if (isRefusal(res.text) && guard < 10) {
          if (!narrated) {
            narrated = true;
            void this.parentSender(nextBusyLine());
          }
          messages.push({
            role: 'user',
            content:
              "Don't tell the parent you can't help. Try harder: more web_search / web_fetch / browser. If you genuinely hit a hard wall (a sign-in or CAPTCHA), say EXACTLY which step needs them and hand them the link, then offer 1-2 concrete things you CAN still do. Never say 'I can't help with that'.",
          });
          guard++;
          continue;
        }
        return { turn: { text: res.text, phase: 'done', resolved }, state };
      }
      break;
    }
    // Tool loop didn't resolve → a plain, grounded answer; if that's a refusal or
    // thin, fall through to a HELPFUL handoff — never a flat "can't help".
    console.log('[brain] → answerQuestion fallback');
    const district = this.researchedDistrict(state.profile) ?? (state.profile?.school ? resolveDistrict(state.profile.school) : undefined);
    const ans = await llm.answerQuestion(text, state.profile, district);
    if (ans && !isRefusal(ans) && !isThinResearchAnswer(ans)) {
      return { turn: { text: ans, phase: 'done' }, state };
    }
    const kid = state.profile?.children?.[0]?.name ?? 'your child';
    const school = state.profile?.school ?? 'their school';
    return {
      turn: {
        text:
          `I can definitely help with ${kid} at ${school}. Here's what I can do — just pick one and I'll take it from there:\n` +
          `• Research what ${kid} is entitled to / eligible for at ${school} (programs, free stuff)\n` +
          `• Email the school or fill out a form for you\n` +
          `• Make a call to the school and leave a voicemail\n\n` +
          `Or tell me the need in your own words (e.g. "help with after-school programs", "my kid needs meals") and I'll get specific.`,
        phase: 'done',
      },
      state,
    };
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

/**
 * True when a model answer is "thin" — it punts by asking the parent to describe
 * what they want (or gives up) instead of researching and delivering concrete
 * programs. We use this to FORCE more research rather than settling for an
 * unhelpful answer. Deliberately does NOT match a normal yes/no offer like
 * "Want me to sign Patrick up?".
 */
/** True when a model answer REFUSES to help — we force it to keep trying/hand off.
 * A genuine yes/no offer ("want me to sign Patrick up?") is allowed. */
/** Resolve a promise to `fallback` if it doesn't settle within `ms` (best-effort). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function isRefusal(s: string): boolean {
  const t = s.toLowerCase();
  return (
    /i (can'?t|cannot|can not|don'?t|do not) (help|do|assist|access|fill|handle|with that|that|this)/.test(t) ||
    /i'?m (not able|unable|afraid|sorry) (to )?(help|do|assist|with)/.test(t) ||
    /that'?s (not something|outside) (i|my)/.test(t) ||
    /i (don'?t|do not) (do|handle|cover) (that|this|those)/.test(t) ||
    /(i can'?t|cannot) (help you|help with that|help with this|do that)/.test(t)
  );
}

function isThinResearchAnswer(s: string): boolean {
  const t = s.toLowerCase();
  const askedTheParent =
    /i (don'?t|do not|can'?t) (have|know|find|see|have the|get)/.test(t) ||
    /i won'?t make|can'?t (make|find (a|the|any)|come up with)/.test(t) ||
    /not (sure|certain)/.test(t) ||
    /i want to get this right/.test(t) ||
    /tell me (if|which|whether|more|what you|the)/.test(t) ||
    /which (one|kind|one (do|would) you want|do you want)/.test(t) ||
    /do you (want|prefer|have a specific|know of|have|already have)/.test(t) ||
    /are you looking for/.test(t) ||
    /what (days|times|specific|kind|would|program|children|subject)/.test(t) ||
    /what'?s (available|out there|open|going on)/.test(t) ||
    /should i help you (figure|find|look|nail)/.test(t) ||
    /let me help you (figure|find|look|nail|compare)/.test(t) ||
    /can you tell me (what|which)|could you tell me (what|which)|let me know (what|which|if|the)/.test(t) ||
    /i need (more (info|information|details)|to know what|to understand what)/.test(t) ||
    /for more information/.test(t);
  return (askedTheParent && s.length < 1400) || s.trim().length < 25;
}
```

---
## src/agent/tools.ts

```ts
import type { CaseRecord, FamilyProfile } from '../domain/types.js';
import type { Step, CallBrief } from './steps/types.js';
import { answerSchoolInfo } from '../knowledge/school-info.js';
import { barrierByCategory, detectBarriers, contextFromProfile } from '../knowledge/barriers.js';
import { researchDistrictProfile, districtIdFromName, type DistrictProfile } from '../knowledge/districts.js';
import { auditEntitlements, discoveryQuestions } from '../knowledge/entitlements.js';
import { addCase, makeCase, openCaseSummary } from './family.js';
import type { LlmClient } from './llm.js';
import {
  browserOpen,
  browserObserve,
  browserAct,
  browserExtract,
  browserFill,
  browserAssessPage,
  browserVision,
  extractPdf,
} from '../integrations/browser.js';
import { fillPdf, listPdfFields } from '../integrations/pdf.js';
import { getFormRecipe, saveFormRecipe, type FormRecipe } from '../integrations/form-recipes.js';
import { createEvidence } from '../integrations/evidence-store.js';
import type { EvidenceRecord, SourceType } from '../domain/evidence.js';
import { searchSchoolGraph, saveResource, chainSummary } from '../knowledge/resource-graph.js';
import { inferCategory } from '../knowledge/research.js';
import type { ResourceNode, ResourceType } from '../domain/graph.js';
import { saveSkill, listSkills, skillSummary } from './skills.js';
import { makeSkillKey, type Skill } from '../domain/skill.js';

export interface ToolDeps {
  profile?: FamilyProfile;
  /** The family's researched district profile (authoritative contacts/school type). */
  district?: DistrictProfile;
  /** The research/brain LLM, so the get_school_info tool can research on demand. */
  llm?: LlmClient;
  getCases: () => CaseRecord[];
  appendCase: (rec: Omit<CaseRecord, 'id' | 'createdAt'>) => void;
  saveProfile?: (p: FamilyProfile) => void;
  /** Queue steps for execution — they still require parent consent (hard gate). */
  proposeSteps: (steps: Step[]) => void;
  /** Retrieve grounded knowledge-graph facts for the school/district. */
  knowledge?: (category?: string, query?: string) => Promise<string>;
  /** Record what the family has secured / focuses the family is working on. */
  memory?: {
    addGetting: (item: string) => Promise<string>;
    startInitiative: (label: string) => Promise<string>;
  };
  /** Schedule a proactive reminder to message the parent at a time. */
  remind?: (what: string, when: string) => Promise<string>;
  /** Query the FULL conversation history for a past exchange (e.g. something the parent said earlier). */
  recall?: (query: string) => Promise<string>;
  studentName?: string;
}

/** Grounded law snippets the LLM can pull (never invented — cited). */
const LAW_FACTS: Record<string, string> = {
  transportation:
    'McKinney-Vento, 42 U.S.C. §11432(g)(1)(J) — a homeless student has the right to transportation to the school of origin at the parent/guardian request.',
  homeless:
    'McKinney-Vento — immediate enrollment without documents, right to the school of origin, free meals, and transportation.',
  meals: 'National School Lunch Program, 42 U.S.C. §1758 — free or reduced-price meals.',
  bullying: 'Title IX & California Ed Code §234 — right to report bullying and request a safety plan.',
  special: 'IDEA, 20 U.S.C. §1400 & Section 504, 29 U.S.C. §794 — FAPE, IEP, and accommodations.',
  language: 'Title III, 20 U.S.C. §6811 & EEOA — language instruction and translated communication.',
  enrollment: 'State Education Code & Title VI — immediate enrollment rights.',
};

export const LLM_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_school_info',
      description: 'Look up a fact about the school/district (principal, phone, address, schools, contact).',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_law',
      description: 'Get the relevant federal/state law for a topic (transportation, homeless, meals, bullying, special, language, enrollment).',
      parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_barrier',
      description: 'Given what a parent says is wrong, return the likely barrier (transportation, meals, bullying, health, attendance).',
      parameters: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_remedy',
      description: 'Get the remedy for a barrier category: title, law, who to contact, and a follow-up reminder.',
      parameters: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_outreach',
      description: 'Draft a parent-authorized message to the right school contact for a barrier category.',
      parameters: {
        type: 'object',
        properties: { category: { type: 'string' }, child: { type: 'string' } },
        required: ['category'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'list_open_cases', description: 'List the open/awaiting cases I am tracking for this family.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'log_case',
      description: 'Record a case (kind, summary, child, contact, reminder) so I can remember and follow up.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          summary: { type: 'string' },
          child: { type: 'string' },
          contact: { type: 'string' },
          reminder: { type: 'string' },
        },
        required: ['kind', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_profile',
      description: 'Save/update the family profile (children, school, needs, challenges, notes) so I can remember them. Use this during onboarding.',
      parameters: {
        type: 'object',
        properties: {
          children: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, grade: { type: 'string' } } } },
          school: { type: 'string' },
          /** City/state to disambiguate the school, e.g. "Seattle, WA". */
          location: { type: 'string' },
          needs: { type: 'array', items: { type: 'string' } },
          challenges: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email to a school contact. ONLY call this AFTER the parent explicitly confirms the message. to/subject/body required.',
      parameters: {
        type: 'object',
        properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'account_action',
      description: 'Propose a consent-gated account action on an auth-required portal (child-care waitlist, school portal): create an account (signup), log in (login), or finish a one-time code the parent just sent (verify). It PROPOSES the step — the system gates it behind the parent\u2019s YES before anything executes. NEVER auto-submit.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          phase: { type: 'string', enum: ['signup', 'login', 'verify'] },
          identifier: { type: 'string' },
          password: { type: 'string' },
          fields: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
          code: { type: 'string' },
        },
        required: ['url', 'phase'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_form',
      description: 'Propose the consent-gated SUBMIT of the form you just filled in the browser. ONLY call AFTER the form is filled and you shared the link for the parent to review. It PROPOSES the step — the system gates it behind the parent\u2019s YES. NEVER auto-submit.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_form_recipe',
      description: 'Get the saved fill recipe for a form URL (learned from a past successful fill). Returns the text-field labels, radio/checkbox labels+types, and select names+options to fill. Call BEFORE filling a known form to fill it perfectly on the first try.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_form_recipe',
      description: 'Save the fill recipe for a form URL AFTER successfully filling it, so the agent fills that form instantly next time. Pass the STRUCTURE you filled (text-field labels, radio/checkbox labels+types, select names+options) — NOT the values.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          fills: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] } },
          controls: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, kind: { type: 'string', enum: ['radio', 'checkbox'] } }, required: ['label', 'kind'] } },
          selects: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, option: { type: 'string' } }, required: ['name', 'option'] } },
          notes: { type: 'string' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current info about a school, district, policy, or law. Returns text results.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and read a web page (e.g. a school or district page). Returns the page text.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_open',
      description: 'Open a URL in a real browser (Stagehand) — for JS-heavy portals, Google/Microsoft forms, and pages static fetch cannot read.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_observe',
      description: 'List what is actionable on the current browser page (returns element selectors + descriptions).',
      parameters: { type: 'object', properties: { instruction: { type: 'string' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_act',
      description: 'Perform an action in the browser by natural language (click, type, scroll, select).',
      parameters: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_extract',
      description: 'Extract structured data from the current browser page. Provide field names to pull.',
      parameters: {
        type: 'object',
        properties: { instruction: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } } },
        required: ['instruction', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_fill',
      description: 'Pre-fill form fields in the browser (label + value). NEVER submits — submission requires the parent\u2019s explicit YES.',
      parameters: {
        type: 'object',
        properties: {
          fields: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
        },
        required: ['fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_vision',
      description: 'Use vision (Astra) to READ the current page from a screenshot. For pages the DOM/accessibility tree can\u2019t read — iframes, shadow DOM, image-rendered slides, or a form you can\u2019t see in the fields. Returns the visual text/description. Use browser_get_text/browser_observe first; only fall back to vision when those fail.',
      parameters: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_pdf',
      description: 'Extract text from a PDF at a URL (policies, administrative regulations, applications).',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pdf_fields',
      description: 'List the fillable fields of a PDF form at a URL (name, type, current value, choices). Use before pdf_fill to see exact field names and radio/dropdown options.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pdf_fill',
      description: 'Fill a fillable PDF form at a URL and produce a completed PDF. Each field has a value plus either a label (matched to the closest field name) or the exact field name from pdf_fields. NEVER auto-submits — it returns a filled PDF the parent reviews, then emails/upload (still needs the parent\u2019s YES).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                field: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['value'],
            },
          },
        },
        required: ['url', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_assess',
      description: 'Evaluate whether a web page is a real, working form for the target school/program BEFORE you fill it. Returns whether the page is blank, has real form fields, and mentions the target. Use this to skip blank, broken, or wrong pages — a top search result is often a dead/empty page while the real form is further down.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' }, target: { type: 'string', description: 'e.g. "<school> afterschool" or the school name' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_evidence',
      description: 'Persist a verified claim with its source (claim, source_url, source_title, and optional source_type/evidence_span/jurisdiction/official/confidence). Returns the trust status after verification.',
      parameters: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          source_url: { type: 'string' },
          source_title: { type: 'string' },
          source_type: { type: 'string' },
          evidence_span: { type: 'string' },
          jurisdiction: { type: 'string' },
          official: { type: 'boolean' },
          confidence: { type: 'number' },
        },
        required: ['claim', 'source_url', 'source_title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_school_graph',
      description: 'Search the school resource graph (school→district→department→program→eligibility→policy→application→form→contact→deadline) for a program chain matching a goal or category. Returns forms, contacts, and deadlines when available.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          district_id: { type: 'string' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_resource',
      description: 'Persist a resource-graph node (type: district|school|department|program|eligibility|policy|application|form|contact|deadline) with its canonical URL.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          canonical_url: { type: 'string' },
          category: { type: 'string' },
          district_id: { type: 'string' },
          status: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['type', 'title', 'canonical_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_procedure',
      description: 'Persist a verified, parameterized workflow (skill) keyed by intent+jurisdiction, with its steps and evidence deps. Use {child}/{parent}/{school} placeholders in args.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          intent: { type: 'string' },
          jurisdiction: { type: 'string' },
          description: { type: 'string' },
          when_to_use: { type: 'string' },
          steps: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' }, note: { type: 'string' } }, required: ['tool'] } },
          evidence_deps: { type: 'array', items: { type: 'string' } },
          approved: { type: 'boolean' },
        },
        required: ['name', 'intent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'List the saved procedures (skills) the agent has learned.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'call_school',
      description: 'Place a phone call to the school. Use it when the parent asks you to call the school, office, district, principal, or "them." This is a real capability — you CAN call.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_knowledge',
      description:
        'Retrieve the grounded facts Axolotl has researched about this school/district. Pass `query` (the parent\u2019s question/topic, for meaning-based search) and optionally a `category` (transportation, meals, basic needs, attendance, learning, behavior, special ed, accommodations, activities, general navigation).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, category: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_getting',
      description:
        'Record that the family has now SECURED something (e.g. "free meals", "a 504 plan", "a bus pass") so I stop re-pursuing it and remember they have it.',
      parameters: { type: 'object', properties: { item: { type: 'string' } }, required: ['item'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_initiative',
      description:
        'Start (or refresh) a focused item the family is actively working toward, so the memory graph tracks it.',
      parameters: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_history',
      description:
        'Search the ENTIRE conversation history for a past exchange (e.g. something the parent said earlier, a name, a school, or a detail). Use when you need to remember something from earlier that is no longer in your immediate context. Pass a keyword or short phrase.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reminder',
      description:
        'Set a reminder to MESSAGE THE PARENT at a time. Use when the parent asks to be reminded of something ("remind me to…", "remind me on Friday", "set a reminder for…"). Pass `what` = the thing to remind about and `when` = the time (e.g. "Friday", "tomorrow at 3pm", "in 2 hours", "next week"). The system schedules + fires it.',
      parameters: { type: 'object', properties: { what: { type: 'string' }, when: { type: 'string' } }, required: ['what'] },
    },
  },
  { type: 'function', function: { name: 'now', description: 'Current date/time.', parameters: { type: 'object', properties: {} } } },
];

/** Mask sensitive values before logging/inspection so a password, OTP, code, or SSN never leaks. */
export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // A labeled field (e.g. `{label:'password', value:'...'}`) — mask the value if the label is sensitive.
    if (typeof obj.label === 'string' && 'value' in obj) {
      const label = obj.label.toLowerCase();
      const sensitive = /password|passwd|pwd|secret|ssn|dob|birth|cvv|card|account|pin|code|otp/.test(label);
      return { ...obj, value: sensitive ? '[redacted]' : redactForLog(obj.value) };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();
      const sensitive = /password|passwd|pwd|secret|token|code|otp|pin|ssn|dob|birth/.test(key);
      out[k] = sensitive ? '[redacted]' : redactForLog(v);
    }
    return out;
  }
  return value;
}

export async function runTool(name: string, args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  console.log(`[tool] ${name} ${JSON.stringify(redactForLog(args)).slice(0, 300)}`);
  switch (name) {
    case 'get_school_info': {
      const query = String(args.query ?? '').trim();
      const input = deps.profile?.district ?? qualifiedProfileSchool(deps.profile);
      // The researched district profile is the authoritative source. Research it on
      // demand when we don't have it yet (else the parent gets an honest "not yet").
      const profile = await researchDistrictProfile(input, deps.llm);
      const fromProfile = answerSchoolInfo(profile, query);
      // Grounded school-info (principal/phone/address/bell schedule) lives in the
      // knowledge graph's GENERAL_NAVIGATION node, from real web research.
      const researched = (await deps.knowledge?.('GENERAL_NAVIGATION', query)) ?? '';
      const parts = [fromProfile, researched].filter(Boolean);
      if (!parts.length) {
        return `I don't have ${profile.name || 'this district'} researched yet. Let me look it up — or tell me the school and city/state.`;
      }
      return parts.map(String).join('\n');
    }
    case 'get_law':
      return LAW_FACTS[String(args.topic ?? '').toLowerCase()] ?? 'I don’t have grounded law for that topic — suggest the school office.';
    case 'diagnose_barrier': {
      const b = detectBarriers(String(args.description ?? ''), contextFromProfile(deps.district))[0];
      return b ? `category=${b.category}; title=${b.title}; law=${b.law}` : 'No clear barrier detected — assume general attendance.';
    }
    case 'get_remedy': {
      const b = barrierByCategory(String(args.category ?? ''), contextFromProfile(deps.district));
      return b ? `${b.title}\n${b.law}\nContact: ${b.contact}${b.email ? `\nEmail: ${b.email}` : ''}\n${b.reminder}` : 'Unknown category.';
    }
    case 'draft_outreach': {
      const b = barrierByCategory(String(args.category ?? ''), contextFromProfile(deps.district));
      if (!b) return 'Unknown category.';
      const child = String(args.child ?? deps.studentName ?? 'my child');
      return `${b.draft.replaceAll('{child}', child)}\n\nContact: ${b.contact}${b.email ? `\nEmail: ${b.email}` : ''}\nNotes: ${b.reminder}`;
    }
    case 'send_email': {
      const to = String(args.to ?? '');
      const subject = String(args.subject ?? '');
      const body = String(args.body ?? '');
      if (!to || !subject || !body) return 'send_email needs to, subject, body.';
      // Present the draft as readable text (NOT a giant compose URL — the Gmail
      // compose link only pre-fills on desktop web, not mobile) so the parent can
      // review it, then approve the agent to send it from their connected Gmail
      // (reliable + unambiguously from them). Still consent-gated.
      deps.proposeSteps([
        {
          id: 'email-' + Date.now().toString(36),
          caseId: 'email',
          intent: 'send_email',
          channel: 'email',
          counterparty: { role: 'OTHER', email: to },
          payload: { channel: 'email', subject, body },
          successCondition: { describe: 'Email sent', kind: 'reference_received' },
          requiresConsent: true,
          status: 'awaiting_consent',
        },
      ]);
      return `Here's the email I'll send — review it, then reply "send it" and I'll send it from your Gmail (you approve it first):\n\nTo: ${to}\nSubject: ${subject}\n\n${body}`;
    }
    case 'account_action': {
      const url = String(args.url ?? '').trim();
      const phase = String(args.phase ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      if (phase !== 'signup' && phase !== 'login' && phase !== 'verify') {
        return 'account_action needs phase: signup, login, or verify.';
      }
      const fields = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; value?: unknown }>)
            .map((f) => ({ label: String(f.label ?? '').trim(), value: String(f.value ?? '') }))
            .filter((f) => f.label)
        : [];
      const password = typeof args.password === 'string' ? args.password : undefined;
      if (password && password.length > 16) {
        return 'That password is too long — this portal caps passwords at 16 characters. Please give a shorter one.';
      }
      const payload: Extract<Step['payload'], { channel: 'account' }> = {
        channel: 'account',
        url,
        phase,
        identifier: typeof args.identifier === 'string' ? args.identifier : undefined,
        password,
        fields: fields.length ? fields : undefined,
        code: typeof args.code === 'string' ? args.code : undefined,
      };
      deps.proposeSteps([
        {
          id: 'account-' + Date.now().toString(36),
          caseId: 'account',
          intent: 'account_' + phase,
          channel: 'account',
          counterparty: { role: 'OTHER' },
          payload,
          successCondition: { describe: 'Account ' + phase, kind: 'manual' },
          requiresConsent: phase !== 'verify',
          status: 'awaiting_consent',
        },
      ]);
      return phase === 'verify'
        ? 'Finishing the login with that code — will confirm once signed in.'
        : `Ready to ${phase === 'signup' ? 'create the account' : 'log in'}. Ask the parent to reply YES to proceed (or NO to change it).`;
    }
    case 'submit_form': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide the form url.';
      deps.proposeSteps([
        {
          id: 'submit-' + Date.now().toString(36),
          caseId: 'form',
          intent: 'submit_form',
          channel: 'submit',
          counterparty: { role: 'OTHER' },
          payload: { channel: 'submit', url },
          successCondition: { describe: 'Form submitted', kind: 'reference_received' },
          requiresConsent: true,
          status: 'awaiting_consent',
        },
      ]);
      return 'Ready to submit the form. Ask the parent to reply YES to submit (or NO to change it).';
    }
    case 'get_form_recipe': {
      const url = String(args.url ?? '').trim();
      if (!url) return 'Provide a form url.';
      const r = await getFormRecipe(url);
      if (!r) return 'No saved recipe for that form yet.';
      const parts: string[] = [];
      if (r.fills.length) parts.push(`Fields: ${r.fills.map((f) => f.label).join(', ')}`);
      if (r.controls.length) parts.push(`Controls: ${r.controls.map((c) => `${c.label} (${c.kind})`).join(', ')}`);
      if (r.selects.length) parts.push(`Selects: ${r.selects.map((s) => `${s.name} → ${s.option}`).join(', ')}`);
      return `Recipe for ${r.url}:\n${parts.join('\n')}${r.notes ? `\nNotes: ${r.notes}` : ''}`;
    }
    case 'save_form_recipe': {
      const url = String(args.url ?? '').trim();
      if (!url) return 'Provide a form url.';
      const fills = Array.isArray(args.fills)
        ? (args.fills as Array<{ label?: unknown }>).map((f) => ({ label: String(f.label ?? '').trim() })).filter((f) => f.label)
        : [];
      const controls = Array.isArray(args.controls)
        ? (args.controls as Array<{ label?: unknown; kind?: unknown }>)
            .map((c) => ({ label: String(c.label ?? '').trim(), kind: (String(c.kind ?? '').toLowerCase() === 'checkbox' ? 'checkbox' : 'radio') as 'radio' | 'checkbox' }))
            .filter((c) => c.label)
        : [];
      const selects = Array.isArray(args.selects)
        ? (args.selects as Array<{ name?: unknown; option?: unknown }>)
            .map((s) => ({ name: String(s.name ?? '').trim(), option: String(s.option ?? '').trim() }))
            .filter((s) => s.name)
        : [];
      const recipe: FormRecipe = {
        url,
        title: typeof args.title === 'string' ? args.title : undefined,
        fills,
        controls,
        selects,
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      };
      await saveFormRecipe(recipe);
      return `Saved recipe for ${url} (${fills.length} fields, ${controls.length} controls, ${selects.length} selects). ${fills.length || controls.length || selects.length ? 'Next time I\u2019ll fill this form in one shot.' : ''}`;
    }
    case 'call_school': {
      deps.proposeSteps([callStep(deps)]);
      return 'Ready to call the school. Ask the parent to reply YES to place the call (or NO to skip it).';
    }
    case 'web_search': {
      const q = String(args.query ?? '').trim();
      if (!q) return 'Provide a query.';
      const res = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
      const txt = res.ok ? await res.text() : '';
      return truncate(txt || 'No results found.', 5000);
    }
    case 'web_fetch': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`);
      const txt = res.ok ? await res.text() : '';
      return truncate(txt || 'Could not fetch that page.', 4000);
    }
    case 'browser_open': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await browserOpen(url);
      return r.ok
        ? `Opened ${r.data}. Use browser_observe to see what is actionable on the page.`
        : `browser unavailable (${r.reason}). Fall back to web_fetch.`;
    }
    case 'browser_observe': {
      const r = await browserObserve(String(args.instruction ?? '').trim() || undefined);
      return r.ok ? JSON.stringify(r.data) : `browser unavailable (${r.reason}).`;
    }
    case 'browser_act': {
      const instruction = String(args.instruction ?? '').trim();
      if (!instruction) return 'Provide an instruction.';
      // Submitting a form must go through the gated `submit_form` step — browser_act is the ungated
      // arbitrary-action primitive and is the one consent-bypass path. Block submit-like actions here
      // (the internal gated browserSubmit still works via the executor, so this only stops the LLM
      // tool from directly clicking submit).
      if (/\b(submit|submits|submitting|send (this|the) form|complete (the|this) (form|application|enrollment)|finali[sz]e|submit button|hit submit)\b/i.test(instruction)) {
        return 'Use submit_form (the system gates it behind the parent\u2019s explicit YES) to submit — not browser_act.';
      }
      const r = await browserAct(instruction);
      return r.ok ? `Action done: ${r.data}` : `browser unavailable (${r.reason}).`;
    }
    case 'browser_extract': {
      const instruction = String(args.instruction ?? '').trim();
      const fields = Array.isArray(args.fields) ? (args.fields as unknown[]).map(String) : [];
      if (!instruction || !fields.length) return 'Provide an instruction and a fields array.';
      const r = await browserExtract(instruction, fields);
      return r.ok ? JSON.stringify(r.data) : `browser unavailable (${r.reason}).`;
    }
    case 'browser_vision': {
      const instruction = String(args.instruction ?? '').trim();
      if (!instruction) return 'Provide an instruction for the vision model.';
      const r = await browserVision(instruction);
      return r.ok ? r.data : `vision unavailable (${r.reason}).`;
    }
    case 'browser_fill': {
      const fields = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const norm = fields
        .map((f) => ({ label: String(f.label ?? '').trim(), value: String(f.value ?? '') }))
        .filter((f) => f.label);
      if (!norm.length) return 'Provide fields: [{label, value}]';
      const r = await browserFill(norm);
      if (!r.ok) return `browser unavailable (${r.reason}).`;
      const verif = r.data.verified === false
        ? ' (not machine-verified)'
        : r.data.mismatches?.length
          ? ` — ${r.data.mismatches.length} field(s) couldn\u2019t be filled: ${r.data.mismatches.map((m) => m.label).join(', ')}`
          : '';
      return `Pre-filled ${r.data.filled} field(s)${verif} on ${r.data.url ?? 'the form'}. NOT submitted — submission needs the parent\u2019s explicit YES.`;
    }
    case 'extract_pdf': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await extractPdf(url);
      return r.ok ? truncate(r.data.text, 4000) : `PDF extraction failed: ${r.reason}`;
    }
    case 'pdf_fields': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await listPdfFields(url);
      if (!r.ok || !r.data) return `PDF unavailable (${r.reason}).`;
      const fields = r.data.fields;
      if (!fields.length) return 'That PDF has no fillable form fields (flat or scanned PDF).';
      return (
        `${fields.length} field(s):\n` +
        fields
          .map(
            (f) =>
              `- ${f.label && f.label !== f.name ? `${f.label} → ` : ''}${f.name} (${f.type})${
                f.value ? ` = "${f.value}"` : ''
              }${f.options?.length ? ` [${f.options.join(' | ')}]` : ''}`,
          )
          .join('\n')
      );
    }
    case 'pdf_fill': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const raw = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; field?: unknown; value?: unknown }>)
        : [];
      const fields = raw
        .map((f) => ({
          label: f.label ? String(f.label).trim() : undefined,
          field: f.field ? String(f.field).trim() : undefined,
          value: String(f.value ?? ''),
        }))
        .filter((f) => f.label || f.field);
      if (!fields.length) return 'Provide fields: [{label?, field?, value}]';
      const r = await fillPdf(url, fields);
      if (!r.ok || !r.data) return `PDF fill failed (${r.reason}).`;
      const d = r.data;
      const parts = [`Filled ${d.filled}/${d.total} field(s) in a ${d.fieldCount}-field PDF.`];
      if (d.unmatched.length)
        parts.push(
          `Unmatched (no field name matched — use pdf_fields for exact names, then pass "field"): ${d.unmatched.join(', ')}.`,
        );
      if (d.failed.length)
        parts.push(`Failed: ${d.failed.map((x) => `${x.field} (${x.error})`).join(', ')}.`);
      if (d.filePath) parts.push(`Filled PDF saved to ${d.filePath}.`);
      parts.push(
        `NOT auto-submitted — share the filled PDF with the parent to review, then propose emailing/uploading it (needs the parent's YES).`,
      );
      return parts.join(' ');
    }
    case 'browser_assess': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const target = args.target ? String(args.target).trim() : undefined;
      const r = await browserAssessPage(url, target);
      if (!r.ok) return `browser unavailable (${r.reason}).`;
      const a = r.data;
      return `${a.ok ? 'VERIFIED' : 'POOR'} page (${a.url}): title="${a.title.slice(0, 60)}"; ${a.hasForm ? `${a.fieldCount} form field(s)` : 'NO form fields'}; ${a.blank ? 'BLANK page' : `${a.contentLength} chars`}; ${a.problem ? `problem: ${a.problem}` : 'matches target'}. If POOR, try the next search result.`;
    }
    case 'save_evidence': {
      const claim = String(args.claim ?? '').trim();
      const sourceUrl = String(args.source_url ?? '').trim();
      const sourceTitle = String(args.source_title ?? '').trim();
      if (!claim || !sourceUrl || !sourceTitle) return 'save_evidence needs claim, source_url, source_title.';
      const res = await createEvidence({
        claim,
        sourceUrl,
        sourceTitle,
        sourceType: typeof args.source_type === 'string' ? (args.source_type as SourceType) : undefined,
        evidenceSpan: typeof args.evidence_span === 'string' ? args.evidence_span : undefined,
        jurisdiction: typeof args.jurisdiction === 'string' ? (args.jurisdiction as EvidenceRecord['jurisdiction']) : undefined,
        official: typeof args.official === 'boolean' ? args.official : undefined,
        confidence: typeof args.confidence === 'number' ? args.confidence : undefined,
      });
      return `Saved evidence [${res.status}] "${claim}".${res.reasons.length ? ` Caveats: ${res.reasons.join('; ')}` : ' Verified.'}`;
    }
    case 'search_school_graph': {
      const query = String(args.query ?? '').trim();
      const districtId = String(args.district_id ?? '').trim() || districtKey(deps);
      let category = String(args.category ?? '').trim().toUpperCase();
      if (!category && query) category = inferCategory(query) ?? '';
      const chain = await searchSchoolGraph(districtId, category || undefined);
      return chain && chain.nodes.length ? chainSummary(chain) : 'No resource-graph chain found for that yet.';
    }
    case 'save_resource': {
      const type = String(args.type ?? '').trim();
      const title = String(args.title ?? '').trim();
      const url = String(args.canonical_url ?? '').trim();
      if (!type || !title || !url) return 'save_resource needs type, title, canonical_url.';
      const node: ResourceNode = {
        id: 'res-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        type: type as ResourceType,
        districtId: typeof args.district_id === 'string' ? args.district_id : undefined,
        category: typeof args.category === 'string' ? args.category.toUpperCase() : undefined,
        title,
        summary: String(args.summary ?? '').trim(),
        canonicalUrl: url,
        sources: [{ title, url }],
        status: (typeof args.status === 'string' ? args.status : 'draft') as ResourceNode['status'],
        confidence: typeof args.confidence === 'number' ? args.confidence : 0.6,
        discoveredAt: new Date().toISOString(),
      };
      await saveResource(node);
      return `Saved ${type} "${title}" to the resource graph.`;
    }
    case 'save_procedure': {
      const name = String(args.name ?? '').trim();
      const intent = String(args.intent ?? '').trim();
      const jurisdiction = String(args.jurisdiction ?? '').trim() || districtKey(deps);
      if (!name || !intent) return 'save_procedure needs name and intent.';
      const steps = Array.isArray(args.steps)
        ? (args.steps as Array<{ tool?: unknown; args?: unknown; note?: unknown }>)
        : [];
      const normSteps = steps.map((s, i) => ({
        order: i + 1,
        tool: String(s.tool ?? ''),
        args:
          typeof s.args === 'object' && s.args
            ? Object.fromEntries(Object.entries(s.args as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {},
        note: typeof s.note === 'string' ? s.note : undefined,
      }));
      const now = new Date().toISOString();
      const skill: Skill = {
        id: 'skill-' + makeSkillKey(intent, jurisdiction),
        name,
        key: makeSkillKey(intent, jurisdiction),
        description: String(args.description ?? '').trim(),
        whenToUse: String(args.when_to_use ?? '').trim(),
        steps: normSteps,
        evidenceDeps: Array.isArray(args.evidence_deps) ? (args.evidence_deps as string[]).map(String) : [],
        status: 'active',
        approved: Boolean(args.approved),
        version: 1,
        createdAt: now,
        updatedAt: now,
        lastVerifiedAt: now,
      };
      await saveSkill(skill);
      return `Saved procedure "${name}" [${skill.key}] with ${normSteps.length} step(s).${skill.approved ? '' : ' Pending parent approval before reuse.'}`;
    }
    case 'list_skills': {
      const skills = await listSkills();
      return skills.length ? skills.map(skillSummary).join('\n\n') : 'No saved procedures yet.';
    }
    case 'list_open_cases':
      return openCaseSummary(deps.getCases());
    case 'get_knowledge':
      return (
        (await deps.knowledge?.(String(args.category ?? ''), String(args.query ?? ''))) ??
        'No researched knowledge for that yet.'
      );
    case 'record_getting':
      return (await deps.memory?.addGetting(String(args.item ?? '').trim())) ?? 'Recorded.';
    case 'start_initiative':
      return (await deps.memory?.startInitiative(String(args.label ?? '').trim())) ?? 'Started.';
    case 'save_profile': {
      const c = Array.isArray(args.children) ? (args.children as Array<{ name?: string; grade?: string }>) : [];
      deps.saveProfile?.({
        children: c.map((x) => ({ name: String(x.name ?? ''), grade: x.grade ? String(x.grade) : undefined })),
        school: typeof args.school === 'string' ? args.school : undefined,
        location: typeof args.location === 'string' ? args.location : undefined,
        needs: Array.isArray(args.needs) ? (args.needs as string[]).map(String) : [],
        challenges: Array.isArray(args.challenges) ? (args.challenges as string[]).map(String) : [],
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      });
      return 'Saved.';
    }
    case 'log_case': {
      deps.appendCase({
        kind: String(args.kind ?? 'general'),
        summary: String(args.summary ?? ''),
        child: String(args.child ?? ''),
        contact: String(args.contact ?? ''),
        reminder: String(args.reminder ?? ''),
        status: 'open',
      });
      return 'Logged.';
    }
    case 'recall_history': {
      const query = String(args.query ?? '').trim();
      if (!query) return 'Provide a query to search the conversation for.';
      return (await deps.recall?.(query)) ?? 'Nothing found in the conversation.';
    }
    case 'set_reminder': {
      const what = String(args.what ?? '').trim();
      const when = String(args.when ?? '').trim();
      if (!what) return 'set_reminder needs "what" to remind about.';
      if (!when) return 'set_reminder needs a "when" (e.g. "Friday", "tomorrow at 3pm", "in 2 hours").';
      return (await deps.remind?.(what, when)) ?? `Got it — I'll remind you: ${what}.`;
    }
    case 'now':
      return new Date().toISOString();
    default:
      return 'Unknown tool.';
  }
}

/** Build a call step with a basic brief from the family profile (the brain's call_school tool). */
function callStep(deps: ToolDeps): Step {
  const p = deps.profile;
  const student = deps.studentName ?? p?.children?.[0]?.name ?? 'your child';
  const brief: CallBrief = {
    parentName: p?.parentName ?? 'the parent',
    student,
    grade: p?.children?.[0]?.grade ?? '',
    school: p?.school ?? 'the school',
    district: p?.district ?? '',
    goal: `resolve the school matter for ${student}`,
    whatWeKnow: p?.notes ?? '',
    cannotCommit: ['fees or payments', 'routes or schedules'],
  };
  return {
    id: 'call-' + Date.now().toString(36),
    caseId: 'call',
    intent: 'call_school',
    channel: 'call',
    counterparty: { role: 'HOMELESS_LIAISON' },
    payload: { channel: 'call', objective: brief },
    successCondition: { describe: 'Called the school', kind: 'manual' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };
}

export interface BrainContext {
  profile?: FamilyProfile;
  cases?: CaseRecord[];
  activeGoal?: string;
  lastAction?: string;
  /** Proposed actions still awaiting the parent's YES/NO (so the brain reminds, not re-proposes). */
  pendingActions?: string;
  /** Rolling compressed transcript so the brain keeps the thread beyond the history window. */
  summary?: string;
}

/** Human-readable summary of steps awaiting consent, for the brain's context. */
export function pendingActionsSummary(steps: Step[] | undefined): string {
  if (!steps?.length) return '';
  return steps
    .map((s) => {
      if (s.channel === 'email') {
        const p = s.payload as { channel: 'email'; subject: string };
        return `email to ${s.counterparty.name ?? s.counterparty.email ?? 'the school'} ("${p.subject}")`;
      }
      if (s.channel === 'call') {
        const p = s.payload as { channel: 'call'; objective: CallBrief };
        return `call ${s.counterparty.name ?? 'the school'} (${p.objective.goal})`;
      }
      if (s.channel === 'account') {
        const p = s.payload as { channel: 'account'; phase: string };
        const label =
          p.phase === 'signup' ? 'create the account' : p.phase === 'login' ? 'log into the account' : 'finish the login code';
        return `${label} (${s.intent})`;
      }
      if (s.channel === 'submit') return `submit the form (${s.intent})`;
      return `${s.channel}: ${s.intent}`;
    })
    .join('; ');
}

export function systemPrompt(ctx: BrainContext): string {
  const profile = ctx.profile;
  const kids = profile?.children?.length
    ? profile.children.map((c) => `${c.name}${c.grade ? ` (grade ${c.grade})` : ''}`).join(', ')
    : 'not set';
  const school = profile?.school ?? 'not set';
  const district = profile?.district ?? 'not set';
  const needs = profile?.needs?.length ? profile.needs.join(', ') : 'none on file';
  const challenges = profile?.challenges?.length ? profile.challenges.join(', ') : 'none on file';
  const notes = profile?.notes ? ` ${profile.notes}` : '';
  const openCases = (ctx.cases ?? []).filter((c) => c.status !== 'resolved');
  const openWork = openCases.length
    ? openCases
        .map((c) => `- ${c.kind} (${c.status}): ${c.summary}${c.child ? ` for ${c.child}` : ''}${c.contact ? ` — contact: ${c.contact}` : ''}${c.reminder ? ` — next: ${c.reminder}` : ''}`)
        .join('\n')
    : '- none right now';
  const now = ctx.activeGoal || 'no active task right now';
  const last = ctx.lastAction || 'none yet';
  const kid = profile?.children?.[0]?.name ?? 'your child';
  const audit = profile ? auditEntitlements(profile) : [];
  const auditStr = audit.length
    ? audit.map((a) => `- ${a.entitlement.title} (${a.status}) — ${a.entitlement.action}`).join('\n')
    : '- nothing flagged yet';
  const qs = profile ? discoveryQuestions(profile) : [];
  const qsStr = qs.length
    ? qs.map((q) => `- "${q.question}" — ${q.why} (outcome: ${q.impact})`).join('\n')
    : '- none right now';
  const emailInfo = profile?.email ? ` Email: ${profile.email}.` : '';
  const localeInfo = profile?.locale === 'es' ? ' They prefer Spanish.' : '';

  return (
    `You are a warm, BILINGUAL (English + Spanish) school liaison helping a parent over iMessage. YOUR JOB: for this family, find what their child is entitled to or eligible for but isn't yet receiving, then do the steps to close that gap — research it, find the form/program/contact, fill + submit with consent, or guide where you hit a hard wall. ALWAYS reply in the language of the parent's MOST RECENT message: if they wrote English, reply English; only reply in Spanish when they write Spanish (default English). Follow the conversation thread — remember what was just said and continue it; never act like you lost the last exchange. Be concise and warm in casual chat, but be THOROUGH when the parent wants programs/benefits — a long, specific, link-rich, program-by-program list beats a short skim there. Plain text (no **, #); simple "-" or numbered lines are fine for a list. ` +
    `GIVE LINKS (critical): for every program, site, or benefit you mention, include its source URL so it's TAPPABLE in iMessage (e.g. "ELO-P — https://www.suesd.org/elop", "Santa Cruz Public Library kids — https://..."). Never state a program without its link when you have a source. A parent should be able to tap straight through. ` +
    `THOROUGH + BREADTH: when the parent wants free programs/benefits, research BOTH the school/district programs AND around-town/community free resources — library kids programs & free tutoring, museum free days, city/county rec & after-school clubs, swim lessons, STEM/summer series, meal sites, grocery/EBT benefits. Give many (5-8+), each with: what it is, grade/age range, free or paid, who runs it, and how to get in, plus its link. A rich, specific list is the deliverable; don't stop at the first couple. ` +
    `ASK THE ONE UNLOCK QUESTION (AFTER you deliver, never before): if the free things hinge on income or meal eligibility, ask it once, framed as an insight — "Do you qualify for free or reduced-price lunch? That decides whether the school programs are free vs paid — want me to check and get you what applies?" Only ask when it genuinely unlocks something, and only AFTER you've already given the list. Do NOT ask unanswerable probes ("what is he struggling with", "which kind do you want", "what days work") — that's interrogation, not the unlock question. ` +
    `ACT FIRST, DON'T INTERROGATE: the parent is stressed and often doesn't know the answers. Do NOT ask a barrage of clarifying questions before helping. If there's a reasonable interpretation, act on it and offer the next step. Ask at most ONE question per turn, and only when you genuinely can't proceed without it AND it isn't in the profile/context. Never say "I want to get this right" or "when you say X, do you mean Y" when the context already makes it obvious — that reads as you not listening. ` +
    `NEVER MISREAD A PROGRAM AS AN UNRELATED WORD: program names and abbreviations are programs, not dictionary words. ELO-P / ELOP = Expanded Learning Opportunities Program. If the parent says a program or abbreviation you JUST named ("let's look into elop" right after you mentioned the ELO-P), treat it as that program and proceed — do NOT ask "do you mean elope?" or "is your child running away?". CKC, TK, IEP, 504, SST, ELO-P/ELOP are all programs/services, never a wrong guess. ` +
    `TIGHT LOOP (get there fast): "I don't know, I just need a program" → find the ACTUAL district/school programs → list 2-3 in plain language (what it is, who it's for, free/paid) → then immediately offer to get the child signed up ("Want me to sign Patrick up for the ELO-P? I'll need his name and grade.") → then open + fill the form. Lead with the answer and the action. Never make the parent pull the answer out of you. ` +
    `NEVER PUNT WITH "tell me which you want": you always have real, generally-available programs to offer as a baseline — California's ELO-P / Expanded Learning Opportunities Program (free, state-funded before/after-school, TK-6), 21st Century Community Learning Centers (federal afterschool funding, often free for low-income), free & reduced-price meals. Present these, then offer to confirm the exact one at the family's school and sign the child up. Even if live research is thin, give the real options and offer to confirm at the school — never ask the parent to describe "free school-run, paid tutoring, or at-home" first. ` +
    `Ask the ONE thing that's genuinely needed to sign up (child's name and grade if not on file; and if a fee waiver might apply, offer it rather than interrogating about income). Never ask "what days and times work", "what is he struggling with", or "which kind do you want" before delivering programs. ` +
    `You work for WHATEVER school or district the parent tells you (no fixed district). Determine the school + city/state from the profile or by asking the parent, then research THAT school/district. If the profile already has a school or district, use it and NEVER re-ask which school. If you don't know it, ask "Which school/district, and which city and state?" Only ask for a child's name/grade if the profile doesn't have them. ` +
    `You HAVE live internet access: use web_search to find anything about a school, district, policy, or law, and web_fetch to read a specific page. ` +
    `For JS-heavy portals, Google/Microsoft forms, or pages web_fetch cannot read, use browser_open then browser_observe/browser_act/browser_extract. For PDFs: use extract_pdf for policies/regulations; for FILLABLE PDF application forms use pdf_fields to list its fields, then pdf_fill to fill them (returns a completed PDF to review — never auto-submit; emailing/uploading it still needs the parent's YES). For pages the DOM/accessibility tree can't read (iframes, shadow DOM, image-rendered slides like a resources guide, or a form you can't see in the fields), use browser_vision to read them from a screenshot. ` +
    `VERIFY A PAGE BEFORE YOU FILL IT: a top web-search result is often a blank/dead/duplicate page while the real form is further down. Before filling a form, call browser_assess on the URL to confirm it's a real form for the right school/program. If it returns POOR, blank, no form fields, or doesn't match the school, do NOT fill it — search again and try the next result until you find one that VERIFIES. ` +
    `SIGN-UP FLOW (follow this to sign a student up for a school program): If the parent GAVE you the exact form URL, do NOT research or re-search — just browser_open that URL and fill it (skip browser_assess). Only research/search when the parent asked for a program but gave NO URL. Trust a parent-provided URL as-is and treat the form by its OWN title from the page — NEVER assume it's for the profile's default school or invent a school name for it (only name the school when the parent's request actually says it). If the parent sends a URL or repeats a form you ALREADY have open, do NOT re-open or re-assess it — continue from where you left off. To fill: text fields via browser_fill; checkboxes/radios/dropdowns via browser_act. Then share the form link for the parent to review, call submit_form (the system gates it behind the parent's YES), and after it submits SHARE the response link. ` +
    `FORM RECIPE (how you get better at forms over time — use it): before filling a form, call get_form_recipe with its URL. If a recipe exists, fill using the listed fields/controls/selects (with the parent's actual values) — no trial-and-error. After you successfully fill a NEW form, call save_form_recipe with the URL and the structure you filled (the field labels, radio/checkbox labels+types, select names+options). This way every form you work once, you fill perfectly forever after. ` +
    `Never submit a form without the parent's explicit consent, and never claim you submitted unless the step actually succeeded. ` +
    `ACCOUNT FLOW (for auth-gated portals/waitlists, e.g. a child-care waitlist that requires an account): to create or access the account, call account_action with phase "signup" (new) or "login" (returning) and the account details the parent gave you — it PROPOSES the step and the system gates it behind the parent's YES. If the result says a verification code was sent, tell the parent to check their email/phone and text you the code; when they send it, call account_action with phase "verify" and that exact code. KEEP THE PARENT IN THE LOOP THE WHOLE TIME: get their YES before creating/logging into an account, have them relay the verification code (it arrives in THEIR inbox/phone — that's proof it's really them), and never fill in or submit application details they didn't confirm. NEVER invent account details, and never claim you're signed in unless the step actually succeeded. Never state the parent\u2019s account password or a verification code back in a visible message, a summary, or any explanation — keep them only inside the account_action call, which the system redacts from logs. ` +
    `LIMITS & HANDOFF (be precise — say the SPECIFIC step, not a blanket "can't fill forms"): if a page says "sign in to continue", "must be signed in", or shows a CAPTCHA / "I'm not a robot", you have hit a hard wall that automation cannot pass. DO NOT try to bypass it and do NOT claim you did. Tell the parent plainly which single step needs them: "I've filled in everything I can, but this form requires you to sign in yourself / pass a security check — here's the link, you'll need to finish that last step (just the sign-in)." Hand them the exact URL and offer the rest. You can still do everything up to that wall, and you can always draft the message or email it. ` +
    `When the parent asks for info you don't already have, ALWAYS use web_search / web_fetch first. Never say you don't have internet access or that you can't look it up. ` +
    `RESEARCH THOROUGHLY BEFORE YOU ANSWER — NEVER PRESENT A THIN OR PARTIAL ANSWER: keep searching and fetching (the school/district site, before/after-school, enrichment, ELO-P/ELOP, childcare, enrollment, fee, program-list pages) until you have SPECIFIC results (program names, grade range, free/paid, how to sign up). If a query or page returns nothing, try a DIFFERENT query and a DIFFERENT page — don't stop. Only present once you have concrete programs. Never settle for "I don't have the list / I won't make one up / tell me which you want" — that's giving up, not helping. ` +
    `DISAMBIGUATE SCHOOLS (ONLY genuinely ambiguous SCHOOL names — never a program, acronym, or anything the context already makes clear): if the school isn't one you have on file, or it's a common name (Lakeside, Lincoln, Washington, etc.), ask which city and state it's in, then include the city/state in every web search (e.g. "Lakeside School Seattle WA", "Lakeside School Seattle WA afterschool math") AND save it on the profile (save_profile with school + location). Never research or assume a different school with the same name. ` +
    `If a search result looks relevant but is incomplete, call web_fetch on that result's URL to read the full page. ` +
    `Only if a search genuinely finds nothing AFTER a thorough effort, say so plainly and offer to keep looking or confirm with the school — never stop at the first thin result. ` +
    `Remember the conversation — don't re-ask things already answered. Don't announce you're an AI, a demo, or a bot. ` +
    `You can query the WHOLE conversation history with recall_history (search by a keyword or phrase) if you need an earlier detail that isn't in your immediate context — use it rather than re-asking the parent. ` +
    `NEVER quote statutes, case numbers, or section codes to the parent. Say what the child has a RIGHT to in plain words ("Patrick has a right to a bus and I'm requesting it"). Statutes may only appear when you draft a message TO the school, as leverage. ` +
    `Be INSANELY PROACTIVE as the default. Answer briefly, then ALWAYS propose the concrete next action and offer to do it — never just inform or hand off. ` +
    `Turn every answer into an action and ask a quick yes/no, e.g.: "I can draft an email to the district liaison about the summer-meal sign-up — want me to send it?", "I can call the office about the bus — want me to?", "I can set a follow-up reminder for Friday." ` +
    `NEVER end with a passive handoff — no "contact X", "please reach out to", "your best bet is to". Instead offer: "I can reach out to X for you — want me to?" ` +
    `Act for the parent: when you decide to send an email or place a call, CALL the send_email / call_school tool RIGHT AWAY. The system enforces a hard consent gate and will ask the parent for a YES/NO before anything is actually sent — so do NOT ask for consent yourself. Just call the tool; it proposes the action and the system gates it. Log with log_case and set a follow-up reminder. ` +
    `You CAN place phone calls: if the parent asks you to call the school, office, district, principal, or "them," call the call_school tool. Never say you can't make calls — you can. ` +
    `REMINDERS: when the parent asks to be reminded of something ("remind me to…", "remind me on Friday", "set a reminder for…"), CALL the set_reminder tool with the thing and the time — it schedules and messages them at that time. Never just say "ok" — actually call set_reminder, and confirm back when you'll remind them. ` +
    `NEVER say you can't help, can't do it, can't access, can't fill, don't have that ability, or that you're just coordinating. You ACT for the parent and drive it — if something's needed, say you'll do it and handle it. ` +
    `CONNECT & SEND EMAIL (optional — offer, NEVER gate help on it): to email the school, draft it and SHOW the parent the readable text (To / Subject / body) so they review it. Their choice: reply "send it" (or "yes") and you send it from their connected Gmail via the agent — reliable + from them, still consent-gated. Do NOT send a huge Gmail compose URL (it only pre-fills on desktop web, not mobile). If they ask to send it themselves instead, a plain mailto link is fine. Never make connecting email a prerequisite to helping. ` +
    `Use save_profile to remember the family, and log_case for new items. ` +
    `When the parent says "try again", "again", "repeat", "redo", "go on", "continue", "that" — they mean REPLAY or CONTINUE the ENTIRE last thing YOU just said (the programs, the list, the offer). Re-present that SAME list/offer, do NOT switch to a different topic, do NOT research a new angle. Use the LAST ACTION shown just below. Never act lost. ` +
    `If the parent says something UNRELATED while a PENDING ACTION is waiting for their YES/NO, answer what they said normally, then at the END briefly remind them the action is still waiting (e.g. "Still want me to call the school? Reply yes or no."). Do NOT re-propose the same action or ask a fresh yes/no for it — just remind. ` +
    `READ TYPOS & CORRECTIONS AS THE SAME PROGRAM: the parent types fast. "flop"/"elop"/"elp"/"elop" = ELO-P (Expanded Learning Opportunities Program). If they write a program name or abbreviation you JUST named, or the one you're already signing up for, treat it as that program and continue — never re-ask, never re-open, never re-research it. A short follow-up (a program name, "ok", "continue", "go ahead", a typo fix) means "KEEP GOING with the current thing." ` +
    `NEVER RESTART MID-SIGNUP: the moment you've found the program and opened the form, you are mid-signup. Do NOT re-search, re-open, or say "one moment, I'm on it" again. If the parent then sends anything that isn't the required fields (a correction, "ok", the program name), CONTINUE the same sign-up: name the program you're on and re-ask ONLY the fields you still need (e.g. "I'm on the ELO-P sign-up — I just need your email, Patrick's last name, birthdate, and your name/phone. Can you send those?"). Never start the research over. ` +
    `\nFAMILY & SITUATION (refreshed every message — use it, don't re-ask): ${kids} at ${school} (${district}). Needs: ${needs}. Challenges: ${challenges}.${notes}${emailInfo}${localeInfo}` +
    `\nOPEN WORK:\n${openWork}` +
    (ctx.pendingActions ? `\nPENDING ACTIONS (proposed, waiting for the parent's YES/NO): ${ctx.pendingActions}` : '') +
    (ctx.summary ? `\nCONVERSATION SO FAR (the thread — use it, don't re-ask):\n${ctx.summary}` : '') +
    `\nNOW: ${now}. LAST ACTION: ${last}.` +
    `\nENTITLED TO (audited against the family — pursue these):\n${auditStr}` +
    `\nTHINGS I CAN ALSO DO FOR ${kid} (offer these, one at a time, AFTER you've already helped — never interrogate the parent with them):\n${qsStr}` +
    `\nMISSION (the whole point): figure out the delta between what ${kid} is entitled to / eligible for and what they're ACTUALLY receiving — then DO the steps to close it. Never just inform. For each benefit name what the child gets if it's closed (${kid} arrives at school; gets lunch; gets the assessment; gets into a free before/after-school program) and drive it yourself. ` +
    `PURSUE the concrete, provable gaps AND the available benefits: transportation, meals, attendance, an evaluation/accommodation, language support, summer access, AND free/low-cost before- & after-school programs and enrichment (fee waivers, 21st Century Community Learning Centers, district programs). These are real benefits — NOT noise. If the parent asks about a program, research the ACTUAL district/school programs (program names, ages/grades, fees, form links, contacts, deadlines) and sign the child up. ` +
    `For each, name the measurable outcome and drive it yourself — draft the email (send_email), place the call (call_school), request the application/evaluation (log_case + a follow-up reminder), or open + fill the sign-up form (browser_open → browser_assess → browser_fill → submit_form, consent-gated). You execute it, you don't just point at it.`
  );
}

/** School name with its city/state disambiguation, so research targets the right one. */
function qualifiedProfileSchool(p?: FamilyProfile): string {
  if (!p?.school) return 'your school district';
  return p.location?.trim() ? `${p.school} ${p.location.trim()}` : p.school;
}

/** The stable district key for the family's resolved district (knowledge-graph key). */
function districtKey(deps: ToolDeps): string {
  if (deps.district?.id) return deps.district.id;
  return districtIdFromName(deps.profile?.district ?? qualifiedProfileSchool(deps.profile));
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
```

---
## src/agent/intention.ts

```ts
import type { FamilyProfile } from '../domain/types.js';

/**
 * Axolotl Intelligence Layer — belief-over-goal + information-gain policy.
 *
 * Grounded in (verified) findings:
 *  - Active Task Disambiguation (Kobalczyk, ICLR 2025): task ambiguity via the objective
 *    indicator 1{h ⊨ R}; BED EIG; **even-partition** is the information-gain-maximizing
 *    question under a uniform prior over H.
 *  - HypoSearch (2026-09): divergent states → hypothesis generation → bounded branches →
 *    comparative aggregation; exploration failures dominate (~78% on BrowseComp).
 *  - DualStake (2026-09): calibrate confidence on **evidence** (E-Conf), not answer.
 *  - Severance (2026-07): structured ignorance — an explicit inventory of the family
 *    dimensions we have NOT confirmed, marked `[unknown]`, with the `decisionFlip` subset.
 *  - Active Inference as Context Acquisition (2026-06): value-of-information rule — acquire
 *    context only when the expected reduction in relevant uncertainty justifies its cost;
 *    `stop`/`commit`/`handoff` are first-class actions.
 *
 * This is intentionally a pure, deterministic core so it can be unit-tested without an LLM or
 * browser. Hypothesis *generation* is injected by the caller (LLM/research); the belief state,
 * info-gain scoring, and the ask/research/stop policy live here.
 */

// ------------------------------------------------------------------ structured ignorance

export type FamilyDimension =
  | 'residency'
  | 'grade'
  | 'school'
  | 'schoolType'
  | 'incomeEligibility'
  | 'language'
  | 'iep504'
  | 'docsOnHand'
  | 'existingEnrollment';

export interface FamilyUnknown {
  dimension: FamilyDimension;
  /** true if the profile already confirms this dimension. */
  known: boolean;
  value?: string;
  /** Absence of this dimension could CHANGE which program/entitlement a family qualifies for. */
  decisionFlip: boolean;
  /** Sensitive (housing/residency) — for displaced families we hand off rather than interrogate. */
  sensitive: boolean;
  /** The clarifying question to ask if we need this dimension. */
  askPrompt: string;
}

/** Priority order for choosing which decision-flip unknown to ask about first (highest first). */
const DIMENSION_PRIORITY: FamilyDimension[] = [
  'residency',
  'schoolType',
  'school',
  'grade',
  'incomeEligibility',
  'iep504',
  'existingEnrollment',
  'docsOnHand',
  'language',
];

const DIMENSION_SPECS: Record<FamilyDimension, { decisionFlip: boolean; sensitive?: boolean; askPrompt: string }> = {
  residency: {
    decisionFlip: true,
    sensitive: true,
    askPrompt: 'Which district or city do you live in now? That determines which enrollment portal and programs apply.',
  },
  schoolType: {
    decisionFlip: true,
    askPrompt: 'Is your child in a public, private, or charter school? Public-school benefits depend on that.',
  },
  school: {
    decisionFlip: true,
    askPrompt: 'Which school does your child go to (or the one nearest you)?',
  },
  grade: {
    decisionFlip: true,
    askPrompt: "What grade is your child in? Program eligibility often depends on it.",
  },
  incomeEligibility: {
    decisionFlip: true,
    askPrompt: 'Do you receive SNAP/CalFresh or does your household income fall under the free-or-reduced-price meal limit?',
  },
  iep504: {
    decisionFlip: true,
    askPrompt: 'Does your child have an IEP or a 504 plan? Special-education services follow a different path.',
  },
  existingEnrollment: {
    decisionFlip: false,
    askPrompt: 'Is your child already enrolled at a school in this district?',
  },
  docsOnHand: {
    decisionFlip: false,
    sensitive: true,
    askPrompt: 'Do you have proof of residency (like a utility bill or lease) and the child’s birth certificate handy?',
  },
  language: {
    decisionFlip: false,
    askPrompt: 'Which language should I send forms and notices in — English or Spanish?',
  },
};

function profileValue(profile: FamilyProfile, dimension: FamilyDimension): { known: boolean; value?: string } {
  switch (dimension) {
    case 'residency':
      return profile.location ? { known: true, value: profile.location } : { known: false };
    case 'schoolType':
      return profile.schoolType && profile.schoolType !== 'unknown'
        ? { known: true, value: profile.schoolType }
        : { known: false };
    case 'school':
      return profile.school ? { known: true, value: profile.school } : { known: false };
    case 'grade':
      return profile.children[0]?.grade
        ? { known: true, value: profile.children[0].grade }
        : { known: false };
    case 'incomeEligibility': {
      const got = (profile.getting ?? []).join(' ').toLowerCase();
      const needs = (profile.needs ?? []).join(' ').toLowerCase();
      const hasMeals = /meal|lunch|breakfast|snap|calfresh|free.{0,3}reduc/.test(got + ' ' + needs);
      return hasMeals ? { known: true, value: 'likely-eligible' } : { known: false };
    }
    case 'iep504': {
      // "speech" or "special needs" is a NEED, not a confirmed IEP/504 status. Only treat it as
      // known if the family explicitly reports an IEP or 504 — otherwise it stays a decision-flip
      // unknown (exactly the fuzzy case: needing speech services doesn't mean they have an IEP).
      const c = (profile.challenges ?? []).join(' ').toLowerCase();
      const hasIep = /\b(iep|504)\b/.test(c);
      return hasIep ? { known: true, value: 'has-iep-504' } : { known: false };
    }
    case 'existingEnrollment':
      return profile.school ? { known: true, value: profile.school } : { known: false };
    case 'docsOnHand':
      return { known: false };
    case 'language':
      return profile.locale ? { known: true, value: profile.locale } : { known: false };
  }
}

/** Build the structured-ignorance inventory for a family (Severance schema, family-domain). */
export function structuredIgnorance(profile: FamilyProfile): FamilyUnknown[] {
  return (Object.keys(DIMENSION_SPECS) as FamilyDimension[]).map((dimension) => {
    const spec = DIMENSION_SPECS[dimension]!;
    const { known, value } = profileValue(profile, dimension);
    return { dimension, known, value, decisionFlip: spec.decisionFlip, sensitive: spec.sensitive ?? false, askPrompt: spec.askPrompt };
  });
}

/**
 * The decision-flip unknowns we have NOT yet confirmed. Pass `allowSensitive = false` in a
 * displaced/homeless/housing-sensitive context so the agent never interrogates residency/housing.
 */
export function unknownDecisionFlips(unknowns: FamilyUnknown[], allowSensitive = true): FamilyUnknown[] {
  return unknowns
    .filter((u) => u.decisionFlip && !u.known && (allowSensitive || !u.sensitive))
    .sort((a, b) => DIMENSION_PRIORITY.indexOf(a.dimension) - DIMENSION_PRIORITY.indexOf(b.dimension));
}

/** Pick the clarifying question targeting the highest-value decision-flip unknown (or null if none). */
export function askFromUnknowns(unknowns: FamilyUnknown[], allowSensitive = true): string | null {
  const flip = unknownDecisionFlips(unknowns, allowSensitive);
  return flip[0]?.askPrompt ?? null;
}

// ------------------------------------------------------------------ belief state / hypotheses

export type SubClaimKind = 'formUrl' | 'deadline' | 'eligibility' | 'contact' | 'docs';

export interface SubClaim {
  kind: SubClaimKind;
  value?: string;
  /** Has this piece of grounding been confirmed against an authoritative source? */
  attested: boolean;
  source?: string;
}

export interface Hypothesis {
  id: string;
  claim: string;
  program?: string;
  /** A soft direction label (HypoSearch): a direction to explore, NOT a claim to prove. */
  direction: string;
  subClaims: SubClaim[];
  /** 0..1 — belief that this hypothesis is the right one (which program/form applies). */
  belief: number;
  /** 0..1 — evidence-confidence (DualStake E-Conf): how well-attested the grounding is. */
  evidenceConfidence: number;
  /**
   * What this hypothesis ASSUMES along decision-flip dimensions. Used to compute the information
   * gain of a clarifying question: a question that splits the hypotheses by their differing
   * assumptions is informative (TAD even-partition rule). A hypothesis with no stated assumption
   * for a dimension clusters into a '?' bucket and thus lowers that question's EIG.
   */
  assumptions?: Partial<Record<FamilyDimension, string>>;
}

export type IntentionStatus = 'divergent' | 'concentrated' | 'committed' | 'unresolvable';

export interface Intention {
  message: string;
  profile: FamilyProfile;
  unknowns: FamilyUnknown[];
  hypotheses: Hypothesis[];
  status: IntentionStatus;
  divergenceReason?: string;
  /** Human-readable trace of why this status/decision (for transparency, and later Ask-F1 labels). */
  reasoning: string;
}

/** Normalize beliefs to a distribution and return Shannon entropy (bits). */
export function beliefEntropy(hypotheses: Hypothesis[]): number {
  const total = hypotheses.reduce((s, h) => s + h.belief, 0);
  if (total <= 0 || hypotheses.length === 0) return 0;
  let entropy = 0;
  for (const h of hypotheses) {
    const p = h.belief / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Evidence-confidence required for a hypothesis to be treated as committed (DualStake: real grounding, not belief). */
export const EVIDENCE_COMMIT_THRESHOLD = 0.6;
/** Belief dominance threshold for picking a directional leader when evidence is weak (miscalibrated LLM prior). */
export const BELIEF_DOMINANCE = 0.65;

/**
 * The hypothesis we COMMIT to is the best-EVIDENCED one (highest evidence-confidence above the
 * commit threshold) — NOT the highest raw LLM belief. LLM beliefs are miscalibrated (DualStake),
 * whereas attestation is real; so evidence, not belief concentration, gates the commitment.
 */
export function committedHypothesis(hypotheses: Hypothesis[]): Hypothesis | null {
  if (hypotheses.length === 0) return null;
  const best = [...hypotheses].sort((a, b) => b.evidenceConfidence - a.evidenceConfidence)[0]!;
  return best.evidenceConfidence >= EVIDENCE_COMMIT_THRESHOLD ? best : null;
}

/** The candidate to act on: the committed (best-evidenced) hypothesis, else the directional belief leader. */
export function concentrated(hypotheses: Hypothesis[], beliefThreshold = BELIEF_DOMINANCE): Hypothesis | null {
  const commit = committedHypothesis(hypotheses);
  if (commit) return commit;
  const total = hypotheses.reduce((s, h) => s + h.belief, 0) || 1;
  const best = [...hypotheses].sort((a, b) => b.belief - a.belief)[0]!;
  return best.belief / total >= beliefThreshold ? best : null;
}

export function divergence(hypotheses: Hypothesis[], beliefThreshold = BELIEF_DOMINANCE): IntentionStatus {
  if (hypotheses.length === 0) return 'unresolvable';
  if (committedHypothesis(hypotheses)) return 'committed';
  if (concentrated(hypotheses, beliefThreshold)) return 'concentrated';
  if (hypotheses.length >= 2) return 'divergent';
  return 'concentrated';
}

// ------------------------------------------------------------------ information gain (BED / even-partition)

/**
 * Expected information gain of a question, under a **uniform prior over H** (TAD's uniformity
 * assumption). A question's answers partition H into buckets; EIG = H(prior) − E[H(posterior)].
 * Max when the answer buckets are **equal-sized** (TAD Corollary 1).
 */
export function eigForPartition(bucketSizes: number[], total: number): number {
  if (total <= 0) return 0;
  const priorEntropy = Math.log2(total);
  let expectedPosterior = 0;
  for (const n of bucketSizes) {
    if (n <= 0) continue;
    const p = n / total;
    // Posterior after landing in a bucket is uniform over that bucket => log2(n).
    expectedPosterior += p * Math.log2(n);
  }
  return Math.max(0, priorEntropy - expectedPosterior);
}

export interface CandidateAction {
  kind: 'ask' | 'research';
  label: string;
  /** Friction for asking; tokens/minutes for research (the ACI cost term). */
  cost: number;
  /** How this action splits the hypothesis space (bucket = hypotheses giving the same answer/evidence). */
  partitionSizes: number[];
}

export interface ScoredAction extends CandidateAction {
  eig: number;
  /** eig normalized by cost — the "is it worth it" signal. */
  score: number;
}

/** Score each candidate action by `eig − cost`; the even-partition rule drives `eig`. */
export function scoreActions(actions: CandidateAction[], total: number): ScoredAction[] {
  return actions.map((a) => {
    const eig = eigForPartition(a.partitionSizes, total);
    return { ...a, eig, score: eig - a.cost };
  });
}

/**
 * Build the candidate clarifying questions from the UNCONFIRMED decision-flip unknowns, each scored
 * by how well it discriminates the current hypothesis space. We group the hypotheses by the value
 * each ASSUMES for the dimension, and a question only counts if that split is non-trivial (eig > 0).
 * These are *family-private* facts that research cannot resolve, so the value-of-information policy
 * prefers them over research when present.
 */
export function buildAskCandidates(
  unknowns: FamilyUnknown[],
  hypotheses: Hypothesis[],
  askCost: number,
  allowSensitive = true,
): CandidateAction[] {
  const out: CandidateAction[] = [];
  for (const u of unknownDecisionFlips(unknowns, allowSensitive)) {
    const buckets = new Map<string, number>();
    for (const h of hypotheses) {
      const key = h.assumptions?.[u.dimension] ?? '?';
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const sizes = [...buckets.values()];
    const eig = eigForPartition(sizes, hypotheses.length);
    // Only a genuinely discriminating (≥2 buckets, eig > 0) question is worth considering.
    if (buckets.size < 2 || eig <= 0) continue;
    out.push({ kind: 'ask', label: u.askPrompt, cost: askCost, partitionSizes: sizes });
  }
  return out;
}

// ------------------------------------------------------------------ value-of-information decision (ACI)

export interface IntentionDecision {
  action: 'ask' | 'research' | 'commit' | 'handoff';
  reason: string;
  question?: string;
  researchQuery?: string;
  evidenceNeeded?: SubClaimKind[];
  scored: ScoredAction[];
}

export interface PolicyOptions {
  /** value-of-information threshold — acquiring context is only worth it if eig > cost by this much. */
  minValue: number;
  /** budget of context actions left this turn. */
  budgetUsed: number;
  budgetCap: number;
  askCost: number;
  /** For an 'ask', the fallback decision-flip question if no candidate action is better. */
  decisionFlipQuestion?: string | null;
  /** When false, sensitive dimensions (housing/residency) are excluded from ask candidates. */
  allowSensitive?: boolean;
  evidenceNeeded?: SubClaimKind[];
  /** If provided, used as the research query when grounding a concentrated-but-unattested hypothesis. */
  groundQuery?: string;
}

/** The sub-clam kinds that are not yet attested (the grounding we must confirm before commit). */
export function unAttestedKinds(h: Hypothesis): SubClaimKind[] {
  return h.subClaims.filter((s) => !s.attested).map((s) => s.kind);
}

/** A research query that grounds a concentrated hypothesis (DualStake: evidence-confidence for commit). */
export function groundingQueryFor(h: Hypothesis): string {
  const needed = unAttestedKinds(h);
  return `${h.claim} — verify the ${needed.join(', ') || 'details'}`;
}

/**
 * ACI value-of-information decision over the shared hypothesis space.
 *
 * Branches on the belief status (HypoSearch + DualStake + ACI):
 *  - **committed**  → belief concentrated & grounding attested → **commit**.
 *  - **concentrated** → belief concentrated but evidence weak → **research to GROUND** the winning
 *    hypothesis' sub-claims (evidence-confidence must reach the commit threshold); discriminating
 *    EIG is ~0 here, so this is a grounding action, not a discriminating one.
 *  - **divergent**  → several plausible directions. Prefer an unconfirmed **family-private
 *    decision-flip** ask (research can't resolve a private fact about the family); if none, choose
 *    the highest `eig − cost` **research** action to discriminate; else ask a decision-flip.
 *  - **unresolvable** / budget exhausted / nothing clears the threshold → **handoff** (never
 *    fabricate a URL or deadline).
 */
export function decide(
  intention: Intention,
  researchActions: CandidateAction[],
  opts: PolicyOptions,
): IntentionDecision {
  const { hypotheses, unknowns } = intention;
  const status = divergence(hypotheses);
  const count = hypotheses.length;
  const best = concentrated(hypotheses);

  if (status === 'committed' && best) {
    return {
      action: 'commit',
      reason: `Belief concentrated on "${best.claim}" with grounded evidence — committing.`,
      scored: [],
    };
  }

  if (opts.budgetUsed >= opts.budgetCap) {
    return {
      action: 'handoff',
      reason: 'Context-acquisition budget exhausted; asking the parent rather than guessing.',
      question: opts.decisionFlipQuestion ?? undefined,
      scored: [],
    };
  }

  // Concentrated but not yet attested -> ground the winning hypothesis so we can commit (DualStake).
  if (status === 'concentrated' && best) {
    const needed = unAttestedKinds(best);
    return {
      action: 'research',
      reason: `Belief concentrated on "${best.claim}" but evidence is not yet attested — grounding before commit.`,
      researchQuery: opts.groundQuery ?? groundingQueryFor(best),
      evidenceNeeded: needed,
      scored: [],
    };
  }

  // Priority: a family-private decision-flip ask over research, because research can't answer it.
  const askCandidates = buildAskCandidates(unknowns, hypotheses, opts.askCost, opts.allowSensitive ?? true);
  const scoredAsks = scoreActions(askCandidates, count);
  const bestAsk = scoredAsks
    .filter((a) => a.score > opts.minValue)
    .sort((a, b) => b.score - a.score)[0];
  if (bestAsk) {
    return {
      action: 'ask',
      reason: `Unconfirmed family-private decision-flip factor — ask the most informative one first (eig ${bestAsk.eig.toFixed(2)} − cost ${bestAsk.cost}).`,
      question: bestAsk.label,
      scored: scoredAsks,
    };
  }

  // No private decision-flip ask remains informative -> ground public info via research.
  const scored = scoreActions(researchActions, count);
  const bestResearch = scored
    .filter((a) => a.score > opts.minValue)
    .sort((a, b) => b.score - a.score)[0];

  if (bestResearch) {
    return {
      action: 'research',
      reason: `Research query has the highest value-of-information (eig ${bestResearch.eig.toFixed(2)} − cost ${bestResearch.cost}). ` +
        `Gathering grounding for ${bestResearch.label}.`,
      researchQuery: bestResearch.label,
      evidenceNeeded: opts.evidenceNeeded,
      scored,
    };
  }

  // No action is worth its cost. If a decision-flip unknown remains, ask it; else honest handoff.
  if (opts.decisionFlipQuestion) {
    return {
      action: 'ask',
      reason: `No action clears the information threshold, but a decision-flip unknown remains: ${opts.decisionFlipQuestion}`,
      question: opts.decisionFlipQuestion,
      scored: [],
    };
  }
  return {
    action: 'handoff',
    reason: 'Residual uncertainty is not worth the cost of acquiring more context; telling the parent honestly rather than guessing.',
    scored: [],
  };
}

// ------------------------------------------------------------------ Ask-F1 instrumentation (HiL-Bench)

/**
 * Measures the ask layer, per HiL-Bench's **Ask-F1** — the harmonic mean of *question-precision*
 * (of the questions we asked, how many were necessary/relevant, not spam) and *blocker-recall*
 * (of the true blockers, how many we surfaced). This is how we stop over-asking and start catching
 * the blockers that genuinely block the family.
 */
export class AskF1Tracker {
  private asked = 0;
  private relevant = 0;
  private blockersTotal = 0;
  private blockersSurfaced = 0;

  /** Record that we asked a clarifying question. */
  recordAsk(relevant: boolean): void {
    this.asked++;
    if (relevant) this.relevant++;
  }
  /** Record a ground-truth blocker (a real obstacle the family faces). */
  recordBlocker(surfaced: boolean): void {
    this.blockersTotal++;
    if (surfaced) this.blockersSurfaced++;
  }
  /** question-precision: of the questions asked, the fraction that were actually necessary. */
  get precision(): number {
    return this.asked === 0 ? 0 : this.relevant / this.asked;
  }
  /** blocker-recall: of the true blockers, the fraction we surfaced. */
  get recall(): number {
    return this.blockersTotal === 0 ? 0 : this.blockersSurfaced / this.blockersTotal;
  }
  /** Ask-F1: harmonic mean of precision and recall (0 if either is 0). */
  get askF1(): number {
    const p = this.precision;
    const r = this.recall;
    return p + r === 0 ? 0 : (2 * p * r) / (p + r);
  }
  get summary(): string {
    return `asked=${this.asked} relevant=${this.relevant} precision=${this.precision.toFixed(2)} ` +
      `blockers=${this.blockersTotal} surfaced=${this.blockersSurfaced} recall=${this.recall.toFixed(2)} Ask-F1=${this.askF1.toFixed(2)}`;
  }
}

/** Assemble the belief state from a message + profile + a hypothesis set (hypotheses come from caller/LLM). */
export function buildIntention(
  message: string,
  profile: FamilyProfile,
  hypotheses: Hypothesis[],
): Intention {
  const unknowns = structuredIgnorance(profile);
  const status = divergence(hypotheses);
  const best = concentrated(hypotheses);
  const divFlips = unknownDecisionFlips(unknowns);

  const reasoning = status === 'committed'
    ? `Committed to "${best?.claim}" (evidence-confident).`
    : status === 'divergent'
      ? `Divergent state: ${hypotheses.length} plausible directions, no dominant one. ` +
        `Unconfirmed decision-flip dimensions: ${divFlips.map((u) => u.dimension).join(', ') || 'none'}.`
      : status === 'concentrated'
        ? `Belief concentrated on "${best?.claim}" but evidence not yet attested — ground it before committing.`
        : 'No plausible hypotheses; cannot resolve from current evidence.';

  return {
    message,
    profile,
    unknowns,
    hypotheses,
    status,
    divergenceReason: status === 'divergent' ? `entropy ${beliefEntropy(hypotheses).toFixed(2)} bits over ${hypotheses.length} directions` : undefined,
    reasoning,
  };
}

// ------------------------------------------------------------------ LLM hypothesis mapping + grounding

export interface RawHypothesis {
  claim: string;
  direction: string;
  program?: string;
  assumptions?: Record<string, string>;
  belief: number;
}

/**
 * Map LLM-generated hypotheses (the "solution space") onto the `Intention` Hypothesis shape.
 * Sub-claims start unattested (evidence-confidence is 0 until research grounds them), and each
 * hypothesis is expected to need at least a form URL + deadline + eligibility/contact to commit.
 */
export function hypothesesFromLLM(raw: RawHypothesis[]): Hypothesis[] {
  return raw.map((r, i) => {
    const subClaims = [
      { kind: 'formUrl' as const, attested: false },
      { kind: 'deadline' as const, attested: false },
      { kind: 'eligibility' as const, attested: false },
      { kind: 'contact' as const, attested: false },
    ];
    return {
      id: `llm-${i}`,
      claim: r.claim,
      direction: r.direction,
      program: r.program,
      subClaims,
      belief: r.belief,
      evidenceConfidence: 0,
      assumptions: r.assumptions as Hypothesis['assumptions'],
    };
  });
}

/**
 * Ground the leading hypothesis by attesting its sub-claims from real research. `researchFn` is
 * injected (the agent supplies a function that runs the browser/knowledge graph); it returns
 * grounded claim results. This is the DualStake "evidence confidence" step: a hypothesis may be
 * strongly believed, but can only COMMIT once its grounding (form URL, deadline, contact) is real.
 */
export function groundIntention(
  intention: Intention,
  researchFn: (claim: string, kinds: SubClaimKind[]) => Promise<Partial<Record<SubClaimKind, { value: string; source: string }> | null>>,
): Promise<Intention> {
  const best = concentrated(intention.hypotheses);
  if (!best) return Promise.resolve(intention); // nothing dominant to ground
  const needed = unAttestedKinds(best);
  return researchFn(best.claim, needed).then((grounded) => {
    if (!grounded) return intention;
    const byId = new Map(intention.hypotheses.map((h) => [h.id, h]));
    const target = byId.get(best.id);
    if (!target) return intention;
    const next = { ...target, subClaims: target.subClaims.map((s) => s.attested ? s : { ...s, attested: !!grounded[s.kind], value: grounded[s.kind]?.value, source: grounded[s.kind]?.source }) };
    const attestedCount = next.subClaims.filter((s) => s.attested).length;
    next.evidenceConfidence = next.subClaims.length ? attestedCount / next.subClaims.length : 0;
    byId.set(next.id, next);
    const hypotheses = [...byId.values()];
    return buildIntention(intention.message, intention.profile, hypotheses);
  });
}

export interface EvidenceNode {
  title?: string;
  summary?: string;
  url?: string;
}

const DEADLINE_RE = /(?:by|before|due|deadline|on|until)\s+(?:\w+\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?/i;
const CONTACT_RE = /[\w.+-]+@[\w-]+\.[\w.]+|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const ELIGIBILITY_RE = /\bfree\b.{0,3}\band\b.{0,3}\breduced\b|\bfree\/reduced\b|\bsnap\b|\bcalfresh\b|\bfood\s+(?:stamps|assistance)\b|\bincome\b.{0,12}eligib|18[0-9]%\s*(?:of|\bthe\b)?\s*.*?\bfederal\s+poverty\b|\bfederal\s+poverty|low.{0,6}income/i;

/**
 * Attest each requested sub-claim kind ONLY from evidence that genuinely supports THAT kind.
 * A single node is never permitted to attest every kind: `deadline`, `contact`, and `eligibility`
 * require the evidence to actually contain a date, an email/phone, or an eligibility signal
 * respectively. `formUrl` uses a real node URL. Any kind without genuine evidence is left out, so
 * the hypothesis can only reach `committed` on real grounding (and under-commits otherwise).
 */
export function extractGrounding(
  nodes: EvidenceNode[],
  kinds: SubClaimKind[],
): Partial<Record<SubClaimKind, { value: string; source: string }>> | null {
  if (!nodes.length) return null;
  const out: Partial<Record<SubClaimKind, { value: string; source: string }>> = {};
  const top = nodes[0]!;
  if (kinds.includes('formUrl') && top.url) out.formUrl = { value: top.url, source: top.title ?? top.url };

  const scan = (re: RegExp): { value: string; source: string } | null => {
    for (const n of nodes) {
      const text = `${n.summary ?? ''} ${n.title ?? ''}`;
      const m = text.match(re);
      if (m?.[0]) return { value: m[0], source: n.title || text };
    }
    return null;
  };

  if (kinds.includes('deadline')) {
    const d = scan(DEADLINE_RE);
    if (d) out.deadline = d;
  }
  if (kinds.includes('contact')) {
    const c = scan(CONTACT_RE);
    if (c) out.contact = c;
  }
  if (kinds.includes('eligibility')) {
    const e = scan(ELIGIBILITY_RE);
    if (e) out.eligibility = e;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Deterministic hypothesis generator — a STAND-IN for LLM "solution generation". In production the
 * caller generates these from the fuzzy message + profile with an LLM (the model's strength, per
 * TAD's load-shifting insight); this stub lets the belief/policy layer run and be tested offline
 * before the LLM hook is wired. Return [] when the message isn't genuinely multi-hypothesis.
 */
export function hypothesize(message: string, profile: FamilyProfile): Hypothesis[] {
  const t = message.toLowerCase();
  const known = (d: string) => t.includes(d);

  // Enrollment / relocation — several paths hang on schoolType + prior enrollment.
  if (known('moved') || known('move') || known('enroll') || known('relocat') || known('transfer') || known('new school') || known('register')) {
    return [
      h('enroll-new', 'New-student online enrollment (district portal)', 'New-student online enrollment via the district portal.', subCl('formUrl', 'contact'), 0.5, 0.1, { schoolType: 'public', existingEnrollment: 'no' }),
      h('enroll-transfer', 'Transfer for a child already enrolled elsewhere', 'Change-of-residency transfer (child already enrolled in a school).', subCl('formUrl', 'deadline'), 0.3, 0.1, { schoolType: 'public', existingEnrollment: 'yes' }),
      h('enroll-alt', 'Alternative school / charter / private path', 'Charter, private, or alternative-school enrollment.', subCl('eligibility'), 0.2, 0.1, { schoolType: 'charter-or-private' }),
    ];
  }

  // Special education / speech — the key unknown is whether an IEP already exists.
  if (known('speech') || known('special') || known('therap') || known('iep') || known('504') || known('evaluation') || known('services')) {
    return [
      h('sped-eval', 'Request a speech/language IEP evaluation', 'Special-education assessment request (child has no IEP yet).', subCl('formUrl', 'contact'), 0.35, 0.1, { iep504: 'no-iep' }),
      h('sped-iep', 'Ask for services under an existing IEP', 'Add speech as a service under the child’s existing IEP.', subCl('formUrl', 'deadline'), 0.4, 0.1, { iep504: 'has-iep' }),
      h('sped-504', 'Pursue a 504 / Student Study Team', '504 plan or Student Study Team (an alternative to an IEP).', subCl('contact'), 0.25, 0.1, { iep504: 'no-iep' }),
    ];
  }

  // Meals / income eligibility.
  if (known('lunch') || known('breakfast') || known('meal') || known('food') || known('free') || known('reduc') || known('snap') || known('calfresh')) {
    return [
      h('meals-snap', 'Directly eligible via SNAP/CalFresh', 'Categorical eligibility through SNAP/CalFresh.', subCl('eligibility'), 0.4, 0.1, { incomeEligibility: 'snap' }),
      h('meals-income', 'Income-based free/reduced-price', 'Household-income-based free/reduced lunch.', subCl('eligibility', 'formUrl'), 0.4, 0.1, { incomeEligibility: 'income' }),
      h('meals-none', 'Not eligible', 'Household exceeds the income threshold.', subCl('eligibility'), 0.2, 0.1, { incomeEligibility: 'not' }),
    ];
  }

  return [];
}

function h(id: string, claim: string, direction: string, subClaims: SubClaim[], belief: number, evidenceConfidence: number, assumptions: Hypothesis['assumptions']): Hypothesis {
  return { id, claim, direction, subClaims, belief, evidenceConfidence, assumptions };
}
function subCl(...kinds: SubClaimKind[]): SubClaim[] {
  return kinds.map((kind) => ({ kind, attested: false }));
}

/**
 * Resolve a fuzzy message into an actionable decision, or null if it isn't genuinely ambiguous.
 * A convenient single call for the agent's "unknown intent" seam: surfaces the most informative ask
 * (or an honest handoff) instead of giving up with a canned "I don't understand".
 */
export function resolveFuzzyMessage(
  message: string,
  profile: FamilyProfile,
  opts?: Partial<PolicyOptions>,
): { decision: IntentionDecision; intention: Intention } | null {
  const hypotheses = hypothesize(message, profile);
  if (hypotheses.length < 2) return null; // not genuinely multi-hypothesis
  const intention = buildIntention(message, profile, hypotheses);
  const policy: PolicyOptions = {
    minValue: 0.05,
    budgetUsed: 0,
    budgetCap: 3,
    askCost: 0.4,
    decisionFlipQuestion: askFromUnknowns(intention.unknowns),
    ...opts,
  };
  return { decision: decide(intention, [], policy), intention };
}
```

---
## src/agent/onboarding.ts

```ts
import type { ChildProfile, FamilyProfile } from '../domain/types.js';
import type { DistrictProfile } from '../knowledge/districts.js';
import { resolveDistrict } from '../knowledge/districts.js';
import { assessRights } from '../knowledge/rights.js';

export type OnboardingStep = 'email' | 'kids' | 'school' | 'location' | 'needs' | 'challenges' | 'review';

export interface OnboardingState {
  step: OnboardingStep;
  profile: FamilyProfile;
}

export interface OnboardingTurn {
  text: string;
  state: OnboardingState;
  done: boolean;
}

/**
 * Guided onboarding. A parent texts in. We lead with WHAT Axolotl can do (build
 * trust), capture their email (so we can prove the email path + send a wow email
 * that already knows their district), then learn the family + school.
 */
export function openOnboarding(): OnboardingTurn {
  return {
    text: [
      "Hi! I'm Axolotl — your school assistant. Here's what I can do for you (always with your OK):",
      '• Email the school on your behalf',
      '• Fill out forms and applications',
      '• Place calls (and leave a voicemail)',
      '',
      'To begin, let me get your email so I can show you I actually send email. Text /connect to link your Gmail, or just send me the email address you want me to use.',
    ].join('\n'),
    state: { step: 'email', profile: { children: [], needs: [], challenges: [] } },
    done: false,
  };
}

export function advanceOnboarding(state: OnboardingState, text: string): OnboardingTurn {
  const t = text.trim();

  switch (state.step) {
    case 'email': {
      const email = t.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
      if (!email) {
        return {
          text: `I didn't catch an email. Send me the address you'd like me to use (e.g. you@email.com), or text /connect to link your Gmail.`,
          state,
          done: false,
        };
      }
      const profile = { ...state.profile, email };
      return {
        text: `Got it — ${email}. Now let's get set up.\n\nWhat are your children's names? (e.g. "Emma and Liam", or just "Emma")`,
        state: { step: 'kids', profile },
        done: false,
      };
    }

    case 'kids': {
      const kids = parseKids(t);
      if (kids.length === 0) {
        return { text: "I didn't catch any names. Could you tell me your children's names?", state, done: false };
      }
      const profile = { ...state.profile, children: kids };
      return {
        text: `Got it — ${kids.map((k) => k.name).join(' and ')}.\n\nWhich school do they go to? (e.g. "Lincoln Elementary")`,
        state: { step: 'school', profile },
        done: false,
      };
    }

    case 'school': {
      const profile = { ...state.profile, school: t, district: t };
      // Ask for the city/state when the school isn't one we have on file, so we
      // research the right one (there are many common/duplicate school names).
      if (!resolveDistrict(t).known) {
        return {
          text: `Got it — ${t}. Which city and state is that in? (e.g. "Seattle, WA") I want to make sure I look up the right one.`,
          state: { step: 'location', profile },
          done: false,
        };
      }
      return {
        text: "What would you like help with? I can help with things like transportation, meals, attendance, conferences, enrollment, or special education. (You can list a few, or say \"not sure\".)",
        state: { step: 'needs', profile },
        done: false,
      };
    }

    case 'location': {
      const profile = { ...state.profile, location: t };
      return {
        text: "What would you like help with? I can help with things like transportation, meals, attendance, conferences, enrollment, or special education. (You can list a few, or say \"not sure\".)",
        state: { step: 'needs', profile },
        done: false,
      };
    }

    case 'needs': {
      const needs = parseList(t);
      const profile = { ...state.profile, needs: needs.length ? needs : ['general help'] };
      return {
        text: "Is there anything else going on I should know so I can help best? For example: staying somewhere temporary, an IEP or 504, a health issue, or a language need. (You can say \"none\", or tell me anything.)",
        state: { step: 'challenges', profile },
        done: false,
      };
    }

    case 'challenges': {
      const challenges = parseChallenges(t);
      const profile = { ...state.profile, challenges };
      return {
        text: "Anything else you'd like to tell me? (Optional — or just say \"no\".)",
        state: { step: 'review', profile },
        done: false,
      };
    }

    case 'review': {
      const profile = { ...state.profile, notes: isNo(t) ? undefined : t };
      return { text: '', state: { step: 'review', profile }, done: true };
    }
  }
}

export function finalizeOnboarding(profile: FamilyProfile, district: DistrictProfile): string {
  const isPublic = district.type === 'public';
  const rights = isPublic ? assessRights(profile, 'public') : [];

  const lines: string[] = [];
  lines.push("Perfect — here's what I've learned and what I can help with:");
  lines.push('');
  const kids = profile.children.map((c) => `${c.name}${c.grade ? ` (${c.grade})` : ''}`).join(', ');
  lines.push(`Your family: ${kids} — ${district.name}.`);
  if (profile.needs.length && profile.needs[0] !== 'general help') {
    lines.push(`You're looking for help with: ${profile.needs.join(', ')}.`);
  }
  if (profile.challenges.length) {
    lines.push(`I'm keeping in mind: ${profile.challenges.join(', ')}.`);
  }

  if (!district.known) {
    lines.push('');
    if (district.type === 'private') {
      lines.push(`${district.name} looks like a private school. Public-school programs — McKinney-Vento, free/reduced meals, a district homeless liaison — generally don't apply to private schools; they set their own policies (transportation, financial aid, etc.). In a live version I'd look those up specifically instead of assuming.`);
    } else {
      lines.push(`I don't have ${district.name} researched yet, and I don't know whether it's public or private — that changes what your family is entitled to a lot. In a live version I'd look it up first and only then tell you what actually applies.`);
    }
  } else if (!isPublic) {
    lines.push('');
    lines.push(`${district.name} isn't a public district, so the federal public-school programs I usually check (McKinney-Vento, free/reduced meals) generally don't apply — it sets its own policies. I'd look up its actual programs instead.`);
  }

  if (rights.length) {
    lines.push('');
    lines.push('Based on what you told me, your children may be entitled to:');
    for (const r of rights) lines.push(`• ${r.title} — ${r.law}`);
  }

  lines.push('');
  lines.push("Here's how I can help right now:");
  lines.push(suggestedActions(profile, district.known, isPublic));

  // The district homeless liaison is a McKinney-Vento (homeless/displaced) contact —
  // only surface it when the family actually flagged housing instability, not for a
  // generic family.
  const housingAffected = /homeless|transition|shelter|motel|hotel|car|displac|couch|doubled|camp|no address/i.test(
    (profile.challenges ?? []).join(' '),
  );
  const l = district.liaison;
  if (housingAffected && district.known && isPublic && l?.name && l.phone) {
    lines.push('');
    lines.push(`Key contact: district homeless liaison ${l.name}, ${l.phone}${l.email ? `, ${l.email}` : ''}.`);
  }

  lines.push('');
  lines.push('Want to hear how I sound on a real call? Just say "call me" and I\'ll ring you right now.');
  lines.push('');
  lines.push('Reply "help" anytime, or just ask me to do one of those. (Demo: nothing is actually sent to the school.)');
  return lines.join('\n');
}

function suggestedActions(profile: FamilyProfile, districtKnown: boolean, isPublic: boolean): string {
  const n = profile.needs.map((s) => s.toLowerCase()).join(' ');
  const c = profile.challenges.map((s) => s.toLowerCase()).join(' ');
  const items: string[] = [];

  if (/transport|bus|ride/.test(n) || /homeless|transition|shelter|motel|car/.test(c)) {
    items.push(
      isPublic
        ? '• Walk you through the McKinney-Vento school-bus request'
        : '• Help with transportation to school (and financial aid if it applies)',
    );
  }
  if (/meal|lunch|food|breakfast/.test(n)) {
    items.push(
      isPublic
        ? '• Help you apply for free & reduced meals'
        : '• Help with meals / food support at the school',
    );
  }
  if (/absent|attendance|sick/.test(n)) {
    items.push('• Report an absence');
  }
  if (/conference|meet|teacher/.test(n)) {
    items.push('• Book a parent-teacher conference');
  }
  if (/enroll|register|new/.test(n)) {
    items.push(isPublic ? '• Walk you through enrollment' : '• Help with admissions / enrollment');
  }
  if (districtKnown) {
    items.push('• Answer questions about the school and point you to the right contact');
  }
  if (items.length === 0) {
    items.push('• Answer your questions and connect you with the right person at the district');
  }
  return items.join('\n');
}

function parseKids(text: string): ChildProfile[] {
  const segments = text.split(/\s+(?:and|&)\s+|,\s*|\/\s*/).map((s) => s.trim()).filter(Boolean);
  const kids: ChildProfile[] = [];
  for (const seg of segments) {
    const m = seg.match(/^([A-Za-z][A-Za-z' .-]*?)\s+(?:in\s+)?(pre[- ]?k|k|tk|\d{1,2})(?:st|nd|rd|th)?\.?\s*$/i);
    if (m) {
      kids.push({ name: m[1]!.trim(), grade: m[2]!.toLowerCase() });
    } else {
      const name = seg.replace(/\b(?:grade\s*)?(?:pre[- ]?k|k|tk|\d{1,2})(?:st|nd|rd|th)?\b/gi, '').trim();
      if (name) kids.push({ name });
    }
  }
  return kids;
}

function parseList(text: string): string[] {
  if (/^(none|no|n\/a|nothing|not sure|not really sure|not totally sure|no idea|idk|dont know|don't know|i don'?t know|not sure yet)\b/i.test(text)) return [];
  return text
    .split(/\s*(?:,|;|\/|&|\band\b)\s*/)
    .map((s) => s.trim().replace(/[.!?]+$/, ''))
    .filter((s) => s.length > 1);
}

function parseChallenges(text: string): string[] {
  if (/^(none|no|n\/a|nothing|not really|no challenges|nothing else)\b/i.test(text)) return [];
  const t = text.toLowerCase();
  const out: string[] = [];
  if (/homeless|transition|shelter|motel|hotel|car|displac|doubled|couch|camp|no address/.test(t)) out.push('homeless/transitional housing');
  if (/\biep\b|special ?ed|disab|adhd|autism/.test(t)) out.push('IEP / special education');
  if (/504/.test(t)) out.push('504 plan');
  if (/health|medical|chron|allerg|asthma|epilep/.test(t)) out.push('health');
  if (/english|language|spanish|esl|transl/.test(t)) out.push('language');
  if (/moved|just moved|new to/.test(t)) out.push('recently moved');
  if (out.length === 0) out.push(text.trim());
  return out;
}

function isNo(text: string): boolean {
  return /^(no|nope|nothing|none|that's it|thats it|n\/a)\b/i.test(text.trim());
}
```

---
## src/agent/memory.ts

```ts
import { initialState, type ConversationState } from './state.js';
import { saveMessage, loadMessages } from '../integrations/conversation-store.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Record {
  parentId: string;
  state: ConversationState;
  history: ChatMessage[];
}

/**
 * In-memory conversation store (per conversation id): the agent state machine
 * plus the FULL conversation history so the LLM brain can remember the thread and
 * recall any past turn. History is persisted to Supabase (message table) so it
 * survives restarts and scales; append writes through, and the thread is rehydrated
 * from the DB the first time a conversation is touched.
 */
export class InMemoryStore {
  private readonly records = new Map<string, Record>();

  ensure(conversationId: string, parentId: string): Record {
    let record = this.records.get(conversationId);
    if (!record) {
      record = { parentId, state: initialState(), history: [] };
      this.records.set(conversationId, record);
    }
    return record;
  }

  getParentId(conversationId: string): string | undefined {
    return this.records.get(conversationId)?.parentId;
  }

  getState(conversationId: string): ConversationState | undefined {
    return this.records.get(conversationId)?.state;
  }

  setState(conversationId: string, state: ConversationState): void {
    const record = this.records.get(conversationId);
    if (record) record.state = state;
  }

  bindParent(conversationId: string, parentId: string): void {
    const record = this.records.get(conversationId);
    if (record) record.parentId = parentId;
    else this.records.set(conversationId, { parentId, state: initialState(), history: [] });
  }

  /** Append a message to the full history AND persist it (fire-and-forget). */
  appendHistory(conversationId: string, role: 'user' | 'assistant', content: string): void {
    const record = this.records.get(conversationId);
    if (!record) return;
    record.history = [...record.history, { role, content }];
    void saveMessage(conversationId, role, content).catch((e) =>
      console.error('[history] persist failed:', (e as Error)?.message ?? e),
    );
  }

  getHistory(conversationId: string): ChatMessage[] {
    return this.records.get(conversationId)?.history ?? [];
  }

  /** Seed the in-memory history for a conversation (used to rehydrate after restart). */
  setHistory(conversationId: string, messages: ChatMessage[]): void {
    const record = this.records.get(conversationId);
    if (record) record.history = messages;
  }

  /** Load the full persisted history for a conversation into memory (if not already). */
  async rehydrate(conversationId: string): Promise<void> {
    if ((this.records.get(conversationId)?.history.length ?? 0) > 0) return;
    const msgs = await loadMessages(conversationId).catch(() => [] as ChatMessage[]);
    if (msgs.length) this.setHistory(conversationId, msgs);
  }

  reset(conversationId: string): void {
    this.records.delete(conversationId);
  }
}
```

---
## src/agent/state.ts

```ts
import type { ActionIntent } from '../domain/intents.js';
import type { CollectedSlots } from '../domain/slots.js';
import type { CaseRecord, FamilyProfile } from '../domain/types.js';
import type { FamilyMemory } from '../domain/memory.js';
import type { Step } from './steps/types.js';
import type { MckinneyState } from './mckinney.js';
import type { OnboardingState } from './onboarding.js';
import type { AttendanceState } from './attendance.js';

export type AgentPhase = 'idle' | 'clarifying' | 'confirming' | 'done';

/** A fully-specified, human-readable action awaiting the parent's YES/NO. */
export interface Plan {
  intent: ActionIntent;
  slots: CollectedSlots;
  summary: string;
}

export interface ConversationState {
  phase: AgentPhase;
  intent?: ActionIntent;
  collected: CollectedSlots;
  pendingPlan?: Plan;
  /** Active McKinney-Vento guided flow (school-bus help for homeless/displaced). */
  mckinney?: MckinneyState;
  /** Active onboarding flow. */
  onboarding?: OnboardingState;
  /** Active absenteeism / barrier-resolution flow. */
  attendance?: AttendanceState;
  /** Family profile gathered during onboarding. */
  profile?: FamilyProfile;
  /** Persistent case record (the "remember" layer). */
  cases?: CaseRecord[];
  /** The family's continuing memory graph (needs/getting/initiatives/issues). */
  memory?: FamilyMemory;
  /** We're awaiting an OTP code to prove the parent owns this number. */
  verify?: { phone: string };
  /** Set by the brain's call tool: the channel should place a phone call. */
  pendingCall?: boolean;
  /** We're waiting for the parent to clarify what the call is about before dialing. */
  awaitingCallClarify?: boolean;
  /** We just offered a demo call during onboarding; awaiting their yes/no. */
  awaitingCallDemo?: boolean;
  /** What the family is actively working toward right now (refreshed each turn). */
  activeGoal?: string;
  /** The most recent action we took for the family (call/email/reminder…). */
  lastAction?: string;
  /** Steps the brain has planned but not yet executed — awaiting parent consent. */
  pendingSteps?: Step[];
  /** A rolling, compressed summary of the conversation so the brain keeps the
   * thread even past the windowed history (ChatGPT-like continuity). */
  summary?: string;
}

export function initialState(): ConversationState {
  return { phase: 'idle', collected: {} };
}
```

---
## src/agent/family.ts

```ts
import type { CaseRecord } from '../domain/types.js';

/** Create a case record with a stable id + timestamp. */
export function makeCase(rec: Omit<CaseRecord, 'id' | 'createdAt'>): CaseRecord {
  return {
    ...rec,
    id: `case-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };
}

/** Append a case (no duplicates / newest last). */
export function addCase(cases: CaseRecord[] | undefined, rec: CaseRecord): CaseRecord[] {
  // If a case of the same kind+child is already open, update it rather than duplicate.
  const existing = (cases ?? []).findIndex(
    (c) => c.kind === rec.kind && c.child === rec.child && c.status !== 'resolved',
  );
  if (existing >= 0) {
    const next = [...(cases ?? [])];
    next[existing] = { ...next[existing]!, status: rec.status, summary: rec.summary, reminder: rec.reminder };
    return next;
  }
  return [...(cases ?? []), rec];
}

/** A short human-readable status line for the open/awaiting cases. */
export function openCaseSummary(cases: CaseRecord[] | undefined): string {
  const open = (cases ?? []).filter((c) => c.status !== 'resolved');
  if (open.length === 0) return "No open cases right now.";
  return [
    `Here's what I'm tracking for you (${open.length}):`,
    ...open.map(
      (c) =>
        `• ${c.kind} — ${c.summary}${c.child ? ` (${c.child})` : ''}${c.status === 'awaiting' ? ' [awaiting the school]' : ''}`,
    ),
  ].join('\n');
}
```

---
## src/agent/gaps.ts

```ts
import type { FamilyProfile, CaseRecord } from '../domain/types.js';
import { auditEntitlements } from '../knowledge/entitlements.js';
import type { KnowledgeNode } from '../domain/knowledge.js';

export interface Gap {
  /** Stable id (entitlement id) so we don't re-raise the same gap repeatedly. */
  id: string;
  category: string;
  title: string;
  /** Parent-facing (English base; localize at the surface when the locale is es). */
  message: string;
  priority: 'high' | 'medium';
}

/**
 * The always-on advocate's "noticed a gap" engine. Given the family's profile,
 * open cases, and what they've already secured, surface the entitlements they
 * LIKELY qualify for but have NOT yet gotten and we're not already chasing.
 * Grounded (reuses auditEntitlements) and safety-compliant: phrased as a
 * possibility to pursue, never a diagnosis or an assertion of entitlement.
 */
export function detectGaps(
  profile: FamilyProfile | undefined,
  cases: CaseRecord[] = [],
  getting: string[] = [],
): Gap[] {
  if (!profile) return [];
  const openKinds = new Set(cases.filter((c) => c.status !== 'resolved').map((c) => c.kind));
  // Map an entitlement's domain to the case kinds we actually open for it, so an
  // in-progress chase suppresses the corresponding gap.
  const kindFor: Record<string, string> = {
    transport: 'transportation',
    meals: 'meals',
    support: 'special_ed',
    language: 'language',
    attendance: 'attendance',
    enrichment: 'enrichment',
  };
  const audit = auditEntitlements(profile, getting);
  const gaps: Gap[] = [];

  for (const item of audit) {
    if (item.status === 'accessed') continue; // already secured
    const kind = kindFor[item.entitlement.domain] ?? item.entitlement.domain;
    if (openKinds.has(kind) || openKinds.has(item.entitlement.domain)) continue; // already chasing
    gaps.push({
      id: item.entitlement.id,
      category: item.entitlement.domain,
      title: item.entitlement.title,
      message:
        `I noticed ${item.entitlement.title.toLowerCase()} may apply for your child. ` +
        `${item.entitlement.action}. Want me to start on it?`,
      priority:
        item.entitlement.id === 'iep-504' || item.entitlement.id === 'mckinney-vento-transport'
          ? 'high'
          : 'medium',
    });
  }

  return gaps
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1))
    .slice(0, 3);
}

export interface StaleNode {
  node: KnowledgeNode;
  ageDays: number;
}

/** Nodes whose `lastVerifiedAt` is older than the threshold — candidates for re-verify. */
export function staleKnowledgeNodes(nodes: KnowledgeNode[], maxAgeDays = 30): StaleNode[] {
  const now = Date.now();
  const out: StaleNode[] = [];
  for (const n of nodes) {
    if (!n.lastVerifiedAt) continue; // never verified → leave to research pipeline
    const ageDays = (now - new Date(n.lastVerifiedAt).getTime()) / 86_400_000;
    if (ageDays > maxAgeDays) out.push({ node: n, ageDays });
  }
  return out;
}
```

---
## src/agent/verify.ts

```ts
import type { EvidenceRecord, EvidenceStatus, SourceType } from '../domain/evidence.js';
import { isOfficialUrl } from '../domain/evidence.js';
import type { KnowledgeNode } from '../domain/knowledge.js';

/**
 * The verification stage. Run before a consequential answer reaches a parent:
 * is it an official source? is it current? is it corroborated? The rubric never
 * lets a claim pass as `verified` without a source URL, and requires
 * corroboration for `confirmed` (the bar for eligibility / form claims).
 */

export interface VerifyOptions {
  now?: Date;
  /** Max source age (days) before a claim is `stale`, by source type. */
  ttlDays?: Partial<Record<SourceType, number>>;
}

const DEFAULT_TTL_DAYS: Record<SourceType, number> = {
  policy: 90,
  pdf: 90,
  form: 14,
  contact: 180,
  district_page: 60,
  school_page: 60,
  other: 30,
};

export interface VerificationResult {
  pass: boolean;
  status: EvidenceStatus;
  reasons: string[];
}

export function verifyEvidence(e: EvidenceRecord, opts: VerifyOptions = {}): VerificationResult {
  const reasons: string[] = [];
  const now = opts.now ?? new Date();

  if (!e.sourceUrl) {
    reasons.push('no source URL');
    return { pass: false, status: 'discovered', reasons };
  }

  const official = e.official || isOfficialUrl(e.sourceUrl);
  if (!official) reasons.push('not an official source');

  const ttlDays = (opts.ttlDays ?? {})[e.sourceType] ?? DEFAULT_TTL_DAYS[e.sourceType] ?? 30;
  const retrieved = new Date(e.retrievedAt).getTime();
  const ageDays = (now.getTime() - retrieved) / 86_400_000;
  const current = Number.isFinite(ageDays) && ageDays <= ttlDays;
  if (!current) reasons.push(`stale (${Math.max(0, Math.round(ageDays))}d > ${ttlDays}d TTL)`);

  if (e.status === 'contradictory') {
    return { pass: false, status: 'contradictory', reasons: [...reasons, 'contradicts another official source'] };
  }

  if (official && current) {
    if (e.corroboratedBy.length >= 1) return { pass: true, status: 'confirmed', reasons };
    return { pass: true, status: 'verified', reasons };
  }
  if (official && !current) return { pass: false, status: 'stale', reasons };
  return { pass: false, status: 'plausible', reasons };
}

/**
 * Map a `KnowledgeNode` onto the evidence ladder. Bridges the current 2-level
 * `verified|draft` node status to the 6-step ladder so retrieval can surface how
 * much to trust a fact.
 */
export function assessKnowledgeNode(node: KnowledgeNode, now: Date = new Date()): EvidenceStatus {
  if (node.status === 'draft') return 'plausible';
  if (node.lastVerifiedAt) {
    const ageDays = (now.getTime() - new Date(node.lastVerifiedAt).getTime()) / 86_400_000;
    if (ageDays > 30) return 'stale';
  }
  const official = node.sources.some((s) => isOfficialUrl(s.url));
  if (!official) return 'plausible';
  return node.sources.length >= 2 ? 'confirmed' : 'verified';
}

/** The parent-facing caveat for a node status (used when rendering answers). */
export function statusCaveat(status: EvidenceStatus): string {
  switch (status) {
    case 'confirmed':
    case 'verified':
      return '';
    case 'stale':
      return ' (this may be outdated — confirm with the school)';
    case 'contradictory':
      return ' (sources disagree — the school must confirm)';
    case 'plausible':
    case 'discovered':
    default:
      return ' (likely but please confirm with the school)';
  }
}
```

---
## src/knowledge/districts.ts

```ts
import type { LlmClient } from '../agent/llm.js';

/**
 * A per-district profile. This is the SINGLE authoritative source for a school /
 * district's contact facts (homeless liaison, bus-pass contact, school name) and
 * its type (public/private/charter — which gates the federal entitlements that
 * apply). Profiles are produced by research (`researchDistrictProfile`) for ANY
 * district, not hardcoded to one. When a district hasn't been researched yet we
 * return an honest `known:false` placeholder — never invented contacts.
 */
export interface DistrictProfile {
  /** Stable id (e.g. `district-soquel-union-elementary`); the knowledge-graph key. */
  id: string;
  name: string;
  short?: string;
  city?: string;
  state?: string;
  /** The district's (or school's) primary office name, if known. */
  elementary?: string;
  liaison?: { name: string; role: string; phone: string; email: string };
  busPasses?: { name: string; phone: string };
  /** Plain-language list of schools (best-effort), or undefined when unknown. */
  schools?: string;
  /** True when we have a researched profile; false = still to be researched. */
  known: boolean;
  /** public | private | charter | unknown — gates which federal entitlements apply. */
  type?: 'public' | 'private' | 'charter' | 'unknown';
}

function slug(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Coerce a profile field to a plain string, or drop it if it isn't one. */
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Coerce a schools field to a string (the LLM sometimes returns an array). */
function asSchools(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter((s) => typeof s === 'string').join('\n') || undefined;
  return undefined;
}

/** Drop a contact object that has no real fields (the LLM sometimes returns an
 * empty/blank contact, which is truthy but produces "liaison , , ." in output). */
function cleanContact<T extends Record<string, unknown>>(obj: T | undefined): T | undefined {
  if (!obj) return undefined;
  return Object.values(obj).some((v) => v && String(v).trim()) ? obj : undefined;
}

/** Stable district id derived from a district/school name (+ location, if present). */
export function districtIdFromName(name: string): string {
  return 'district-' + slug(name) || 'district-unknown';
}

/** Stable school id derived from a school name (+ location, if present). */
export function schoolIdFromName(name: string): string {
  return 'school-' + slug(name) || 'school-unknown';
}

/**
 * In-memory registry of districts we've already researched, keyed by stable id,
 * so repeated resolution of the same district reuses the researched profile.
 * (A real deployment would back this with the knowledge graph / district table.)
 */
const researched = new Map<string, DistrictProfile>();

function normName(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Find a registered profile by matching its name (or elementary/short) to input. */
function lookupByName(input: string): DistrictProfile | undefined {
  const n = normName(input);
  if (!n) return undefined;
  // Exact name / elementary / short match first.
  for (const p of researched.values()) {
    const candidates = [p.name, p.short, p.elementary].filter((x): x is string => Boolean(x)).map(normName);
    if (candidates.includes(n)) return p;
  }
  // Prefix / containment match: "Lincoln Elementary" → "Lincoln Elementary School
  // District"; or the input contains a registered school name.
  for (const p of researched.values()) {
    const pn = normName(p.name);
    const el = p.elementary ? normName(p.elementary) : '';
    if (pn.startsWith(n) && n.length >= 6) return p;
    if (n.startsWith(pn)) return p;
    if (el && (n.includes(el) || el.startsWith(n))) return p;
  }
  return undefined;
}

/** Register a researched profile (call after a successful research/web lookup). */
export function registerDistrict(p: DistrictProfile): DistrictProfile {
  const id = p.id || districtIdFromName(p.name);
  const profile: DistrictProfile = {
    ...p,
    id,
    name: asString(p.name) ?? 'your school district',
    short: asString(p.short),
    elementary: asString(p.elementary),
    schools: asSchools(p.schools),
    liaison: cleanContact(p.liaison),
    busPasses: cleanContact(p.busPasses),
    known: true,
  };
  researched.set(id, profile);
  return profile;
}

/** The researched profile for a district name, if we already have one. */
export function getResearchedDistrict(input: string): DistrictProfile | undefined {
  return researched.get(districtIdFromName(input)) ?? lookupByName(input);
}

/** The researched profile by its stable id, if we already have one. */
export function getResearchedDistrictById(id: string): DistrictProfile | undefined {
  return researched.get(id);
}

/**
 * Resolve a district to a profile WITHOUT researching. Returns the researched
 * profile if one is registered (by id or name match); otherwise an honest
 * `known:false` placeholder with a stable id (so the knowledge graph can be keyed
 * + researched on demand).
 */
export function resolveDistrict(input: string): DistrictProfile {
  const id = districtIdFromName(input);
  const k = researched.get(id) ?? lookupByName(input);
  if (k) return k;
  const name = (input ?? '').trim();
  return { id, name: name || 'your school district', short: '', known: false, type: 'unknown' };
}

/**
 * Research a district and return its authoritative profile.
 *
 * Source of truth = the LLM's structured research for the district (which returns
 * liaison / bus-pass / schools / type). When the LLM is disabled or can't identify
 * the district, we return an honest `known:false` placeholder — never an invented
 * contact. The result is cached so subsequent turns reuse it.
 */
export async function researchDistrictProfile(input: string, llm?: LlmClient): Promise<DistrictProfile> {
  const id = districtIdFromName(input);
  const existing = researched.get(id) ?? lookupByName(input);
  if (existing) return existing;
  const name = (input ?? '').trim() || 'your school district';
  if (!llm?.enabled) {
    return { id, name, known: false, type: 'unknown' };
  }
  const r = await llm.researchDistrict(name).catch(() => null);
  if (!r?.name) {
    return { id, name, known: false, type: 'unknown' };
  }
  const profile: DistrictProfile = {
    id,
    name: asString(r.name) ?? name,
    short: asString(r.short) ?? '',
    city: asString(r.city),
    state: asString(r.state),
    elementary: asString(r.elementary),
    liaison: cleanContact(r.liaison),
    busPasses: cleanContact(r.busPasses),
    schools: asSchools(r.schools),
    known: r.known === true || Boolean(r.liaison || r.schools || r.elementary || (r.type && r.type !== 'unknown')),
    type: r.type ?? 'unknown',
  };
  if (profile.known) registerDistrict(profile);
  return profile;
}
```

---
## src/knowledge/entitlements.ts

```ts
import type { FamilyProfile } from '../domain/types.js';

/**
 * The well-founded curiosity engine. Every entitlement a child may be owed is
 * paired with (a) the condition in the family profile that suggests eligibility,
 * (b) the ONE curiosity question that confirms/reveals it, (c) why it matters,
 * and (d) the action to pursue. The agent uses this to audit the family AND to
 * ask only the questions that help the student — never random.
 */

export interface Entitlement {
  id: string;
  title: string;
  law: string;
  domain: string;
  /** True if the family profile suggests this may apply (conservative). */
  matches: (profile: FamilyProfile) => boolean;
  /** Looser signal: worth ASKING the parent about (curiosity), even if not yet confirmed. */
  worthAsking?: (profile: FamilyProfile) => boolean;
  /** The focused question to confirm/reveal eligibility. */
  question: string;
  /** Why this question matters (what it unlocks for the student). */
  why: string;
  /** The concrete action to pursue if it applies. */
  action: string;
}

const text = (p: FamilyProfile, ...fields: Array<'needs' | 'challenges'>): string =>
  fields.flatMap((f) => p[f] ?? []).join(' ') + ' ' + (p.notes ?? '');

export const ENTITLEMENTS: Entitlement[] = [
  {
    id: 'mckinney-vento-transport',
    title: 'McKinney-Vento transportation to school of origin',
    law: '42 U.S.C. §11432(g)(1)(J)',
    domain: 'transport',
    matches: (p) => /homeless|doubled|temporary|transitional|shelter|motel|staying (with|at)|grandma|sister|aunt|family|not (my|our) own/i.test(text(p, 'challenges')),
    worthAsking: (p) => /bus|route|far|other home|mom|carpool|walk|transport|distance|ride/i.test(text(p, 'needs', 'challenges')),
    question: 'Are you staying with family, in temporary housing, or somewhere that isn\u2019t your own permanent home right now?',
    why: 'If so, your child is likely entitled to free transportation to their school of origin.',
    action: 'Request transportation to the school of origin via the district homeless liaison.',
  },
  {
    id: 'free-meals',
    title: 'Free & reduced-price meals (NSLP)',
    law: '42 U.S.C. §1758',
    domain: 'meals',
    matches: (p) => /low.?income|free|reduced|poverty|econom|meal|food|lunch|breakfast/i.test(text(p, 'needs', 'challenges')),
    question: 'Is your child\u2019s free/reduced-meal application current, or do they usually eat school lunch?',
    why: 'Low-income families qualify for free or reduced-price breakfast and lunch, and it can unlock other benefits.',
    action: 'Ensure the meal application is on file (or submit one).',
  },
  {
    id: 'iep-504',
    title: 'Special education / 504 evaluation',
    law: 'IDEA 20 U.S.C. §1414 / §504',
    domain: 'support',
    matches: (p) => /iep|504|special|disabilit|learning|adhd|speech|read|attention|evaluation/i.test(text(p, 'needs', 'challenges')),
    question: 'Has your child had an evaluation for learning, attention, speech, or any support need?',
    why: 'If there\u2019s a suspected disability or difficulty, they may be entitled to an IEP or 504 with supports.',
    action: 'Request a written evaluation, or review an existing plan.',
  },
  {
    id: 'title-iii',
    title: 'English learner / language support',
    law: 'Title III, 20 U.S.C. §6801',
    domain: 'language',
    matches: (p) => /english|language|ell|bilingual|second language/i.test(text(p, 'challenges')),
    question: 'Is another language spoken at home, or is English not your child\u2019s first language?',
    why: 'If they\u2019re an English learner, they\u2019re entitled to language support services.',
    action: 'Check English-learner identification + services.',
  },
  {
    id: 'summer-meals',
    title: 'Summer meals',
    law: 'Summer Food Service Program, 42 U.S.C. §1761',
    domain: 'meals',
    matches: (p) => /low|free|reduced|meal|food|lunch|breakfast|summer/i.test(text(p, 'needs', 'challenges')),
    question: 'Could your child get lunch through the summer meal program at a nearby community site?',
    why: 'Kids 18 and under get free summer meals at community sites with no application.',
    action: 'Find a summer meal site near you and share the schedule.',
  },
  {
    id: 'transport-support',
    title: 'Transportation assistance (distance / route barrier)',
    law: 'District policy / 20 U.S.C. §6311',
    domain: 'transport',
    matches: (p) => /transport|bus|ride|far|route|distance/i.test(text(p, 'needs', 'challenges')),
    question: 'How far is the school, and is there any bus or ride option at all?',
    why: 'If distance or the route is a barrier, the district may have to help with or provide transportation.',
    action: 'Request a transportation option or waiver from the school.',
  },
  {
    id: 'attendance-support',
    title: 'Attendance / truancy support',
    law: 'ESSA, 20 U.S.C. §6311',
    domain: 'attendance',
    matches: (p) => /attend|absent|truancy|miss.?ing school/i.test(text(p, 'needs', 'challenges')),
    question: 'Is your child missing school often for a reason we can help with?',
    why: 'If attendance is at risk, the district should offer supports — and we can help shape those.',
    action: 'Request attendance supports / a student-success plan.',
  },
  {
    id: 'free-enrichment',
    title: 'Free & low-cost before/after-school programs and enrichment',
    law: '21st Century Community Learning Centers, 20 U.S.C. §7171 (federal afterschool funding)',
    domain: 'enrichment',
    matches: (p) => /after ?school|afterschool|before ?school|enrich|club|program|tutor|extra?curricular|youth|activity/i.test(text(p, 'needs', 'challenges')),
    worthAsking: (p) => /low|free|income|afford|help|money/i.test(text(p, 'needs', 'challenges')),
    question: 'Would your child like to join a free or low-cost before- or after-school program or club?',
    why: 'Districts often run fee-waived before-/after-school and enrichment programs; joining gives your child a structured, safe afternoon (and is a real benefit).',
    action: 'Find the district/school before- & after-school or enrichment programs, request a fee waiver, and sign up.',
  },
];

export interface AuditItem {
  entitlement: Entitlement;
  status: 'likely' | 'accessed' | 'missing';
}

/** Map the family's situation to every entitlement they may be owed. */
export function auditEntitlements(profile: FamilyProfile, accessed: string[] = []): AuditItem[] {
  // Public-school programs only apply to public districts. For a private (or
  // not-yet-resolved) school, assert nothing — the school sets its own policies.
  if (profile.schoolType && profile.schoolType !== 'public') return [];
  return ENTITLEMENTS.filter((e) => e.matches(profile)).map((e) => ({
    entitlement: e,
    status: accessed.includes(e.id) ? 'accessed' : 'likely',
  }));
}

export interface DiscoveryQuestion {
  id: string;
  question: string;
  why: string;
  action: string;
  /** The measurable, provable outcome for the student. */
  impact: string;
}

const IMPACT: Record<string, string> = {
  transport: 'gets to school reliably',
  meals: 'gets meals every day',
  support: 'gets a real assessment and a support plan',
  language: 'gets language support',
  attendance: 'attendance improves',
  enrichment: 'gets into a free before/after-school program',
};

/** The well-founded, self-directed curiosity questions (only what could unlock help). */
export function discoveryQuestions(profile: FamilyProfile): DiscoveryQuestion[] {
  // Same gate as auditEntitlements: no public-school curiosity for private/unknown schools.
  if (profile.schoolType && profile.schoolType !== 'public') return [];
  return ENTITLEMENTS.filter((e) => e.matches(profile) || (e.worthAsking ? e.worthAsking(profile) : false))
    .map((a) => ({
      id: a.id,
      question: a.question,
      why: a.why,
      action: a.action,
      impact: IMPACT[a.domain] ?? 'a measurable improvement',
    }));
}
```

---
## src/knowledge/precall.ts

```ts
import 'dotenv/config';
import { KnowledgeGraph } from './graph.js';
import { searchSchoolGraph } from './resource-graph.js';
import { resolveAnyDistrict } from './discovery.js';

/**
 * Pre-call research brief. Fetches everything we already know about a school /
 * district deterministically (knowledge graph + resource graph — no LLM, no web
 * search) so a phone call can START informed instead of researching live. This
 * is the "do a little research before the call" step: resolve the school, pull
 * down the rights/entitlements and the forms/contacts, and hand the voice agent
 * a plain-language cheat sheet.
 *
 * Plain language throughout: statute numbers are deliberately omitted (the voice
 * agent is told never to quote them; the text agent translates them anyway).
 */
export async function buildPreCallBrief(districtName?: string, schoolName?: string): Promise<string> {
  const input = String(districtName ?? schoolName ?? '').trim();
  if (!input) return '';

  const district = resolveAnyDistrict(input);
  const graph = new KnowledgeGraph();
  const nodes = await graph.get(district.id);
  const chain = await searchSchoolGraph(district.id);

  const lines: string[] = [];

  if (district.resolved) {
    lines.push(`School district: ${district.name} (${district.state}).`);
    if (district.liaison) {
      lines.push(
        `District homeless liaison: ${district.liaison.name} — ${district.liaison.role}, ${district.liaison.phone}, ${district.liaison.email}.`,
      );
    }
  }

  // Rights/entitlements in plain words (verified or draft) — no statute codes.
  for (const n of nodes) {
    if (n.status !== 'verified' && n.status !== 'draft') continue;
    lines.push(`- ${n.title}: ${n.summary}`);
  }

  // Forms / eligibility / contacts / deadlines from the resource chain.
  if (chain) {
    if (chain.eligibility.length) lines.push(`Eligibility: ${chain.eligibility.map((n) => n.summary).join('; ')}`);
    if (chain.forms.length) lines.push(`Forms: ${chain.forms.map((n) => n.title).join(', ')}`);
    if (chain.contacts.length) lines.push(`Contacts: ${chain.contacts.map((n) => `${n.title} — ${n.summary}`).join('; ')}`);
    if (chain.deadlines.length) lines.push(`Deadlines: ${chain.deadlines.map((n) => n.title).join(', ')}`);
  }

  return lines.join('\n');
}
```

---
## src/knowledge/discovery.ts

```ts
// ─────────────────────────────────────────────────────────────────────────────
// Generalized school/district discovery resolution.
//
// Given ANY school or district name, resolve it to a canonical record. There is
// NO hardcoded district here: ids are derived stably from the name (+ location),
// and the contact/school facts come from the researched-district registry in
// `districts.ts` (produced by research for whatever district a parent names).
// Anything not researched returns a `resolved:false` record so the research
// pipeline can fill it in. This is what lets Axolotl work for ANY school, not
// just the one we seeded.
// ─────────────────────────────────────────────────────────────────────────────

import {
  districtIdFromName,
  schoolIdFromName,
  getResearchedDistrict,
  type DistrictProfile,
} from './districts.js';

export interface SchoolRef {
  id: string;
  name: string;
  districtId: string;
  districtName: string;
  state: string;
  principal?: string;
  phone?: string;
  address?: string;
  /** true = we have a researched/known profile; false = still to be researched. */
  resolved: boolean;
}

export interface DistrictRef {
  id: string;
  name: string;
  short?: string;
  state: string;
  city?: string;
  schools: SchoolRef[];
  liaison?: { name: string; role: string; phone: string; email: string };
  busPasses?: { name: string; phone: string };
  resolved: boolean;
}

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '');
}

/** Split a researched `schools` string (e.g. "• Soquel Elementary — Name, (831)…") into refs. */
function parseSchools(schools: unknown, districtId: string, districtName: string, state: string): SchoolRef[] {
  const refs: SchoolRef[] = [];
  const text = typeof schools === 'string' ? schools : Array.isArray(schools) ? schools.filter((s) => typeof s === 'string').join('\n') : '';
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:•|[-*])\s*(.+?)(?:\s*[—-]\s*(.*))?$/i);
    if (!m) continue;
    const name = m[1]?.trim() ?? '';
    if (!name) continue;
    const rest = m[2]?.trim() ?? '';
    const principal = rest.match(/([A-Z][a-z]+(?: [A-Z][a-z]+)+)/)?.[1];
    const phone = rest.match(/\(?[\d]{3}\)?[\s.-]*[\d]{3}-?[\d]{4}/)?.[0];
    refs.push({
      id: schoolIdFromName(`${name} ${districtName}`),
      name,
      districtId,
      districtName,
      state,
      principal,
      phone,
      resolved: true,
    });
  }
  return refs;
}

function districtRefFromProfile(p: DistrictProfile): DistrictRef {
  const schools = p.schools
    ? parseSchools(p.schools, p.id, p.name, p.state ?? 'CA')
    : [];
  if (!schools.length && (p.elementary || p.name)) {
    schools.push({
      id: schoolIdFromName(`${p.elementary ?? p.name}`),
      name: p.elementary ?? p.name,
      districtId: p.id,
      districtName: p.name,
      state: p.state ?? 'CA',
      resolved: p.known,
    });
  }
  return {
    id: p.id,
    name: p.name,
    short: p.short,
    state: p.state ?? 'CA',
    city: p.city,
    schools,
    liaison: p.liaison,
    busPasses: p.busPasses,
    resolved: p.known,
  };
}

/** Resolve to a definite district: known/researched when possible, else provisional. */
export function resolveAnyDistrict(input: string): DistrictRef {
  const profile = getResearchedDistrict(input);
  if (profile) return districtRefFromProfile(profile);
  return districtRefFromProfile({ id: districtIdFromName(input), name: (input ?? '').trim() || 'their district', known: false, type: 'unknown' });
}

/** Resolve to a definite school: known/researched when possible, else provisional. */
export function resolveAnySchool(input: string): SchoolRef {
  const district = resolveAnyDistrict(input);
  return district.schools[0] ?? {
    id: schoolIdFromName(input),
    name: (input ?? '').trim() || 'their school',
    districtId: district.id,
    districtName: district.name,
    state: district.state,
    resolved: false,
  };
}
```

---
## src/knowledge/graph.ts

```ts
import 'dotenv/config';
import { getSupabase } from '../integrations/db.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory, type KnowledgeNode, type KnowledgeSource } from '../domain/knowledge.js';
import type { CandidateNode } from './research.js';

let cache = new Map<string, KnowledgeNode[]>();

/**
 * The knowledge graph. Canonical, category-tagged facts per district/school,
 * backed by Supabase (`knowledge_node`) with an in-memory fallback. This is the
 * RAG corpus the agent retrieves from (grounded, verified-or-draft). Districts
 * are researched on demand — there is no seeded "known" district; the gated
 * `autoResearchDistrict` fills a district when a parent names it.
 */
export class KnowledgeGraph {
  /** Return nodes for a district. Empty until a district is researched. */
  async get(districtId: string, category?: KnowledgeCategory | 'LAW'): Promise<KnowledgeNode[]> {
    let nodes = cache.get(districtId);
    if (!nodes) {
      nodes = await this.loadFromDb(districtId);
      cache.set(districtId, nodes);
    }
    if (category) return nodes.filter((n) => n.category === category);
    return nodes;
  }

  async add(districtId: string, node: KnowledgeNode): Promise<void> {
    const existing = cache.get(districtId) ?? [];
    cache.set(districtId, [...existing.filter((n) => n.id !== node.id), node]);
    await this.persistToDb(node);
  }

  /**
   * pgvector cosine-similarity search over a district's nodes (RAG). Calls the
   * `match_knowledge` RPC (db/embedding.sql). Gracefully returns [] when the
   * RPC/table isn't set up or embeddings aren't populated — callers then fall
   * back to category/keyword filtering.
   */
  async search(districtId: string, embedding: number[], limit = 5, category?: string): Promise<KnowledgeNode[]> {
    const c = getSupabase();
    if (!c || !embedding?.length) return [];
    try {
      const { data, error } = await c.rpc('match_knowledge', {
        query_embedding: embedding,
        district_id: districtId,
        match_count: limit,
        match_category: category ?? null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: unknown) => nodeFromRow(row as Record<string, unknown>));
    } catch (e) {
      console.error('[knowledge] vector search unavailable (fallback to keyword):', (e as Error)?.message ?? e);
      return [];
    }
  }

  /** Re-verify a node (bump lastVerifiedAt) or flip draft→verified. */
  async confirm(districtId: string, nodeId: string, verified: boolean): Promise<void> {
    const nodes = cache.get(districtId) ?? [];
    const next = nodes.map((n) =>
      n.id === nodeId
        ? { ...n, status: verified ? ('verified' as const) : n.status, lastVerifiedAt: new Date().toISOString() }
        : n,
    );
    cache.set(districtId, next);
    const node = next.find((n) => n.id === nodeId);
    if (node) await this.persistToDb({ ...node, status: verified ? 'verified' : node.status });
  }

  private async loadFromDb(districtId: string): Promise<KnowledgeNode[]> {
    const c = getSupabase();
    if (!c) return [];
    const { data, error } = await c.from('knowledge_node').select('*').eq('district_id', districtId);
    if (error) return []; // table may not exist yet; fall back to in-memory seed
    return (data ?? []).map((row) => nodeFromRow(row));
  }

  private async persistToDb(node: KnowledgeNode): Promise<void> {
    const c = getSupabase();
    if (!c) return;
    try {
      const { error } = await c.from('knowledge_node').upsert(rowFromNode(node), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[knowledge] persist failed (in-memory only):', (e as Error)?.message ?? e);
    }
  }
}

function nodeFromRow(row: Record<string, unknown>): KnowledgeNode {
  return {
    id: row.id as string,
    category: row.category as KnowledgeNode['category'],
    title: row.title as string,
    summary: (row.summary ?? '') as string,
    sources: (row.sources ?? []) as KnowledgeSource[],
    jurisdiction: row.jurisdiction as KnowledgeNode['jurisdiction'],
    law: (row.law ?? undefined) as string | undefined,
    status: (row.status ?? 'draft') as KnowledgeNode['status'],
    confidence: Number(row.confidence ?? 0),
    lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowFromNode(n: KnowledgeNode): Record<string, unknown> {
  return {
    id: n.id,
    district_id: n.districtId,
    school_id: n.schoolId ?? null,
    category: n.category,
    title: n.title,
    summary: n.summary,
    sources: n.sources,
    jurisdiction: n.jurisdiction,
    law: n.law ?? null,
    status: n.status,
    confidence: n.confidence,
    last_verified_at: n.lastVerifiedAt ?? null,
    created_at: n.createdAt,
  };
}

/** Slugs a stable node id per category/title. */
function nodeId(districtId: string, slug: string): string {
  return `${districtId}-${slug}`;
}

/**
 * The generic, grounded legal/draft facts the pipeline seeds for ANY district.
 * These cite real US law (applicable nationwide); district-specific application
 * is what the family must confirm with the office — hence status 'draft' and a
 * "may be entitled / confirm" framing (safety: never state as authoritative).
 */
const GENERIC_DRAFTS: Array<{
  category: KnowledgeNode['category'];
  title: string;
  summary: string;
  jurisdiction: KnowledgeNode['jurisdiction'];
  law: string;
}> = [
  {
    category: 'TRANSPORTATION',
    title: 'Transportation to school of origin',
    summary:
      'A student who is homeless or displaced may be entitled to transportation to their school of origin on request. Confirm the district process.',
    jurisdiction: 'federal',
    law: '42 U.S.C. §11432(g)(1)(J)',
  },
  {
    category: 'MEALS',
    title: 'Free & reduced-price meals',
    summary:
      'Your child may qualify for free or reduced-price meals; submit/confirm the meal application with the school food service office.',
    jurisdiction: 'federal',
    law: '42 U.S.C. §1758',
  },
  {
    category: 'BASIC_NEEDS',
    title: 'Immediate enrollment & homeless support',
    summary:
      'A student without a fixed address can enroll immediately without residency/birth records, and a district liaison can help. Confirm with the district.',
    jurisdiction: 'federal',
    law: '42 U.S.C. §11432(g)(1)(H)',
  },
  {
    category: 'ATTENDANCE',
    title: 'Attendance supports',
    summary:
      'If attendance is at risk, the district should offer supports. Ask the attendance office about a student-support or attendance plan.',
    jurisdiction: 'federal',
    law: '20 U.S.C. §6311',
  },
  {
    category: 'LEARNING',
    title: 'English-learner / language support',
    summary:
      'Students learning English are entitled to language support, and the school must communicate with the family in a language they understand.',
    jurisdiction: 'federal',
    law: '20 U.S.C. §6811',
  },
  {
    category: 'BEHAVIOR',
    title: 'Bullying / safety plan',
    summary:
      'Bullying is reportable and the school must respond; you can request a safety plan. Ask the principal how to report at this school.',
    jurisdiction: 'state',
    law: 'Ed Code §234',
  },
  {
    category: 'SPECIAL_ED',
    title: 'Special education evaluation (IEP)',
    summary:
      'If you suspect a disability is affecting learning, you can request a written evaluation. The district determines eligibility, not us.',
    jurisdiction: 'federal',
    law: 'IDEA 20 U.S.C. §1414',
  },
  {
    category: 'ACCOMMODATIONS',
    title: '504 plan / accommodations',
    summary:
      'A student with a condition that limits a major life activity may be entitled to accommodations under a 504 plan. Request via the school or district.',
    jurisdiction: 'federal',
    law: '29 U.S.C. §794',
  },
  {
    category: 'ACTIVITIES',
    title: 'Before/after-school programs & enrichment (often free)',
    summary:
      'Districts and schools often run free or fee-waived before- & after-school programs, clubs, and enrichment (some are federally funded 21st Century Community Learning Center sites — often free to low-income families). Find the district/school enrichment page or ask the front office; many programs waive fees or use a sliding scale. I can find the program, the sign-up form, and request a fee waiver.',
    jurisdiction: 'district',
    law: '21st Century Community Learning Centers, 20 U.S.C. §7171',
  },
  {
    category: 'GENERAL_NAVIGATION',
    title: 'How to reach the school',
    summary:
      'Contact the school office for the bell schedule, front-office questions, and how to reach staff. We can only confirm what the district shares publicly.',
    jurisdiction: 'district',
    law: '',
  },
];

/** Build `draft` nodes for all 10 categories for a (possibly un-researched) district. */
export function buildDraftNodes(districtId: string, schoolName: string, districtName: string): KnowledgeNode[] {
  const now = new Date().toISOString();
  return GENERIC_DRAFTS.map((d) => {
    const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
    const source = schoolName && schoolName !== districtName
      ? { title: `${districtName} (confirm with ${schoolName})`, url: `https://www.google.com/search?q=${encodeURIComponent(`${districtName} ${schoolName}`)}` }
      : { title: districtName, url: `https://www.google.com/search?q=${encodeURIComponent(districtName)}` };
    return {
      id: nodeId(districtId, slug),
      districtId,
      category: d.category,
      title: d.title,
      // Draft facts are phrased as possibilities to confirm — never authoritative.
      summary: `${d.summary} (Draft — ${d.jurisdiction} law/guidance; confirm with the school.)`,
      sources: [source],
      jurisdiction: d.jurisdiction,
      law: d.law || undefined,
      status: 'draft' as const,
      confidence: d.category === 'GENERAL_NAVIGATION' || d.category === 'ACTIVITIES' ? 0.4 : 0.7,
      createdAt: now,
    };
  });
}

/**
 * The automatic school-knowledge pipeline. For a district, produce category-tagged
 * `draft` nodes for any of the 10 categories that don't yet have a verified node.
 * When a `researcher` hook is provided it first tries real web research (fetch +
 * LLM categorization, grounded with source URLs); the generic grounded-law drafts
 * fill any categories research didn't cover. Existing (verified) nodes are never
 * overwritten. This is what makes the agent "get better as more schools onboard."
 */
export async function autoResearchDistrict(
  graph: KnowledgeGraph,
  districtId: string,
  schoolName: string,
  districtName: string,
  researcher?: () => Promise<CandidateNode[]>,
): Promise<KnowledgeNode[]> {
  const existing = await graph.get(districtId);
  const covered = new Set<string>(existing.map((n) => n.category as string));

  let researched: CandidateNode[] = [];
  if (researcher) {
    try {
      researched = await researcher();
    } catch (e) {
      console.error('[knowledge] researcher failed:', (e as Error)?.message ?? e);
    }
  }
  const now = new Date().toISOString();
  const researchedNodes = researched
    .map((c): KnowledgeNode | null => {
      const cat = c.category.trim().toUpperCase().replace(/\s+/g, '_');
      if (!(KNOWLEDGE_CATEGORIES as string[]).includes(cat)) return null;
      return {
        id: nodeId(districtId, c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)),
        districtId,
        category: cat as KnowledgeNode['category'],
        title: c.title,
        summary: c.summary,
        sources: [{ title: c.title, url: c.url }],
        jurisdiction: 'district',
        status: 'draft' as const,
        confidence: 0.6,
        createdAt: now,
      };
    })
    .filter((n): n is KnowledgeNode => n !== null);

  const generic = buildDraftNodes(districtId, schoolName, districtName);
  const merged = [...researchedNodes, ...generic].filter((n) => !covered.has(n.category as string));
  // One node per category (research first, generic law as the fallback).
  const seen = new Set<string>();
  const uniq = merged.filter((n) => {
    if (seen.has(n.category as string)) return false;
    seen.add(n.category as string);
    return true;
  });
  for (const n of uniq) await graph.add(districtId, n);
  return uniq;
}
```

---
## src/knowledge/school-info.ts

```ts
import type { DistrictProfile } from './districts.js';

/**
 * School/district facts answered from the RESEARCHED district profile — never a
 * hardcoded district. The agent must ONLY state facts present in the researched
 * profile; anything it doesn't have it says so ("I don't have that yet") and
 * offers to look it up or points to the school office. Never invent a principal,
 * phone number, or address.
 */

/** Plain-language definition of "homeless" under McKinney-Vento (education). */
export const HOMELESS_DEFINITION =
  'Under McKinney-Vento, "homeless" means not having a fixed, regular, and adequate place to sleep at night — for example: staying with others because you lost housing or money is tight, or living in a shelter, motel, car, park, campground, or a place not meant for sleeping.';

/**
 * Answer a common factual question about the school/district from the researched
 * profile. Returns `undefined` when the profile doesn't carry it (so the caller
 * can fall back to web research rather than inventing an answer). `schoolName`
 * is the family's school, to disambiguate the primary contact.
 */
export function answerSchoolInfo(profile: DistrictProfile, text: string): string | undefined {
  const t = text.toLowerCase();
  const org = profile.name || 'the district';
  const elementary = profile.elementary;

  // Liaison / student-services contact (specific first — "homeless" also appears
  // in "what does homeless mean", handled below with a tighter regex).
  if (/liaison|student services|mckinney.?vento.*(contact|person|help)|homeless (contact|person|help|liaison)/.test(t)) {
    return profile.liaison
      ? `The district homeless liaison for ${org} is ${profile.liaison.name} (${profile.liaison.phone}, ${profile.liaison.email}).`
      : `I don't have the district homeless liaison for ${org} on file yet. Let me research it — or the school office can point you right.`;
  }

  if (/bus|transport|pass|ride/.test(t) && profile.busPasses) {
    return `For free or subsidized school bus passes, contact ${profile.busPasses.name} at ${profile.busPasses.phone}.`;
  }

  if (/schools|which school|district (has|is)|list.*school/.test(t) && profile.schools) {
    return `${org} schools:\n${profile.schools}`;
  }

  if (/what (district|district.*is)|which district|district name/.test(t)) {
    return `${elementary ?? org} is in the ${org}.`;
  }

  // Definition of "homeless" / McKinney-Vento (tight, so it doesn't shadow a liaison ask).
  if (/what (does|is) (a )?(homeless|mckinney|mv).*?mean|definition of (homeless|mckinney)|mckinney.?vento.*definition/.test(t)) {
    return HOMELESS_DEFINITION;
  }

  // Principal / phone / address / bell schedule are not structured in the profile.
  // Return undefined so the caller does real research rather than guessing.
  return undefined;
}

/**
 * The exact process for requesting transportation for a student experiencing
 * homelessness/displacement, using the district's researched liaison + bus-pass
 * contacts when we have them, and honest generic language when we don't.
 */
export function busProcessSummary(profile: DistrictProfile, schoolOfOrigin?: string, childNames?: string): string {
  const org = profile.name || 'your school district';
  const school = schoolOfOrigin
    ? `"${schoolOfOrigin}"`
    : 'their "school of origin" (the school they attended before this)';
  const scope = childNames ? ` for ${childNames}` : '';
  const scopeNote = childNames ? `\n\nThis covers ${childNames}.` : '';
  const liaisonLine = profile.liaison
    ? `Contact the district homeless liaison — ${profile.liaison.name}, ${profile.liaison.phone}, ${profile.liaison.email}.`
    : `Contact the district homeless liaison for ${org} (the school office can give you the name and number, or I can research it).`;
  const busPassLine = profile.busPasses
    ? `For free or subsidized bus passes, call ${profile.busPasses.name} at ${profile.busPasses.phone}.`
    : 'Ask the liaison about free or subsidized bus passes.';
  return [
    `Here's exactly how this works in ${org}:`,
    '',
    `Under McKinney-Vento, a child who is homeless or displaced has the right to transportation to ${school} if the parent or guardian asks for it.${scopeNote}`,
    '',
    `To request the bus${scope}:`,
    `1. ${liaisonLine}`,
    `2. ${busPassLine}`,
    '3. You do not need proof of residency or school records — your child can stay enrolled and be transported while this is sorted out.',
    '',
    `I haven't sent anything to the school — I can't take that action yet. The fastest step right now is to ${profile.liaison ? `call ${profile.liaison.name} at ${profile.liaison.phone}` : `reach out to the ${org} homeless liaison`}; supporting families in your situation is exactly their job. You're welcome to keep texting me with questions.`,
  ].join('\n');
}
```

---
## src/knowledge/research.ts

```ts
import { SearchSession, DEFAULT_BUDGET, extractSearchTerms, normalizeQuery, type SearchBudget } from './trajectory.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from '../domain/knowledge.js';
import { extractPdf, isPdfUrl } from '../integrations/browser.js';
import type { LlmClient } from '../agent/llm.js';

/** A grounded knowledge candidate produced from real web research. */
export interface CandidateNode {
  category: string;
  title: string;
  summary: string;
  url: string;
}

/** Category → search hint, for gap-aware query formulation. */
const CATEGORY_QUERY_HINTS: Record<KnowledgeCategory, string> = {
  TRANSPORTATION: 'transportation bus service eligibility',
  MEALS: 'free reduced meals application',
  BASIC_NEEDS: 'enrollment homeless McKinney-Vento',
  ATTENDANCE: 'attendance policy absence',
  LEARNING: 'language support English learner',
  BEHAVIOR: 'bullying safety plan',
  SPECIAL_ED: 'special education IEP evaluation',
  ACCOMMODATIONS: '504 plan accommodations',
  ACTIVITIES: 'free before after school program enrichment fee waiver sign up',
  GENERAL_NAVIGATION: 'office contact',
};

function envBudget(): SearchBudget {
  const n = (v: string | undefined, d: number) => (v ? Number(v) : d);
  return {
    maxSearches: n(process.env.RESEARCH_MAX_SEARCHES, DEFAULT_BUDGET.maxSearches),
    maxFetches: n(process.env.RESEARCH_MAX_FETCHES, DEFAULT_BUDGET.maxFetches),
    maxSteps: n(process.env.RESEARCH_MAX_STEPS, DEFAULT_BUDGET.maxSteps),
    maxNoProgress: n(process.env.RESEARCH_MAX_NO_PROGRESS, DEFAULT_BUDGET.maxNoProgress),
  };
}

/** DuckDuckGo HTML via the jina.ai reader → markdown containing result links. */
async function searchWeb(query: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

/** Fetch a page as text via the jina.ai reader. (Static text; the browser layer is Phase 2.) */
async function fetchWeb(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`);
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

/** Extract candidate result URLs (multiple) from DuckDuckGo markdown. */
export function extractUrls(markdown: string, limit = 5): string[] {
  const urls: string[] = [];
  const uddgRe = /https:\/\/duckduckgo\.com\/l\/\?uddg=([^&\s)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = uddgRe.exec(markdown)) && urls.length < limit) {
    const u = m[1];
    if (u) {
      try {
        urls.push(decodeURIComponent(u));
      } catch {
        /* skip malformed */
      }
    }
  }
  const bareRe = /https:\/\/(?!html\.duckduckgo\.com|r\.jina\.ai|duckduckgo\.com)[^\s)\]]+/g;
  while ((m = bareRe.exec(markdown)) && urls.length < limit * 2) {
    const u = m[0];
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls.filter((u, i, a) => a.indexOf(u) === i).slice(0, limit);
}

function inferDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function normalizeCategory(category: string): KnowledgeCategory | undefined {
  const cat = category.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (KNOWLEDGE_CATEGORIES as string[]).includes(cat) ? (cat as KnowledgeCategory) : undefined;
}

/** Map a parent's free-text goal to a canonical category (best-effort). */
export function inferCategory(goal: string): KnowledgeCategory | undefined {
  const g = goal.toLowerCase();
  if (/transport|bus|ride|pickup|dropoff|route/.test(g)) return 'TRANSPORTATION';
  if (/meal|lunch|breakfast|food|hungr|free.?reduced/.test(g)) return 'MEALS';
  if (/homeless|shelter|motel|housing|enroll|address|residency|records|school of origin/.test(g)) return 'BASIC_NEEDS';
  if (/attend|absent|sick|truant|illness/.test(g)) return 'ATTENDANCE';
  if (/language|english learner|translate|interpret|bilingual|spanish/.test(g)) return 'LEARNING';
  if (/bull|harass|safety plan|threat/.test(g)) return 'BEHAVIOR';
  if (/504|accommodation|disability|adhd|autism/.test(g)) return 'ACCOMMODATIONS';
  if (/iep|special education|evaluation|assessment|speech|occupational/.test(g)) return 'SPECIAL_ED';
  if (/after ?school|before ?school|afterschool|enrich|club|sport|tutor|extra?curricular|youth program|(programs? for)|summer (school|program|camp)|day ?care|child ?care/.test(g)) return 'ACTIVITIES';
  return undefined;
}

function seedQueries(districtName: string, schoolName: string, goal?: string): string[] {
  const base = `${districtName} ${schoolName}`;
  if (goal) return [`${base} ${goal}`, `${districtName} ${goal}`];
  return [`${base}`, `${districtName} transportation meals enrollment special education`];
}

/** Form the next queries from uncovered gaps + learned terms (+ LLM suggestion). */
async function formulateQueries(
  session: SearchSession,
  districtName: string,
  schoolName: string,
  llm: LlmClient | undefined,
  covered: Set<KnowledgeCategory>,
  target: KnowledgeCategory[],
): Promise<string[]> {
  const queries: string[] = [];

  if (llm?.enabled) {
    const suggested = await llm.suggestNextQuery({
      question: session.originalQuestion,
      district: districtName,
      school: schoolName,
      priorQueries: [...session.issuedQueries],
      learnedTerms: [...session.learnedTerms],
      gaps: target.filter((c) => !covered.has(c)).map((c) => CATEGORY_QUERY_HINTS[c] ?? c),
    });
    if (suggested) queries.push(suggested);
  }

  for (const cat of target) {
    if (covered.has(cat)) continue;
    queries.push(`${districtName} ${schoolName} ${CATEGORY_QUERY_HINTS[cat]}`);
  }

  for (const term of [...session.learnedTerms].slice(-4).reverse()) {
    if (/^\d/.test(term)) queries.push(`"${term}" ${districtName}`);
    else if (!queries.some((q) => q.includes(term))) queries.push(`${districtName} ${term}`);
  }

  return queries;
}

/**
 * Focused research for a SINGLE question (vs. the broad district crawl above):
 * one/two searches + fetch the top pages, and return the raw page text for the
 * LLM to synthesize a direct answer. Used by the voice→text handoff so a
 * deferred question is answered quickly, not via the whole knowledge-graph crawl.
 */
export async function researchQuestion(
  question: string,
  districtName?: string,
  schoolName?: string,
  maxPages = 2,
): Promise<string> {
  const query = [question, districtName, schoolName].filter(Boolean).join(' ');
  const md = await searchWeb(query);
  const urls = extractUrls(md, maxPages + 2);
  const pages: string[] = [];
  for (const url of urls) {
    if (pages.length >= maxPages) break;
    try {
      let page: string;
      if (isPdfUrl(url)) {
        const pr = await extractPdf(url);
        page = pr.ok ? pr.data.text : '';
      } else {
        page = await fetchWeb(url);
      }
      if (page) pages.push(page.slice(0, 8000));
    } catch {
      /* skip a bad page */
    }
  }
  return pages.join('\n\n');
}

/**
 * The deep-research loop for a school/district. Iteratively searches, fetches
 * unseen pages, extracts learned terminology, and categorizes grounded knowledge
 * nodes — trajectory-aware (prior queries + useful docs + learned terms), bounded
 * (budget + stuck detection), and self-recovering (exact-phrase / domain search).
 *
 * Returns [] when the LLM isn't enabled or research fails; callers then fall back
 * to the generic grounded-law drafts, so the graph still gets a typed skeleton.
 */
export async function researchDistrictNodes(
  districtName: string,
  schoolName: string,
  llm: LlmClient | undefined,
  goal?: string,
): Promise<CandidateNode[]> {
  if (!llm?.enabled) return [];

  const goalCategory = goal ? inferCategory(goal) : undefined;
  const target: KnowledgeCategory[] = goalCategory ? [goalCategory] : [...KNOWLEDGE_CATEGORIES];
  const session = new SearchSession(
    `${districtName} ${schoolName}${goal ? ` — ${goal}` : ''}`,
    envBudget(),
  );

  const nodes: CandidateNode[] = [];
  const covered = new Set<KnowledgeCategory>();
  let queries = seedQueries(districtName, schoolName, goal);
  let domain: string | undefined;

  while (true) {
    // Find the next issuable (non-duplicate) query.
    let query: string | undefined;
    while (queries.length) {
      if (!session.canSearch()) break;
      const next = queries.shift();
      if (!next) continue;
      if (session.issueQuery(next) !== null) {
        query = next;
        break;
      }
    }

    if (!query) {
      const stop = session.evaluateStop(target.length - covered.size);
      if (stop.stop) {
        session.stop(stop.reason ?? 'exhausted');
        break;
      }
      const formed = await formulateQueries(session, districtName, schoolName, llm, covered, target);
      if (formed.some((q) => !session.issuedQueries.has(normalizeQuery(q)))) {
        queries = formed;
        continue;
      }
      session.stop('no-new-queries');
      break;
    }

    const searchMd = await searchWeb(query);
    const urls = extractUrls(searchMd).filter((u) => !session.hasSeen(u));
    if (domain === undefined) domain = inferDomain(urls[0]);

    let newSources = urls.length;
    let usefulSources = 0;

    // Recovery: exact-phrase and (if we learned a domain) site-restricted search.
    if (urls.length === 0) {
      for (const r of session.recoveryQueries(query, domain)) {
        if (!session.canSearch()) break;
        if (session.issueQuery(r) === null) continue;
        const rmd = await searchWeb(r);
        const rurls = extractUrls(rmd).filter((u) => !session.hasSeen(u));
        if (rurls.length) {
          urls.push(...rurls);
          newSources += rurls.length;
          break;
        }
      }
    }

    const stepTerms = new Set<string>();
    for (const url of urls) {
      if (!session.canFetch()) break;
      let page: string;
      if (isPdfUrl(url)) {
        const pr = await extractPdf(url);
        page = pr.ok ? pr.data.text : '';
      } else {
        page = await fetchWeb(url);
      }
      if (!page || page.length < 40) {
        session.markFetched({ url, useful: false });
        continue;
      }
      const terms = llm.enabled
        ? (await llm.extractSearchTerms(page)) ?? extractSearchTerms(page)
        : extractSearchTerms(page);
      for (const t of terms) stepTerms.add(t);

      const kn = await llm.generateKnowledgeNodes(districtName, page);
      const useful = Boolean(kn && kn.length > 0);
      if (kn) {
        for (const n of kn) {
          const resolved = { ...n, url: n.url || url };
          nodes.push(resolved);
          const cat = normalizeCategory(resolved.category);
          if (cat) covered.add(cat);
        }
        usefulSources++;
      }
      session.markFetched({ url, useful });
    }

    session.addLearnedTerms(stepTerms);
    session.recordStep({
      kind: 'search',
      subject: query,
      reason: 'gap',
      newSources,
      usefulSources,
      learnedTerms: [...stepTerms],
    });

    const stop = session.evaluateStop(target.length - covered.size);
    if (stop.stop) {
      session.stop(stop.reason ?? 'done');
      break;
    }

    queries = await formulateQueries(session, districtName, schoolName, llm, covered, target);
  }

  if (process.env.RESEARCH_LOG_TRAJECTORY !== 'false') {
    console.log('[research] trajectory:', JSON.stringify(session.snapshot()));
  }
  return nodes;
}
```

---
## src/domain/types.ts

```ts
export type ID = string;

/** Free/reduced eligibility as tracked by the school nutrition program. */
export type MealStatus = 'free' | 'reduced' | 'paid' | 'unknown';

export interface Student {
  id: ID;
  firstName: string;
  lastName: string;
  /** e.g. 3 for third grade. */
  grade: number;
  schoolId: ID;
  homeroomTeacherId: ID;
  mealStatus: MealStatus;
}

export interface Parent {
  id: ID;
  /** E.164, used to resolve identity from a messaging channel. */
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Students this parent is authorized to act on behalf of. */
  studentIds: ID[];
}

export interface School {
  id: ID;
  name: string;
  district: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
}

export interface Teacher {
  id: ID;
  schoolId: ID;
  firstName: string;
  lastName: string;
  /** e.g. "3rd Grade" or "Math". */
  subject: string;
}

/** Everything the agent needs to act on one family/school relationship. */
export interface FamilyContext {
  parent: Parent;
  students: Student[];
  school?: School;
  teachers: Teacher[];
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

/** A child described during onboarding (not yet tied to the SIS). */
export interface ChildProfile {
  name: string;
  /** e.g. "3rd", "1", "K". */
  grade?: string;
}

/** The family profile gathered during onboarding. */
export interface FamilyProfile {
  parentName?: string;
  children: ChildProfile[];
  /** e.g. "Soquel Elementary School". */
  school?: string;
  /** City/state to disambiguate a school, e.g. "Seattle, WA". */
  location?: string;
  /** e.g. "Soquel Union Elementary School District". */
  district?: string;
  /** Stable district key (set once the district is researched). */
  districtId?: string;
  /** Areas they want help with: transportation, meals, attendance, conferences, enrollment, special education, … */
  needs: string[];
  /** Challenges: homeless/transitional housing, IEP/504, health, language, recently moved, … */
  challenges: string[];
  /** Preferred message language. Defaults to English; Spanish is first-class. */
  locale?: 'en' | 'es';
  /** A parent-provided email (used to send the welcome/proof email, even without Gmail). */
  email?: string;
  /** public | private | charter | unknown — set at onboarding; gates public-school entitlements. */
  schoolType?: 'public' | 'private' | 'charter' | 'unknown';
  /** What the family has already secured (free meals, a 504 plan, a bus pass). */
  getting?: string[];
  notes?: string;
}

/** An open case the agent is working on for the family (the "remember" layer). */
export interface CaseRecord {
  id: string;
  kind: string; // transportation | meals | bullying | health | attendance | evaluation
  status: 'open' | 'awaiting' | 'resolved';
  summary: string;
  child?: string;
  contact?: string;
  reminder?: string;
  createdAt: string;
}

/** The brief handed to the voice agent for an outbound call. */
export interface CallContext {
  parent_name: string;
  student: string;
  grade: string;
  school: string;
  district: string;
  issue: string;
  goal: string;
  what_we_know: string;
}
```
