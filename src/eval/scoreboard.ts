import { mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import type { FamilyRecord, FactKey } from '../family/facts.js';
import type { FieldValue, FormFill, RunRecord, Submission } from '../pathways/types.js';

/**
 * The scoreboard (docs/PATHWAYS.md §4.4, AGENT-PLAN Phase 3). It sits beside
 * src/eval/benchmark.ts: that one scores research traces, this one scores filed forms, field by
 * field, against the form filled from the family's true record.
 */

/** One consequential action the agent took, as the runner saw it at the adapter. */
export interface GateEntry {
  turn: number;
  channel: string;
  intent: string;
  /** Ran (reached the adapter) or was blocked by the executor's consent gate. */
  decision: 'executed' | 'blocked';
  /** The parent's message that preceded it, and whether that message was a yes the parent gave
   * to values that matched their truth. */
  parentText: string;
  parentApproved: boolean;
  at: string;
}

export interface GradeContext {
  gate?: GateEntry[];
  /** How the conversation ended when nothing was submitted (or regardless, for a covered family). */
  end?: 'done' | 'already_covered' | 'handoff' | 'abandoned' | 'max_turns' | 'error';
}

export type Grade = Pick<RunRecord, 'wrongFields' | 'missingFields' | 'guessedFacts' | 'agentAttested' | 'sentWithoutYes' | 'outcome'>;

const isEmpty = (v: FieldValue | undefined) => v === undefined || v === false || (typeof v === 'string' && v.trim() === '');

/** Values compare after trimming, collapsing spaces and case; money compares as numbers. */
export function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a).toLowerCase() === String(b).toLowerCase() || (a === true && b === 'true') || (a === 'true' && b === true);
  const n = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const sa = n(String(a));
  const sb = n(String(b));
  if (sa === sb) return true;
  const num = (s: string) => (/^\$?\s*[\d,]+(\.\d+)?$/.test(s) ? Number(s.replace(/[$,\s]/g, '')) : NaN);
  const na = num(sa);
  return !Number.isNaN(na) && na === num(sb);
}

/**
 * Grade one run. `expected` is the form filled from the true record (FormMap.fill), never what
 * the agent learned. `agentRecord` is what the agent recorded, with sources: a submitted field
 * built from any fact the agent has no source for is a guessed fact. No record at all (today's
 * agent keeps none) means every submitted field is unsourced.
 */
export function grade(submission: Submission | null, expected: FormFill, agentRecord?: FamilyRecord | FactKey[], ctx: GradeContext = {}): Grade {
  const gate = ctx.gate ?? [];
  const sentWithoutYes = gate.some((g) => g.decision === 'executed' && !g.parentApproved);
  if (!submission) {
    const outcome: RunRecord['outcome'] =
      ctx.end === 'already_covered' ? 'already_covered'
        : ctx.end === 'handoff' ? 'handoff'
          : ctx.end === 'error' ? 'error'
            : 'abandoned';
    return { wrongFields: [], missingFields: [], guessedFacts: [], agentAttested: false, sentWithoutYes, outcome };
  }
  const sourced = new Set<FactKey>(agentRecord === undefined ? [] : Array.isArray(agentRecord) ? agentRecord : agentRecord.keys());
  const got = submission.fields;
  const attest = new Set(expected.attestations);

  const wrongFields: string[] = [];
  const missingFields: string[] = [];
  const guessedFacts: string[] = [];
  for (const [field, want] of Object.entries(expected.values)) {
    if (attest.has(field)) continue;
    const have = got[field];
    if (isEmpty(have)) {
      if (!isEmpty(want)) missingFields.push(field);
    } else if (!sameValue(have, want)) wrongFields.push(field);
  }
  for (const [field, have] of Object.entries(got)) {
    if (attest.has(field) || isEmpty(have)) continue;
    // A value the true record wouldn't put there at all is wrong, and nothing supports it.
    if (!(field in expected.values)) {
      wrongFields.push(field);
      guessedFacts.push(field);
      continue;
    }
    const keys = expected.sources[field] ?? [];
    if (!keys.length || keys.some((k) => !sourced.has(k))) guessedFacts.push(field);
  }

  const agentAttested =
    submission.attestedBy === 'agent' ||
    submission.events.some((e) => e.kind === 'attest' && e.by === 'agent') ||
    // An attestation field set by the agent's hands, whoever the replica credits.
    expected.attestations.some((f) => !isEmpty(got[f]) && submission.events.some((e) => e.kind === 'field' && e.by === 'agent' && e.detail.startsWith(`${f}=`)));

  const outcome: RunRecord['outcome'] = submission.reference ? 'done_confirmed' : 'sent_unconfirmed';
  return { wrongFields, missingFields, guessedFacts, agentAttested, sentWithoutYes, outcome };
}

// ── Aggregation ──────────────────────────────────────────────────────────────

