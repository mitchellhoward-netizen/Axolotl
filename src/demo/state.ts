/**
 * Benny demo — session state.
 *
 * The demo's whole point is that Benny *holds both maps and remembers*. This tracks
 * what's actually happened this session (claims filed, appointment booked, note sent,
 * stipend used) so the audit ("am I using my benefits right?"), status ("what's left?"),
 * and the improv replies all reflect reality rather than a script.
 */
import { demoCatalog } from './catalog.js';

export interface Receipt { category: string; amountCents: number; description: string }
export interface FiledClaim { category: string; amountCents: number; description: string; ref: string; status: 'submitted' | 'paid' }
export interface Booking { providerName: string; when: string; ref: string }

export interface DemoState {
  /** FSA dollars still available (decrements as claims are filed). */
  fsaRemainingCents: number;
  /** Books used this month (increments against the stipend). */
  booksUsedThisMonth: number;
  /** EAP sessions used. */
  eapUsed: number;
  /** Whether a preventive visit has been booked/used this year. */
  preventiveBooked: boolean;
  /** Receipts found but not yet filed. */
  unclaimed: Receipt[];
  /** Claims filed this session. */
  filed: FiledClaim[];
  /** The appointment, once booked. */
  booking?: Booking;
  /** Whether the school absence note has gone out. */
  absenceSent: boolean;
  /** Where physical goods ship — defaults to the household address on file. */
  shippingAddress: string;
  /** The triage digest has been shown. */
  triaged: boolean;
}

export function initialState(): DemoState {
  return {
    fsaRemainingCents: demoCatalog.benefits.fsa.balanceCents,
    booksUsedThisMonth: demoCatalog.benefits.wellness.usedThisMonth,
    eapUsed: 0,
    preventiveBooked: false,
    // The one thing Benny "found" in the inbox/documents.
    unclaimed: [{ category: 'vision', amountCents: 18_435, description: "Leo's glasses receipt" }],
    filed: [],
    absenceSent: false,
    shippingAddress: demoCatalog.member.address,
    triaged: false,
  };
}

export const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface UnusedItem { label: string; detail: string; priority: number }
export function unused(state: DemoState): UnusedItem[] {
  const out: UnusedItem[] = [];
  const fsa = demoCatalog.benefits.fsa;
  if (state.fsaRemainingCents > 0) {
    const receipt = state.unclaimed[0];
    out.push({
      label: 'FSA',
      detail:
        `${dollars(state.fsaRemainingCents)} left, expires ${fsa.deadline}` +
        (receipt ? ` — and I found an unclaimed ${dollars(receipt.amountCents)} ${receipt.description}.` : '.'),
      priority: 1,
    });
  }
  const booksLeft = demoCatalog.benefits.wellness.unitsPerMonth - state.booksUsedThisMonth;
  if (booksLeft > 0) {
    out.push({ label: 'Books', detail: `${booksLeft} of ${demoCatalog.benefits.wellness.unitsPerMonth} left this month.`, priority: 2 });
  }
  const eapLeft = demoCatalog.benefits.eap.sessionsPerYear - state.eapUsed;
  if (eapLeft > 0) {
    out.push({ label: 'EAP', detail: `${eapLeft} free, confidential sessions, none used.`, priority: 3 });
  }
  if (!state.preventiveBooked) {
    out.push({
      label: 'Preventive',
      detail: `annual physical + dental, ${demoCatalog.benefits.preventive.costShare}, unused this year.`,
      priority: 4,
    });
  }
  return out.sort((a, b) => a.priority - b.priority);
}

/** A one-line state summary for the router/improv prompt so replies stay consistent. */
export function stateSummary(state: DemoState): string {
  const bits: string[] = [];
  bits.push(`FSA remaining: ${dollars(state.fsaRemainingCents)}`);
  if (state.booking) bits.push(`physical booked with ${state.booking.providerName} ${state.booking.when}`);
  for (const f of state.filed) bits.push(`${f.category} claim ${f.ref} ${f.status} (${dollars(f.amountCents)})`);
  if (state.absenceSent) bits.push('school absence note sent');
  const left = unused(state);
  bits.push(`unused: ${left.map((u) => u.label).join(', ') || 'nothing'}`);
  return bits.join('; ');
}
