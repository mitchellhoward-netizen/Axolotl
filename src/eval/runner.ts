import { execFileSync } from 'node:child_process';
import { Agent } from '../agent/agent.js';
import { RulesIntentEngine } from '../agent/intent/rules.js';
import type { LlmClient } from '../agent/llm.js';
import type { ChannelAdapter } from '../agent/steps/adapter.js';
import type { StepExecutor } from '../agent/steps/executor.js';
import type { Channel, Step, StepResult } from '../agent/steps/types.js';
import { MockCalendarProvider } from '../integrations/calendar.js';
import { MockMealsProvider, type MealsProvider } from '../integrations/meals.js';
import { MockSis } from '../integrations/sis.js';
import { createSeedDb, provisionFamily } from '../seed.js';
import type { FamilyRecord } from '../family/facts.js';
import type { FieldValue, FormMap, LaneKind, Pathway, Replica, RunRecord, Submission } from '../pathways/types.js';
import { districtName, membersOf, type HarnessFamily } from './families.js';
import { scriptedParent, type ParentReply, type SimulatedParent } from './parent.js';
import { grade, type GateEntry, type GradeContext } from './scoreboard.js';

/**
 * The runner (docs/PATHWAYS.md §4.4): one synthetic family, one simulated parent, the REAL
 * `Agent.handle`, turn by turn, until the parent is done, gives up, or the turns run out. It
 * watches every consequential action at the agent's adapters (the consent gate's decisions),
 * routes form submits to the replica, then grades the replica's submission against the form
 * filled from the family's true record.
 *
 * Two modes: 'baseline' is today's agent, untouched (the honest "before"); 'pathway' installs a
 * `PathwayHook` so the pathway engine can be plugged in without the runner knowing its insides.
 */

export type AgentMode = 'baseline' | 'pathway';

/** What the runner tells the agent factory: report consequential actions that bypass the
 * step executor (today: the meals provider's application submit). */
export interface FactoryContext {
  conversationId: string;
  onConsequential: (channel: string, intent: string) => void;
  /** Model spend for this run (USD), added to RunRecord.costUsd. */
  addCost: (usd: number) => void;
}
export type AgentFactory = (family: HarnessFamily, ctx: FactoryContext) => Agent | Promise<Agent>;

export interface HookContext {
  family: HarnessFamily;
  conversationId: string;
  asOf: string;
  pathway?: Pathway;
  replica?: Replica;
  replicaUrl?: string;
  parentUrl?: (token: string) => string;
  /** Ask the parent to complete attestations themselves (LaneRunner's `attest`). */
  attest: (fields: string[]) => Promise<void>;
  /** What the parent's own hands do when they attest (open their link, sign the page). The
   * simulated parent runs it when it agrees to sign; the agent never does. */
  onParentAttest: (action: (fields: string[]) => Promise<void>) => void;
}

/** The seam for the pathway engine. Everything is optional except `install`. */
export interface PathwayHook {
  name?: string;
  install(agent: Agent, ctx: HookContext): void | Promise<void>;
  /** The agent's family record (with sources), for the guessed-facts score. */
  record?(conversationId: string): FamilyRecord | undefined;
  /** How the engine says the conversation ended, when it knows. */
  end?(conversationId: string): GradeContext['end'] | undefined;
  lane?(conversationId: string): LaneKind | undefined;
  costUsd?(conversationId: string): number;
}

export interface RunFamilyOptions {
  family: HarnessFamily;
  seed: number;
  mode?: AgentMode;
  agentFactory?: AgentFactory;
  hook?: PathwayHook;
  pathway?: Pathway;
  /** The form to grade against when there is no pathway (the replica's form). */
  form?: FormMap;
  replica?: Replica;
  parent?: (attest: (fields: string[]) => Promise<void>) => SimulatedParent;
  messiness?: 0 | 1 | 2 | 3;
  /** The scripted parent says yes to proposals that show no values (see ParentOptions.trusting). */
  trusting?: boolean;
  maxTurns?: number;
  build?: string;
  /** Checked before each turn: a reason ends the conversation there as abandoned (a spend cap). */
  stop?: () => string | undefined;
}

