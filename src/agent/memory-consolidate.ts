import {
  type FamilyMemory,
  type Initiative,
  type MemoryContradiction,
} from '../domain/memory.js';
import type { PersonalFact } from '../domain/personal-context.js';

/**
 * The background consolidation pass (MEMORY-COMPARISON §4.2) — our version of Instinct's
 * ingestion.
 *
 * Today the *conversational* agent decides what to remember, mid-turn, which is how buckets
 * accumulate noise. This pass is out of band: it reads what is already stored and rewrites the
 * buckets to be coherent.
 *
 * ## The safety posture, which is the whole point
 *
 * `planConsolidation` is a **pure function**. It takes memory and returns the memory it would
 * write, plus a report. It performs no I/O, reads no clock it was not handed, stages no action,
 * writes no consent state, and marks nothing `completed`. Everything below is a rewrite of two
 * arrays inside one existing row.
 *
 * It also **cannot delete**. §5 of the comparison is explicit that forgetting must produce an
 * audit receipt, so this pass only ever *reports* superseded and expired facts — actual erasure
 * stays with `deleteFamilyData` and the retention sweep. And it **never picks a winner** between
 * two contradictory statements: silently choosing one of two things a parent said about their
 * child is a failure they cannot see and cannot correct, so contradictions are *flagged for a
 * human* and left alone.
 *
 * ## Scope, stated plainly
 *
 * The shipping product stores family memory in `family_memory`. Personal facts live in
 * `PersonalContext`, which belongs to the parked benefits runtime — so this pass accepts facts
 * as **read-only input** for contradiction detection but never writes them, and never reaches
 * into that module. Where no fact source is supplied the pass still does real work on the
 * shipping data (see `needs`/`getting` drift below).
 */

