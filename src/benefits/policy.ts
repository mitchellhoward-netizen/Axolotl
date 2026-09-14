import { createHash } from 'node:crypto';
import type { BenefitCase, Proposal, Status } from './model.js';

export function isClaim(c: BenefitCase): boolean { return c.workflow === 'fsa' || c.workflow === 'reimbursement'; }

/** Explicit fixture rules, not medical advice or a universal interpretation of FSA law. */
export function assess(c: BenefitCase, now: number): { status: Status; reason: string } | undefined {
  const f = c.facts;
  if (!f.connectionActive) return { status: 'blocked', reason: 'Reconnect before checking or sending anything.' };
  if (now > Date.parse(f.deadline)) return { status: 'expired', reason: 'The documented submission window has closed. Operator review required; nothing submitted.' };
  if (f.covered === null) return { status: 'needs_information', reason: 'Eligibility is unknown. Obtain authoritative plan evidence before preparing an action.' };
  if (!f.covered || !f.enrolled) return { status: 'ineligible', reason: 'The selected benefit is excluded or enrollment is inactive.' };
  if (!f.authorizedDependent) return { status: 'needs_information', reason: 'Authority to act for the dependent has not been established.' };
  if (!f.documentsComplete) return { status: 'needs_information', reason: 'Supporting documents are missing. No disclosure or submission authorized.' };
  const service = Date.parse(f.serviceAt);
  if (service < Date.parse(f.coverageStart) || service > Date.parse(f.coverageEnd)) {
    return { status: 'ineligible', reason: 'The expense/service date is outside coverage, even though the submission deadline may still be open.' };
  }
  if (isClaim(c)) {
    if (service > now) return { status: 'ineligible', reason: 'A future expense cannot be reimbursed by this fictional plan.' };
    if (f.alreadyReimbursed) return { status: 'ineligible', reason: 'This expense has already been reimbursed. Do not submit it again.' };
    if (f.amountCents > f.balanceCents) return { status: 'needs_information', reason: 'Insufficient benefit balance for the full claim. Do not silently reduce the amount.' };
  }
  if (c.workflow === 'appointment' && (!f.slotAvailable || !f.appointmentAt || Date.parse(f.appointmentAt) <= now)) {
    return { status: 'blocked', reason: 'The selected appointment is unavailable or in the past. A new time needs new approval.' };
  }
  return undefined;
}

export function proposalHash(p: unknown): string {
  // PostgreSQL jsonb reorders object keys; consent must survive a round trip.
  const canonical = JSON.stringify(p, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ?
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  return createHash('sha256').update(canonical).digest('hex');
}

export function contextHash(c: BenefitCase): string {
  return proposalHash({ facts: c.facts, evidence: c.evidence });
}

export function prepareProposal(c: BenefitCase, now: number): Proposal {
  const operation: Proposal['operation'] = isClaim(c) ? 'submit_claim' :
    c.workflow === 'appointment' ? 'book_appointment' : c.workflow === 'dependent' ? 'enroll_dependent' :
      c.facts.refillsRemaining === 0 ? 'request_renewal' : 'request_refill';
  const destination = isClaim(c) ? 'Simulated benefits administrator' : c.workflow === 'appointment' ?
    'Simulated pediatric clinic · Dr. Rivera' : c.workflow === 'dependent' ? 'Simulated health plan · Family PPO' :
      operation === 'request_renewal' ? 'Simulated prescriber renewal desk' : 'Simulated pharmacy (not CVS)';
  const disclosures = isClaim(c) ? ['Fictional member/dependent identity', 'Itemized receipt, service date and claim amount'] :
    c.workflow === 'appointment' ? ['Fictional child identity and guardian authority', 'Routine visit request, coverage and chosen time'] :
      c.workflow === 'dependent' ? ['Fictional dependent identity and relationship', 'Qualifying-event document and selected plan'] :
        ['Fictional patient identity', 'Existing prescription reference only; no treatment changes'];
  const p: Omit<Proposal, 'hash'> = {
    revision: c.revision, contextHash: contextHash(c), operation, destination, subject: c.person, amountCents: c.facts.amountCents,
    disclosures, deadline: c.facts.deadline,
    ...(c.facts.appointmentAt ? { appointmentAt: c.facts.appointmentAt } : {}),
    expiresAt: new Date(Math.min(now + 86400000, Date.parse(c.facts.deadline) + 1)).toISOString(),
    summary: `${operation.replaceAll('_', ' ')} for ${c.person}${isClaim(c) ? `: $${(c.facts.amountCents / 100).toFixed(2)}` : ''}. ${c.providerReference ? `Update existing request ${c.providerReference}; do not create a duplicate.` : 'No external action until this exact proposal is approved.'}`,
  };
  return { ...p, hash: proposalHash(p) };
}
