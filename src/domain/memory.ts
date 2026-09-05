import type { FamilyProfile, CaseRecord } from './types.js';

export type InitiativeStatus = 'active' | 'paused' | 'done';

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
