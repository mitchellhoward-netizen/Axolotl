import { createHash } from 'node:crypto';
import { JEV_MODEL, JEV_URL, type JevResponse } from './intent/jev.js';

/**
 * The only place the agent asks Jev a question (AGENT-PLAN Phase 2).
 *
 * A decision is a typed Choice question with literal criteria. Jev answers with calibrated
 * probabilities; we turn that into what to do: `act` above the decision's threshold, `ask` the
 * parent between the two thresholds, `handoff` to a person below the lower one. Any failure
 * (no key, timeout, an error status, an answer outside the choices) is `unsure` and never `act`:
 * a decision that could not be made is a reason to ask, not to go ahead.
 *
 * On the yes gate the proposal digest (steps/approval.ts) is the primary guard: nothing runs
 * that the parent wasn't shown. Within that, Jev reads how they answered, so a parent can say
 * yes the way they would to a person.
 */

export type DecisionType = 'yes_to_exact_values' | 'field_sourced' | 'page_matches_step';

export interface Thresholds {
  /** At or above: act on the answer. */
  act: number;
  /** Below this: hand the decision to a person instead of asking the parent again. */
  handoff: number;
  /** Where Jev is a veto on a decision code already made: block when it says no this surely. */
  veto?: number;
}

/** Per-decision thresholds. Override with DECIDE_THRESHOLDS='{"yes_to_exact_values":{"act":0.99}}'. */
export const DEFAULT_THRESHOLDS: Record<DecisionType, Thresholds> = {
  // act 0.98: a reply we don't recognise runs only when Jev is this sure it is a yes. veto 0.90:
  // stops a phrase we do recognise only when Jev is this sure it isn't. Measured on jev-1.13.0
  // (scripts/calibrate-yes.ts, docs/RELIABILITY.md). Good for now, not final (Mitch, 2026-10-16).
  yes_to_exact_values: { act: 0.98, handoff: 0.3, veto: 0.9 },
  field_sourced: { act: 0.97, handoff: 0.3 },
  page_matches_step: { act: 0.95, handoff: 0.3 },
};

export function thresholdsFor(type: DecisionType, env: NodeJS.ProcessEnv = process.env): Thresholds {
  let override: Partial<Thresholds> = {};
  try {
    const all = env.DECIDE_THRESHOLDS ? (JSON.parse(env.DECIDE_THRESHOLDS) as Record<string, Partial<Thresholds>>) : {};
    override = all[type] ?? {};
  } catch {
    // A malformed override keeps the defaults rather than loosening anything.
  }
  return { ...DEFAULT_THRESHOLDS[type], ...override };
}

export interface Question<C extends string = string> {
  /** Only what the question needs. Never the family record. */
  state: Record<string, string>;
  instructions: string;
  criteria: Record<C, string>;
}

export interface Decision<C extends string = string> {
  type: DecisionType;
  /** The chosen option, or `unsure` when Jev could not be asked or answered outside the set. */
  answer: C | 'unsure';
  confidence: number;
  probabilities: Record<string, number>;
  /** What to do with it: act on `answer`, ask the parent, or hand to a person. */
  verdict: 'act' | 'ask' | 'handoff';
  model?: string;
  inputTokens: number;
  ms: number;
  error?: string;
}

export interface DecideOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Where each decision is recorded for calibration. Defaults to one JSON log line. */
  record?: (entry: DecisionLog) => void;
}

/** What is kept per decision: the inputs only as a digest (the values stay out of logs). */
export interface DecisionLog {
  at: string;
  type: DecisionType;
  inputDigest: string;
  answer: string;
  confidence: number;
  verdict: Decision['verdict'];
  model?: string;
  ms: number;
  error?: string;
}

/** Jev is in use when a key is configured, or when JEV_ENABLED=true (a proxy adds the key). */
export function jevEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.JEV_ENABLED === 'false') return false;
  return Boolean(env.TYPESAFE_API_KEY) || env.JEV_ENABLED === 'true';
}