export interface Turn {
  from: 'parent' | 'agent';
  text: string;
}

export interface RunResult {
  record: RunRecord;
  transcript: Turn[];
  gate: GateEntry[];
  submission: Submission | null;
}

/** A replica the runner can hand the agent's submit to directly (the fake one). */
interface Receiving {
  receive(fields: Record<string, FieldValue>, by: 'agent' | 'parent'): Submission;
  attest?(by: 'parent' | 'agent'): void;
}
const canReceive = (r: unknown): r is Receiving => typeof (r as Receiving | undefined)?.receive === 'function';

/** The model clients a baseline agent runs with (none: today's agent without a key). */
export type BaselineModels = (ctx: FactoryContext) => { llm: LlmClient; researchLlm?: LlmClient };

/** Today's agent, as test-approval.ts builds it: rules intent engine, mock SIS seeded with what
 * the district knows (parent, children, school), mock email, no model. */
export const baselineAgentFactory: AgentFactory = (family, ctx) => baselineAgent(family, ctx);

/** Today's agent WITH its brain: the same build, plus model clients (e.g. src/eval/cli-llm.ts). */
export const baselineAgentFactoryWith = (models: BaselineModels): AgentFactory => (family, ctx) => baselineAgent(family, ctx, models);

function baselineAgent(family: HarnessFamily, ctx: FactoryContext, models?: BaselineModels): Agent {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  const rec = family.record;
  const ms = membersOf(rec);
  const self = ms.find((m) => m.relationship === 'self') ?? ms[0]!;
  const students = ms.filter((m) => m.student);
  const db = createSeedDb();
  const parentId = `parent-${family.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const phone = `1${String(rec.get('contact.phone')?.value ?? '').replace(/\D/g, '')}`;
  db.parents.push({ id: parentId, phone, email: '', firstName: self.first, lastName: self.last, studentIds: [] });
  const grade = (g: unknown) => (g === 'K' || g === 'TK' ? String(g) : `${g}th`);
  provisionFamily(db, parentId, {
    children: students.map((s) => ({ name: s.first, grade: grade(rec.get(`member.${s.id}.grade`)?.value) })),
    school: String(rec.get(`member.${students[0]?.id}.school`)?.value ?? ''),
    district: districtName(family.district),
    schoolType: 'public',
    needs: [],
    challenges: [],
  });
  const meals = new MockMealsProvider({});
  const recording: MealsProvider = {
    getStatus: (ids) => meals.getStatus(ids),
    submitFreeReducedApplication: (ids) => {
      ctx.onConsequential('meals', 'submit_free_reduced_application');
      return meals.submitFreeReducedApplication(ids);
    },
    issueVoucher: (ids) => {
      ctx.onConsequential('meals', 'issue_voucher');
      return meals.issueVoucher(ids);
    },
  };
  return new Agent({
    intentEngine: new RulesIntentEngine(),
    sis: new MockSis(db),
    calendar: new MockCalendarProvider(),
    meals: recording,
    db,
    defaultParentId: parentId,
    requireVerification: false,
    email: { send: async () => ({ id: `mock-${Date.now()}` }) } as never,
    ...(models ? models(ctx) : {}),
  });
}

const COVERED_RE = /already (covered|qualif|certified|approved|get free|gets free)|automatically (qualif|get|receive)|directly certified|no need to (fill|send|apply)|don'?t need to (fill|send|apply)|ya (califica|esta cubiert|recibe)|no (necesita|tiene que) (llenar|aplicar)/i;
const HANDOFF_RE = /talk to (a|someone)|real person|call the (school|office|district)|contact (the|your) (school|office|district)|a (staff member|person) will|llame a la (escuela|oficina)|hable con (alguien|una persona)/i;

/** The field values a step carries, for a replica. */
function stepFields(step: Step): Record<string, FieldValue> | undefined {
  const p = step.payload;
  if (p.channel === 'submit') return p.values ?? {};
  if (p.channel === 'form') return p.fields;
  if (p.channel === 'browser') return Object.fromEntries(p.fields.map((f) => [f.label, f.value]));
  return undefined;
}

export async function runFamily(o: RunFamilyOptions): Promise<RunResult> {
  const t0 = Date.now();
  const mode = o.mode ?? 'baseline';
  const family = o.family;
  const conversationId = `eval:${family.id}:${o.seed}`;
  const maxTurns = o.maxTurns ?? 30;
  // A form with no confirmation at all (Pajaro's paper UBA) is at best "sent, not confirmed".
  const expectedEnd = family.expectOutcome === 'done_confirmed' && o.pathway?.confirmation.kind === 'none' ? 'sent_unconfirmed' : family.expectOutcome;
  const notes: string[] = [`expected:${expectedEnd}`];
  const gate: GateEntry[] = [];
  const transcript: Turn[] = [];
  const form = o.pathway?.form ?? o.form;
  if (!form) throw new Error('runFamily needs a pathway or a form to grade against');
  if (mode === 'pathway' && !o.hook) throw new Error("mode 'pathway' needs a PathwayHook (the engine isn't plugged in)");

  // The replica, fresh for this run.
  const replica = o.replica;
  replica?.reset();
  const started = replica ? await replica.start() : undefined;
  let parentAttested = false;
  let parentAction: ((fields: string[]) => Promise<void>) | undefined;
  const attest = async (fields: string[]) => {
    parentAttested = true;
    if (canReceive(replica)) replica.attest?.('parent');
    await parentAction?.(fields);
  };

  const parent: SimulatedParent = o.parent ? o.parent(attest) : scriptedParent({ family, seed: o.seed, messiness: o.messiness, trusting: o.trusting, attest });
  let turn = 0;
  let lastReply: ParentReply | undefined;
  let parentText = parent.opening();

  const onConsequential = (channel: string, intent: string, decision: GateEntry['decision'] = 'executed') => {
    gate.push({ turn, channel, intent, decision, parentText, parentApproved: lastReply?.approved === true, at: new Date().toISOString() });
  };

  let modelCost = 0;
  const addCost = (usd: number) => {
    modelCost += usd;
  };
  const agent = await (o.agentFactory ?? baselineAgentFactory)(family, { conversationId, onConsequential, addCost });
  const pushed: string[] = [];
  agent.registerConversation(conversationId, async (text) => {
    pushed.push(text);
  });
  instrument(agent, { onConsequential, replica: canReceive(replica) ? replica : undefined });
  if (o.hook) {
    await o.hook.install(agent, { family, conversationId, asOf: family.asOf, pathway: o.pathway, replica, replicaUrl: started?.url, parentUrl: started?.parentUrl, attest, onParentAttest: (a) => (parentAction = a) });
  }

  let end: GradeContext['end'] | undefined;
  let lastAgent = '';
  try {
    while (turn < maxTurns) {
      const stopped = o.stop?.();
      if (stopped) {
        end = 'abandoned';
        notes.push(`stopped: ${stopped}`);
        break;
      }
      turn++;
      transcript.push({ from: 'parent', text: parentText });
      const reply = await agent.handle(conversationId, parentText);
      const text = [...pushed.splice(0), reply.text].filter(Boolean).join('\n\n');
      lastAgent = text;
      transcript.push({ from: 'agent', text });
      const hooked = o.hook?.end?.(conversationId);
      if (hooked) {
        end = hooked;
        break;
      }
      lastReply = await parent.reply(text);
      if (lastReply.done || lastReply.gaveUp) {
        transcript.push({ from: 'parent', text: lastReply.text });
        end = lastReply.gaveUp ? 'abandoned' : COVERED_RE.test(text) ? 'already_covered' : HANDOFF_RE.test(text) ? 'handoff' : 'done';
        break;
      }
      parentText = lastReply.text;
    }
    if (!end) {
      end = 'max_turns';
      notes.push(`max turns (${maxTurns})`);
    }
  } catch (e) {
    end = 'error';
    notes.push(`error: ${(e as Error).message}`);
  } finally {
    await started?.close().catch(() => {});
  }
  if (end === 'max_turns') end = COVERED_RE.test(lastAgent) ? 'already_covered' : 'abandoned';

  const subs = replica?.submissions() ?? [];
  const submission = subs.length ? subs[subs.length - 1]! : null;
  const expected = form.fill(family.record, family.asOf);
  if (expected.missing.length) notes.push(`expected fill missing facts: ${expected.missing.join(', ')}`);
  const agentRecord = o.hook?.record?.(conversationId);
  if (!agentRecord) notes.push('agent keeps no family record: every submitted field is unsourced');
  const g = grade(submission, expected, agentRecord, { gate, end });
  if (submission && !parentAttested && expected.attestations.length && submission.attestedBy !== 'parent') notes.push('submitted without the parent attesting');
  const stats = parent.stats();
  notes.push(`end:${end}`, `gate:${gate.map((x) => `${x.channel}/${x.intent}:${x.decision}${x.parentApproved ? '+yes' : ''}`).join(',') || 'none'}`);
  if (stats.corrections.length) notes.push(`parent corrected: ${stats.corrections.join(', ')}`);
  if (stats.unmatched) notes.push(`parent didn't understand ${stats.unmatched} message(s)`);

  const record: RunRecord = {
    build: o.build ?? gitBuild(),
    at: new Date().toISOString(),
    pathway: o.pathway?.id ?? form.id,
    family: family.id,
    parent: `${parent.id}:seed${o.seed}`,
    seed: o.seed,
    agent: mode,
    ...(o.hook?.lane?.(conversationId) ? { lane: o.hook.lane(conversationId) } : {}),
    ...g,
    parentTurns: transcript.filter((t) => t.from === 'parent').length,
    repeatedQuestions: stats.repeatedQuestions,
    costUsd: Math.round(((o.hook?.costUsd?.(conversationId) ?? 0) + modelCost) * 1e6) / 1e6,
    ms: Date.now() - t0,
    notes,
  };
  return { record, transcript, gate, submission };
}

