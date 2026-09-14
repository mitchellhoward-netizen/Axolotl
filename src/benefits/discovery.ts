import { randomUUID } from 'node:crypto';
import { LAB_START, type BenefitCase } from './model.js';
import { assess, proposalHash } from './policy.js';

export interface Receipt {
  sourceId: string;
  expenseId: string;
  personId: string;
  description: string;
  category: string;
  amountCents: number;
  serviceAt: string;
  itemized: boolean;
  reimbursed: boolean;
}
export interface Plan {
  id: string;
  version: string;
  workflow: 'fsa' | 'reimbursement';
  members: string[];
  categories: Record<string, boolean | null>;
  coverageStart: string;
  coverageEnd: string;
  deadline: string;
  balanceCents: number;
}
export interface DiscoverySources {
  observedAt: string;
  people: Array<{ id: string; name: string; authorized: boolean }>;
  plans: Plan[];
  receipts: Receipt[];
}
export interface Finding {
  expenseId: string;
  description: string;
  decision: 'actionable' | 'needs_information' | 'excluded' | 'in_progress' | 'closed';
  reason: string;
  caseId?: string;
}
export interface DiscoveryState {
  enabled: boolean;
  findings: Finding[];
  nudges: Array<{ caseId: string; at: string; text: string }>;
}

const glasses: Receipt = { sourceId: 'inbox-1', expenseId: 'inbox-glasses', personId: 'sam',
  description: 'Sam’s glasses receipt', category: 'vision', amountCents: 18435,
  serviceAt: '2026-08-21T19:00:00.000Z', itemized: true, reimbursed: false };
const plan: Plan = { id: 'fictional-fsa', version: '2026-v1', workflow: 'fsa', members: ['alex', 'sam'],
  categories: { vision: true, healthcare: true, hearing: null, dental: true },
  coverageStart: '2026-01-01T08:00:00.000Z', coverageEnd: '2027-01-01T07:59:59.999Z',
  deadline: '2026-09-19T06:59:59.999Z', balanceCents: 47500 };

/** Separate source records, not pre-labelled workflow scenarios. No network access. */
export const FICTIONAL_SOURCES: DiscoverySources = {
  observedAt: LAB_START,
  people: [{ id: 'alex', name: 'Alex (fictional adult)', authorized: true },
    { id: 'sam', name: 'Sam (fictional dependent)', authorized: true }],
  plans: [plan, { ...plan, id: 'fictional-dental-hra', workflow: 'reimbursement', categories: { dental: true } }],
  receipts: [glasses, { ...glasses, sourceId: 'forwarded-inbox-1' },
    { ...glasses, sourceId: 'inbox-2', expenseId: 'inbox-visit', description: 'Alex’s out-of-pocket visit', personId: 'alex', category: 'healthcare', amountCents: 7320 },
    { ...glasses, sourceId: 'inbox-3', expenseId: 'inbox-old', description: 'Glasses from before coverage', serviceAt: '2025-12-31T20:00:00.000Z' },
    { ...glasses, sourceId: 'inbox-4', expenseId: 'inbox-paid', description: 'An already reimbursed receipt', reimbursed: true },
    { ...glasses, sourceId: 'inbox-5', expenseId: 'inbox-hearing', description: 'Hearing expense with an unconfirmed rule', category: 'hearing', amountCents: 9700 },
    { ...glasses, sourceId: 'inbox-6', expenseId: 'inbox-large', description: 'Receipt above the remaining balance', amountCents: 50125 },
    { ...glasses, sourceId: 'inbox-7', expenseId: 'inbox-dental', description: 'Dental receipt with two possible plans', category: 'dental', amountCents: 8900 },
  ],
};

/** Decisions derive from joined sources and the SAME policy used before execution.
 * Ambiguous plans and conflicting receipts never produce an executable case. */
