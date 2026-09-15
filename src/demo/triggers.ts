/**
 * Benny demo — the TRIGGER ENGINE ("it notices").
 *
 * Pure function over the coverage catalog + a stream of life signals (triaged inbox
 * items) + the clock. It emits the structured "gaps" that Benny proactively surfaces —
 * unused/expiring benefits and life events that just became urgent — before the person
 * has to ask. This is the "reason to text" machine, and the thing that makes the demo
 * feel like Benny is one step ahead.
 *
 * Pure + deterministic (no IO) so it's unit-testable.
 */

import type { CoverageCatalog } from './catalog.js';

/** A triaged school/provider inbox item. `actionType` is a superset of the email-triage
 * enum plus 'health_requirement'. */
export interface InboxSignal {
  id: string;
  subject: string;
  actionType: string;
  dependentId?: string;
}

export type Trigger =
  | { kind: 'dependent-physical'; dependentId: string; dependentName: string; sourceId: string; reason: string }
  | { kind: 'fsa-expiring'; amountCents: number; daysLeft: number; reason: string }
  | { kind: 'wellness-unused'; unitsLeft: number; unitLabel: string; unitMaxCents: number; reason: string }
  | { kind: 'eap-unused'; sessionsLeft: number; reason: string };

export function daysUntil(isoDate: string, now: Date): number {
  const end = new Date(`${isoDate}T00:00:00Z`).getTime();
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

/** Days-remaining window in which an expiring FSA balance becomes urgent. */
const FSA_URGENT_DAYS = 45;

export function findTriggers(cat: CoverageCatalog, now: Date, signals: InboxSignal[] = []): Trigger[] {
  const out: Trigger[] = [];

  // 1. Life signal → dependent preventive care (e.g. school requires a physical).
  for (const s of signals) {
    if (s.actionType !== 'health_requirement' || !s.dependentId) continue;
    const dep = cat.dependents.find((d) => d.id === s.dependentId);
    if (dep && cat.benefits.preventive.covered) {
      out.push({
        kind: 'dependent-physical',
        dependentId: dep.id,
        dependentName: dep.name,
        sourceId: s.id,
        reason: `${dep.name} needs a physical before enrolling, and your plan covers it 100% in-network.`,
      });
    }
  }

  // 2. FSA use-it-or-lose-it: a balance and a hard deadline closing in.
  const fsa = cat.benefits.fsa;
  if (fsa.balanceCents > 0) {
    const days = daysUntil(fsa.deadline, now);
    if (days > 0 && days <= FSA_URGENT_DAYS) {
      out.push({
        kind: 'fsa-expiring',
        amountCents: fsa.balanceCents,
        daysLeft: days,
        reason: `Your ${fsa.label} still has a balance and its deadline is ${days} days away — use it or lose it.`,
      });
    }
  }

  // 3. Wellness stipend unused this period (the "two books a month" beat).
  const w = cat.benefits.wellness;
  const unitsLeft = w.unitsPerMonth - w.usedThisMonth;
  if (unitsLeft > 0) {
    out.push({
      kind: 'wellness-unused',
      unitsLeft,
      unitLabel: w.unitLabel,
      unitMaxCents: w.unitMaxCents,
      reason: `You get ${w.unitsPerMonth} ${w.unitLabel}${w.unitsPerMonth === 1 ? '' : 's'} a month from your ${w.label}, and you haven't used ${unitsLeft === 1 ? 'yours' : 'any'} yet.`,
    });
  }

  // 4. EAP: free confidential sessions, almost never used.
  const eap = cat.benefits.eap;
  if (eap.remainingSessions > 0) {
    out.push({
      kind: 'eap-unused',
      sessionsLeft: eap.remainingSessions,
      reason: `Your ${eap.label} includes ${eap.remainingSessions} free, confidential sessions you haven't used.`,
    });
  }

  return out;
}