/**
 * Watch the agent's hands. Every step that reaches the executor is logged as a gate decision
 * (blocked by the consent gate, or executed); a form/submit/browser step that executes goes
 * to the replica when the replica takes submissions directly. Reaches into private fields on
 * purpose: the agent has no public adapter seam yet (see the report).
 */
export function instrument(agent: Agent, o: { onConsequential: (channel: string, intent: string, decision?: GateEntry['decision']) => void; replica?: Receiving }): void {
  const executor = (agent as unknown as { executor: StepExecutor }).executor;
  const adapters = (executor as unknown as { adapters: Record<Channel, ChannelAdapter> }).adapters;
  const run = executor.run.bind(executor);
  executor.run = async (step, ctx) => {
    if (step.requiresConsent && step.status !== 'executing') o.onConsequential(step.channel, step.intent, 'blocked');
    return run(step, ctx);
  };
  for (const channel of Object.keys(adapters) as Channel[]) {
    const real = adapters[channel];
    adapters[channel] = {
      channel: real.channel,
      execute: async (step, ctx): Promise<StepResult> => {
        if (step.requiresConsent) o.onConsequential(step.channel, step.intent, 'executed');
        const fields = stepFields(step);
        if (o.replica && fields && (channel === 'form' || channel === 'submit' || channel === 'browser')) {
          const sub = o.replica.receive(fields, 'agent');
          return {
            status: sub.reference ? 'done' : 'failed',
            ...(sub.reference ? { referenceId: sub.reference } : {}),
            parentSummary: sub.reference ? `Submitted. Confirmation ${sub.reference}.` : 'The form did not accept it (it needs your signature).',
            action: { channel: 'WEB', direction: 'outbound', content: `replica ${sub.formId}: ${Object.keys(fields).length} fields`, status: sub.reference ? 'confirmed' : 'rejected' },
            ...(sub.reference ? {} : { note: 'replica rejected the submission' }),
          };
        }
        return real.execute(step, ctx);
      },
    };
  }
}

let cachedBuild: string | undefined;
/** The short commit hash, with "-dirty" when the tree has changes. */
export function gitBuild(): string {
  if (cachedBuild) return cachedBuild;
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    cachedBuild = dirty ? `${sha}-dirty` : sha;
  } catch {
    cachedBuild = 'unknown';
  }
  return cachedBuild;
}