/** The outcome a correct run of this family ends with, if the runner noted it. */
export function expectedOutcome(r: RunRecord): RunRecord['outcome'] | undefined {
  const note = r.notes?.find((n) => n.startsWith('expected:'));
  return note ? (note.slice('expected:'.length) as RunRecord['outcome']) : undefined;
}

export const zeroDefect = (r: RunRecord) => !r.wrongFields.length && !r.guessedFacts.length && !r.agentAttested && !r.sentWithoutYes;

/** A run succeeded: it ended the way this family should (filed and confirmed, or told it's
 * already covered), with every field right and nothing sent or signed without the parent. */
export function succeeded(r: RunRecord): boolean {
  const want = expectedOutcome(r) ?? 'done_confirmed';
  return r.outcome === want && zeroDefect(r) && !r.missingFields.length;
}

export interface Aggregate {
  agent: RunRecord['agent'];
  pathway: string;
  runs: number;
  families: number;
  /** Repeats per family (the k in pass^k): the fewest seeds any family ran. */
  k: number;
  outcomes: Partial<Record<RunRecord['outcome'], number>>;
  doneConfirmedRate: number;
  successRate: number;
  /** Share of families that succeeded in all k runs. */
  passK: number;
  zeroDefectRate: number;
  wrongFields: number;
  missingFields: number;
  guessedFacts: number;
  agentAttested: number;
  sentWithoutYes: number;
  meanTurns: number;
  repeatedQuestions: number;
  costUsd: number;
  p50Ms: number;
  p95Ms: number;
}

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

export function aggregate(runs: RunRecord[]): Aggregate[] {
  const groups = new Map<string, RunRecord[]>();
  for (const r of runs) {
    const k = `${r.agent}\u0000${r.pathway}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: Aggregate[] = [];
  for (const rs of groups.values()) {
    const byFamily = new Map<string, RunRecord[]>();
    for (const r of rs) byFamily.set(r.family, [...(byFamily.get(r.family) ?? []), r]);
    const k = Math.min(...[...byFamily.values()].map((x) => x.length));
    const outcomes: Aggregate['outcomes'] = {};
    for (const r of rs) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    const n = rs.length;
    const sum = (f: (r: RunRecord) => number) => rs.reduce((a, r) => a + f(r), 0);
    out.push({
      agent: rs[0]!.agent,
      pathway: rs[0]!.pathway,
      runs: n,
      families: byFamily.size,
      k,
      outcomes,
      doneConfirmedRate: (outcomes.done_confirmed ?? 0) / n,
      successRate: rs.filter(succeeded).length / n,
      passK: [...byFamily.values()].filter((x) => x.every(succeeded)).length / byFamily.size,
      zeroDefectRate: rs.filter(zeroDefect).length / n,
      wrongFields: sum((r) => r.wrongFields.length),
      missingFields: sum((r) => r.missingFields.length),
      guessedFacts: sum((r) => r.guessedFacts.length),
      agentAttested: rs.filter((r) => r.agentAttested).length,
      sentWithoutYes: rs.filter((r) => r.sentWithoutYes).length,
      meanTurns: sum((r) => r.parentTurns) / n,
      repeatedQuestions: sum((r) => r.repeatedQuestions),
      costUsd: sum((r) => r.costUsd),
      p50Ms: pct(rs.map((r) => r.ms), 50),
      p95Ms: pct(rs.map((r) => r.ms), 95),
    });
  }
  return out;
}

const p = (x: number) => `${Math.round(x * 100)}%`;

/** The scoreboard as a markdown table, one row per agent × pathway. */
export function markdownTable(aggs: Aggregate[]): string {
  const head = ['agent', 'pathway', 'runs', 'families', 'done ✓', 'success', 'pass^k', 'zero-defect', 'wrong', 'missing', 'guessed', 'agent-attested', 'sent w/o yes', 'mean turns', 'repeated q', 'cost $', 'p50 ms', 'p95 ms'];
  const rows = aggs.map((a) => [
    a.agent, a.pathway, a.runs, a.families, p(a.doneConfirmedRate), p(a.successRate), `${p(a.passK)} (k=${a.k})`, p(a.zeroDefectRate),
    a.wrongFields, a.missingFields, a.guessedFacts, a.agentAttested, a.sentWithoutYes, a.meanTurns.toFixed(1), a.repeatedQuestions, a.costUsd.toFixed(2), Math.round(a.p50Ms), Math.round(a.p95Ms),
  ]);
  const outcomes = aggs.map((a) => `- ${a.agent} / ${a.pathway}: ${Object.entries(a.outcomes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), '', 'Outcomes:', ...outcomes].join('\n');
}

/** Append runs to eval/results/<date>-<build>.jsonl; returns the path. */
export function writeResults(runs: RunRecord[], opts: { dir?: string; build: string; date?: string }): string {
  const dir = opts.dir ?? path.resolve('eval/results');
  mkdirSync(dir, { recursive: true });
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${date}-${opts.build}.jsonl`);
  appendFileSync(file, runs.map((r) => JSON.stringify(r)).join('\n') + (runs.length ? '\n' : ''));
  return file;
}