export async function decide<C extends string>(type: DecisionType, q: Question<C>, opts: DecideOptions = {}): Promise<Decision<C>> {
  const env = opts.env ?? process.env;
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  const t = thresholdsFor(type, env);
  const unsure = (error: string, extra: Partial<Decision<C>> = {}): Decision<C> => ({
    type,
    answer: 'unsure',
    confidence: 0,
    probabilities: {},
    verdict: 'ask',
    inputTokens: 0,
    ms: ms(),
    error,
    ...extra,
  });

  let decision: Decision<C>;
  if (!jevEnabled(env)) {
    decision = unsure('jev not configured');
  } else {
    try {
      const key = env.TYPESAFE_API_KEY;
      const res = await (opts.fetch ?? fetch)(env.JEV_URL || JEV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: env.JEV_MODEL || JEV_MODEL,
          state: q.state,
          questions: { decision: { type: 'choice', instructions: q.instructions, criteria: q.criteria } },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? Number(env.DECIDE_TIMEOUT_MS ?? 3000)),
      });
      if (!res.ok) {
        // Status only: an error body may echo the inputs back.
        decision = unsure(`typesafe ${res.status}`);
      } else {
        const data = (await res.json()) as JevResponse;
        const a = data.answers?.decision;
        if (!a || !(a.choice in q.criteria)) {
          decision = unsure('answer outside the choices', { model: data.model, inputTokens: data.usage?.input_tokens ?? 0 });
        } else {
          const confidence = a.confidence ?? 0;
          decision = {
            type,
            answer: a.choice as C,
            confidence,
            probabilities: a.probabilities ?? {},
            verdict: confidence >= t.act ? 'act' : confidence < t.handoff ? 'handoff' : 'ask',
            model: data.model,
            inputTokens: data.usage?.input_tokens ?? 0,
            ms: ms(),
          };
        }
      }
    } catch (e) {
      decision = unsure((e as Error)?.name ?? 'error');
    }
  }

  const entry: DecisionLog = {
    at: new Date().toISOString(),
    type,
    inputDigest: createHash('sha256').update(JSON.stringify(q.state)).digest('hex').slice(0, 16),
    answer: decision.answer,
    confidence: decision.confidence,
    verdict: decision.verdict,
    model: decision.model,
    ms: decision.ms,
    error: decision.error,
  };
  (opts.record ?? ((e) => console.log(`[decide] ${JSON.stringify(e)}`)))(entry);
  return decision;
}

/** The YES check: is this reply a clear approval of what we asked? Sends the reply and a
 * one-line description of the request (no values, no names), nothing else. */
export function yesQuestion(asked: string, reply: string): Question<'approve' | 'not_approve'> {
  return {
    state: { what_we_asked: asked, parent_reply: reply },
    instructions:
      'We asked the parent to approve exactly the action in `what_we_asked`. Is `parent_reply` a clear approval of that action, as it stands?',
    criteria: {
      approve: 'The reply clearly approves the action as it stands, with no change, question, hesitation or other topic.',
      not_approve:
        'Anything else: a refusal, a change, a question, hesitation, thanks or small talk, a reply to something else, or unclear.',
    },
  };
}

/** Jev as the approver (a free-form reply, no other check): act only when it is confident. */
export function approvesYes(d: Decision<'approve' | 'not_approve'>): boolean {
  return d.answer === 'approve' && d.verdict === 'act';
}

/** Leaning yes but not sure: worth one "want me to go ahead?" rather than dropping it. */
export function probablyYes(d: Decision<'approve' | 'not_approve'>): boolean {
  return d.answer === 'approve' && d.confidence >= 0.5 && !approvesYes(d);
}

/** Jev as the second check on a whole-message yes the gate already accepted ("yes", "dale"):
 * stop it only when Jev is sure it is not an approval. Jev being down or unsure doesn't block a
 * plain yes; the phrase and the proposal digest already make it clear. */
export function vetoesYes(d: Decision<'approve' | 'not_approve'>, env: NodeJS.ProcessEnv = process.env): boolean {
  return d.answer === 'not_approve' && d.confidence >= (thresholdsFor('yes_to_exact_values', env).veto ?? 0.9);
}