/** Case- and whitespace-insensitive key. Same normalization the writer uses. */
function keyOf(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ConsolidationReport {
  /** Duplicate `getting` entries collapsed into one. */
  gettingMerged: number;
  /** Duplicate initiative labels collapsed into one. */
  initiativesDeduped: number;
  /** Newly flagged disagreements, including the `needs`/`getting` drift below. */
  contradictionsFlagged: number;
  /** Reported, never deleted: facts another fact explicitly corrects. */
  supersededFacts: number;
  /** Reported, never deleted: facts whose `validUntil` has passed. */
  expiredFacts: number;
  /** Reported only: facts the parent has stated more than once (a signal, not a promotion). */
  repeatedFacts: number;
  /**
   * Whether the *content* changed. Deliberately excludes `consolidatedAt`, so a second run
   * over already-consolidated memory reports `false` and the pass is safe to run repeatedly.
   */
  changed: boolean;
}

export interface ConsolidationResult {
  /** What the memory row would look like after the pass. */
  memory: FamilyMemory;
  report: ConsolidationReport;
}

/** Deterministic ordering so a dry run and an apply agree, and tests are stable. */
function mergeGetting(getting: string[]): { getting: string[]; merged: number } {
  const seen = new Map<string, string>();
  for (const raw of getting) {
    const key = keyOf(raw);
    if (!key) continue; // an empty entry carries nothing; it is dropped from the rewrite
    if (!seen.has(key)) seen.set(key, String(raw).trim()); // first spelling wins, deterministically
  }
  return { getting: [...seen.values()], merged: getting.length - seen.size };
}

/**
 * Collapse initiatives with the same label.
 *
 * Two judgment calls, both in the cautious direction:
 *   - The most recently started instance survives, because it is the one the family last
 *     re-raised.
 *   - If ANY instance in the group is `active`, the survivor is `active`. A focus the family is
 *     waiting on must never be silently closed by a cleanup job; closing it is a human decision.
 */
function mergeInitiatives(initiatives: Initiative[]): { initiatives: Initiative[]; deduped: number } {
  const groups = new Map<string, Initiative[]>();
  for (const i of initiatives) {
    const key = keyOf(i.label);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const out: Initiative[] = [];
  for (const [, group] of groups) {
    const sorted = [...group].sort((a, b) => Date.parse(b.since) - Date.parse(a.since));
    const newest = sorted[0]!;
    const active = group.find((i) => i.status === 'active');
    out.push(active ? { ...newest, status: 'active' } : newest);
  }
  return { initiatives: out, deduped: initiatives.length - out.length };
}

function contradictionKey(c: MemoryContradiction): string {
  return `${keyOf(c.subject)}|${c.category}|${c.statements.map((s) => keyOf(s.statement)).sort().join('~')}`;
}

/**
 * Flag disagreements between facts about the same subject.
 *
 * An explicit `supersedes` is the parent correcting themselves; that is not a disagreement and
 * is excluded. Only genuinely competing statements are flagged, and the output carries no
 * "chosen" field — there is nowhere to put a winner.
 */
function factContradictions(facts: PersonalFact[], flaggedAt: string): MemoryContradiction[] {
  const superseded = new Set(facts.map((f) => f.supersedes).filter(Boolean));
  const live = facts.filter((f) => !superseded.has(f.id));
  const groups = new Map<string, PersonalFact[]>();
  for (const f of live) {
    const key = `${keyOf(f.subject)}|${f.category}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const out: MemoryContradiction[] = [];
  for (const [, group] of groups) {
    const distinct = new Set(group.map((f) => keyOf(f.statement)));
    if (distinct.size < 2) continue;
    out.push({
      subject: group[0]!.subject,
      category: group[0]!.category,
      statements: group.map((f) => ({
        factId: f.id,
        statement: f.statement,
        messageId: f.source.messageId,
        observedAt: f.source.observedAt,
      })),
      flaggedAt,
    });
  }
  return out;
}

/**
 * Drift between the two shipping buckets: the same thing listed as a *need* and as something
 * the family already *has*.
 *
 * `deriveFamilyMemory` builds `getting` from resolved cases while `needs` comes from the
 * profile, so this drift is expected over time. It is flagged as a question, not resolved —
 * a family can need *more* speech services after securing some, and `getting` can be stale.
 */
function needsGettingDrift(memory: FamilyMemory, flaggedAt: string): MemoryContradiction[] {
  const gettingKeys = new Set(memory.getting.map(keyOf));
  const out: MemoryContradiction[] = [];
  for (const need of memory.needs) {
    const key = keyOf(need);
    if (!key || !gettingKeys.has(key)) continue;
    out.push({
      subject: 'household',
      category: 'family',
      statements: [
        { factId: `need:${key}`, statement: `Recorded as a need: ${need}`, messageId: 'family_memory', observedAt: flaggedAt },
        { factId: `getting:${key}`, statement: `Recorded as already secured: ${need}`, messageId: 'family_memory', observedAt: flaggedAt },
      ],
      flaggedAt,
    });
  }
  return out;
}

/**
 * Plan the pass. Pure: same input, same output, no I/O and no clock of its own.
 *
 * `now` is passed in rather than read, so a dry run and a later apply can be compared, and so
 * tests do not depend on wall-clock time.
 */
export function planConsolidation(input: {
  memory?: FamilyMemory;
  /** Read-only. Facts are never mutated by this pass. */
  facts?: PersonalFact[];
  now: number;
}): ConsolidationResult {
  const now = input.now;
  const flaggedAt = new Date(now).toISOString();
  const memory = input.memory;

  const base: FamilyMemory = {
    needs: memory?.needs ?? [],
    getting: memory?.getting ?? [],
    initiatives: memory?.initiatives ?? [],
    issueSummary: memory?.issueSummary ?? [],
    notes: memory?.notes,
  };

  const { getting, merged } = mergeGetting(base.getting);
  const { initiatives, deduped } = mergeInitiatives(base.initiatives);

  const facts = input.facts ?? [];
  const newlyFlagged = [...factContradictions(facts, flaggedAt), ...needsGettingDrift({ ...base, getting }, flaggedAt)];

  // Carry forward what was flagged before, so a pass never makes a known disagreement
  // disappear just because its cause left the input set. Re-flagging the same pair is a no-op.
  const prior = memory?.contradictions ?? [];
  const priorKeys = new Set(prior.map(contradictionKey));
  const flagged = newlyFlagged.filter((c) => !priorKeys.has(contradictionKey(c))).length;

  const byKey = new Map<string, MemoryContradiction>();
  for (const c of [...prior, ...newlyFlagged]) {
    const key = contradictionKey(c);
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const contradictions = [...byKey.values()];

  const supersededFacts = facts.filter((f) => facts.some((o) => o.supersedes === f.id)).length;
  const expiredFacts = facts.filter((f) => f.validUntil && Date.parse(f.validUntil) <= now).length;

  // "Stated more than once" — a signal for a human, not an automatic promotion. Promotion would
  // require a field on the fact, and facts are not this pass's to write.
  const statementCounts = new Map<string, number>();
  for (const f of facts) {
    const key = `${keyOf(f.subject)}|${f.category}|${keyOf(f.statement)}`;
    statementCounts.set(key, (statementCounts.get(key) ?? 0) + 1);
  }
  const repeatedFacts = [...statementCounts.values()].filter((n) => n > 1).length;

  const changed =
    merged > 0 ||
    deduped > 0 ||
    flagged > 0 ||
    getting.length !== base.getting.length ||
    initiatives.length !== base.initiatives.length;

  return {
    memory: { ...base, getting, initiatives, contradictions, consolidatedAt: flaggedAt },
    report: { gettingMerged: merged, initiativesDeduped: deduped, contradictionsFlagged: flagged, supersededFacts, expiredFacts, repeatedFacts, changed },
  };
}