export function discover(sources: DiscoverySources, now: number): Array<{ finding: Finding; candidate?: BenefitCase }> {
  const groups = new Map<string, Receipt[]>();
  for (const r of sources.receipts) groups.set(r.expenseId, [...(groups.get(r.expenseId) ?? []), r]);
  return [...groups.values()].map(receipts => {
    const r = receipts[0]!;
    const finding: Finding = { expenseId: r.expenseId, description: r.description, decision: 'needs_information', reason: '' };
    const fingerprints = receipts.map(({ sourceId: _sourceId, ...content }) => proposalHash(content));
    if (new Set(fingerprints).size !== 1) {
      finding.reason = 'Copies of the same expense disagree. Reconcile source documents before taking action.';
      return { finding };
    }
    const person = sources.people.find(p => p.id === r.personId);
    const plans = sources.plans.filter(p => p.members.includes(r.personId) && Object.hasOwn(p.categories, r.category));
    if (!person || plans.length !== 1) {
      finding.reason = !person ? 'Expense identity is not linked to a verified fictional person.' :
        plans.length ? 'Multiple plans may cover this expense. Resolve coordination of benefits; do not claim it twice.' :
          'No matching enrollment and category evidence. Do not infer entitlement from a receipt.';
      return { finding };
    }
    const p = plans[0]!;
    const candidate: BenefitCase = {
      id: randomUUID(), scenarioId: `receipt:${r.expenseId}`, workflow: p.workflow, title: r.description,
      need: `Found a $${(r.amountCents / 100).toFixed(2)} fictional receipt. Check the plan and prepare a claim?`,
      person: person.name, status: 'opportunity', revision: 1, fault: 'none',
      facts: { covered: p.categories[r.category]!, enrolled: true, authorizedDependent: person.authorized,
        documentsComplete: r.itemized, serviceAt: r.serviceAt, coverageStart: p.coverageStart, coverageEnd: p.coverageEnd,
        deadline: p.deadline, balanceCents: p.balanceCents, amountCents: r.amountCents, expenseId: r.expenseId,
        alreadyReimbursed: r.reimbursed, slotAvailable: false, refillsRemaining: 0, existingRequest: false, connectionActive: true },
      evidence: [
        { id: `${p.id}:${p.version}`, title: `Fictional plan ${p.id} · ${p.version}`, source: 'fictional_plan', observedAt: sources.observedAt,
          detail: `${r.category}: ${String(p.categories[r.category])}; member ${r.personId}; coverage ${p.coverageStart} through ${p.coverageEnd}; filing cutoff ${p.deadline}; balance $${(p.balanceCents / 100).toFixed(2)}. Not universal FSA rules.` },
        { id: r.expenseId, title: 'Fictional inbox receipt', source: 'fictional_receipt', observedAt: sources.observedAt,
          detail: `${r.description}: $${(r.amountCents / 100).toFixed(2)}, service ${r.serviceAt}. Sources: ${receipts.map(r => r.sourceId).join(', ')}. Reimbursed: ${r.reimbursed}.` },
      ],
      nextAction: '', owner: 'You', attempts: 0, realizedCents: 0, events: [], createdAt: new Date(now).toISOString(),
    };
    const failure = assess(candidate, now);
    finding.decision = !failure ? 'actionable' : ['ineligible', 'expired'].includes(failure.status) ? 'excluded' : 'needs_information';
    finding.reason = failure?.reason ?? 'Receipt, enrollment and plan rule match. Approval is still required; no reimbursement is promised.';
    if (finding.decision === 'excluded') return { finding };
    candidate.status = failure?.status ?? 'opportunity';
    candidate.nextAction = finding.reason;
    candidate.events.push({ at: candidate.createdAt, type: 'source_matched', text: finding.reason });
    return { finding, candidate };
  });
}

/** At most an initial prompt and a final-day reminder, separated by 24 hours.
 * These are durable in-app previews, NEVER delivered messages. */
export function nudge(c: BenefitCase, now: number): void {
  if (!c.scenarioId.startsWith('receipt:') || !['opportunity', 'needs_information', 'awaiting_approval'].includes(c.status)) return;
  if (c.providerReference || c.attempts > 0) return; // A document request may follow a submission.
  if (now > Date.parse(c.facts.deadline)) {
    c.status = 'expired'; c.owner = 'Operator'; c.nextAction = 'Filing window closed. No new claim or reminder will be generated.';
    delete c.proposal; delete c.authorization;
    c.events.push({ at: new Date(now).toISOString(), type: 'discovery_expired', text: c.nextAction });
    return;
  }
  if (c.snoozedUntil && now < Date.parse(c.snoozedUntil)) return;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour < 8 || hour >= 22) return;
  const previous = c.events.filter(e => e.type === 'opportunity_nudge' || e.type === 'deadline_nudge');
  if (previous.length && (previous.length >= 2 || now - Date.parse(previous.at(-1)!.at) < 86400000 || Date.parse(c.facts.deadline) - now > 86400000)) return;
  const deadline = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(c.facts.deadline));
  c.events.push({ at: new Date(now).toISOString(), type: previous.length ? 'deadline_nudge' : 'opportunity_nudge',
    text: `${previous.length ? 'Final-day reminder' : 'Possible benefit'}: ${c.title}. Filing cutoff ${deadline} Pacific. ${c.status === 'needs_information' ? c.nextAction : 'Shall I check eligibility and prepare the claim for your review?'} No claim sent.` });
}
