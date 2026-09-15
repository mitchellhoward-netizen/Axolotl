/**
 * Benny demo — the COVERAGE MAP (employer side).
 *
 * This is the fictional employer's benefits plan, modeled as data. It is the second of
 * the "two maps" (life map × coverage map). The runtime/trigger engine reads this to
 * answer "what does this person actually have, and what's unused/urgent?" — no provider
 * scraping, because in the two-sided model the employer supplies the plan.
 *
 * Every benefit is expressed with the same shape that makes proactive triage possible:
 * cadence (per-year / per-month / per-event), a cap (units or dollars), a deadline, and
 * the action it funds (book / claim / enroll / spend). FICTION ONLY — never connect a
 * real account.
 */

export type DependentRelation = 'self' | 'child' | 'spouse';

export interface Dependent {
  id: string;
  name: string;
  relation: DependentRelation;
  age?: number;
}

export interface PreventiveBenefit {
  kind: 'preventive';
  label: string;          // "Annual physical"
  covered: boolean;
  costShare: string;      // "$0 in-network"
  networkId: string;
}

export interface ReimbursementBenefit {
  kind: 'reimbursement';
  label: string;          // "FSA"
  balanceCents: number;
  /** Hard plan-year deadline — use it or lose it. ISO date. */
  deadline: string;
  eligibleCategories: string[]; // 'vision' | 'therapy' | 'orthodontia' | 'wellness-books' | ...
}

export interface WellnessBenefit {
  kind: 'wellness';
  label: string;          // "Wellness stipend (books)"
  unitsPerMonth: number;  // e.g. 2
  unitLabel: string;      // "book"
  unitMaxCents: number;   // max reimbursable per unit
  usedThisMonth: number;
  /** Day of month the allowance resets. */
  resetDay: number;
}

export interface EapBenefit {
  kind: 'eap';
  label: string;          // "Employee Assistance Program"
  sessionsPerYear: number;
  remainingSessions: number;
}

export interface CoverageCatalog {
  employer: string;
  planName: string;
  member: { id: string; name: string };
  dependents: Dependent[];
  network: { id: string; name: string };
  benefits: {
    preventive: PreventiveBenefit;
    fsa: ReimbursementBenefit;
    wellness: WellnessBenefit;
    eap: EapBenefit;
  };
}

/**
 * The demo plan. Deliberately shaped so all three demo beats fire from real (fictional)
 * data, not hardcoded copy: a dependent flagged for a physical, an FSA nearing its
 * deadline with a balance, and a two-books-a-month wellness stipend that's unused.
 */
export const demoCatalog: CoverageCatalog = {
  employer: 'Demo Robotics, Inc.',
  planName: 'Demo Choice PPO',
  member: { id: 'member-maya', name: 'Maya' },
  dependents: [
    { id: 'dep-leo', name: 'Leo', relation: 'child', age: 5 },
    { id: 'dep-self', name: 'Maya', relation: 'self', age: 37 },
  ],
  network: { id: 'bright-net', name: 'Bright Network' },
  benefits: {
    preventive: {
      kind: 'preventive',
      label: 'Annual physical',
      covered: true,
      costShare: '$0 in-network',
      networkId: 'bright-net',
    },
    fsa: {
      kind: 'reimbursement',
      label: 'FSA',
      balanceCents: 184_000, // $1,840.00
      deadline: '2026-12-31',
      eligibleCategories: ['vision', 'therapy', 'orthodontia', 'dental'],
    },
    wellness: {
      kind: 'wellness',
      label: 'Books stipend',
      unitsPerMonth: 2,
      unitLabel: 'book',
      unitMaxCents: 3_500, // up to $35 each
      usedThisMonth: 0,
      resetDay: 1,
    },
    eap: {
      kind: 'eap',
      label: 'Employee Assistance Program',
      sessionsPerYear: 8,
      remainingSessions: 8,
    },
  },
};

export function dollar(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}
