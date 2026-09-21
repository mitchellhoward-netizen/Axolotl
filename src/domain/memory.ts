import type { FamilyProfile, CaseRecord } from './types.js';
import type { PersonalFact } from './personal-context.js';

export type InitiativeStatus = 'active' | 'paused' | 'done';

/**
 * Two facts about the same subject that disagree, surfaced for a human to settle.
 *
 * The consolidation pass records these and **never picks a winner**: silently choosing one of
 * two contradictory statements about a child is exactly the failure a parent cannot see and
 * cannot correct. An explicit `supersedes` is a correction by the parent and is NOT a
 * contradiction — it is already handled at read time in `personalView`.
 */
export interface MemoryContradiction {
  subject: string;
  category: PersonalFact['category'];
  /** Every competing statement with where it came from. Deliberately no `chosen` field. */
  statements: Array<{ factId: string; statement: string; messageId: string; observedAt: string }>;
  flaggedAt: string;
}

/** A focus the advocate is actively working for the family. */
export interface Initiative {
  id: string;
  label: string;
  since: string;
  status: InitiativeStatus;
}

/**
 * The family's continuing memory graph — what they need, what they're ALREADY
 * getting, what we're actively working, and a running issue list. This is what
 * makes the advocate "smarter over time": every turn the agent retrieves this,
 * acts on the delta, and writes it back.
 */
export interface FamilyMemory {
  needs: string[];
  /** Things the family has already secured (free meals, a 504 plan, a bus pass). */
  getting: string[];
  initiatives: Initiative[];
  /** Quick summary of open/awaiting cases (issue tracking). */
  issueSummary: string[];
  notes?: string;
  /**
   * When the background consolidation pass last rewrote this row. Optional: rows written before
   * the pass existed simply lack it, and a reader must not assume consolidation has run.
   */
  consolidatedAt?: string;
  /**
   * Open disagreements between facts about the same subject, for a human to settle.
   *
   * Both fields above live INSIDE the existing `family_memory` row on purpose. A separate
   * derived table would need its own deletion path, and a derived table that `deleteFamilyData`
   * does not know about is a deletion bug waiting for a parent to exercise `/reset`. Keeping
   * derived state in this row means deletion coverage is inherited, not re-earned.
   */
  contradictions?: MemoryContradiction[];
}

/**
 * Derive the family's up-to-date memory from the persisted profile + cases.
 * `getting` = resolved/fully-secured things; `initiatives` = still-open cases.
 */
export function deriveFamilyMemory(profile?: FamilyProfile, cases: CaseRecord[] = []): FamilyMemory {
  const needs = profile?.needs ?? [];
  const open = cases.filter((c) => c.status !== 'resolved');
  const resolved = cases.filter((c) => c.status === 'resolved');

  const getting = new Set<string>(profile?.getting ?? []);
  for (const c of resolved) getting.add(`${c.kind}`);

  const initiatives: Initiative[] = open.map((c) => ({
    id: c.id,
    label: c.kind,
    since: c.createdAt,
    status: 'active' as const,
  }));

  return {
    needs,
    getting: [...getting],
    initiatives,
    issueSummary: open.map((c) => `${c.kind} — ${c.summary}`),
    notes: profile?.notes,
  };
}
