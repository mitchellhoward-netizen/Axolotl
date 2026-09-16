/**
 * Benny demo — the scenes (deterministic actions).
 *
 * The router decides *what you mean*; a scene does *what happens*. Anything touching
 * money, a booking, or a message to the school runs fixed code here (never model
 * improvisation), so the demo is on-message and safe. Each scene sends its bubbles and
 * may return a `pending` approval gate for the director to wait on.
 */
import { demoCatalog } from './catalog.js';
import { brightConnector, northstarConnector, rampConnector, searchBooks, orderBook, searchTherapists, requestTherapist, type Therapist } from './connectors.js';
import { dollars, unused, type DemoState } from './state.js';
import type { PersonalFact } from '../domain/personal-context.js';
import type { ConnectorContext } from '../benefits/connectors.js';

export interface SceneCtx {
  send: (text: string) => Promise<void>;
  state: DemoState;
  ctx: ConnectorContext;
}
export interface Pending {
  label: string;
  onApprove: () => Promise<SceneResult>;
  onDecline?: () => Promise<void>;
  /** Optional free-text handling while pending (e.g. "the other one"). Return a result to
   * consume the message; return undefined to let the router handle it. */
  onText?: (text: string) => Promise<SceneResult | undefined>;
}
export interface SceneResult {
  pending?: Pending;
  /** Claim/expense refs to poll later and report as reimbursed. */
  followUp?: Array<{ via: 'northstar' | 'bright' | 'ramp'; ref: string }>;
}

const kid = () => demoCatalog.dependents.find((d) => d.id === 'dep-leo')!;
const fact = (subject: string, category: PersonalFact['category'], statement: string): PersonalFact => ({
  id: subject, subject, category, statement,
  source: { kind: 'person_report', messageId: 'demo', observedAt: new Date().toISOString() },
});

// ── triage — what came in (the proactive opening) ────────────────────────────
export async function triage(sc: SceneCtx): Promise<SceneResult> {
  sc.state.triaged = true;
  await sc.send(
    `3 school emails came in today. One needs you: the school requires a physical for ${kid().name} before enrollment — your plan covers it ${demoCatalog.benefits.preventive.costShare}. The other two are FYI (picture day, book fair).`,
  );
  await sc.send(`Want me to handle the physical?`);
  return { pending: { label: 'the physical', onApprove: () => physical(sc) } };
}

// ── audit — "am I using my benefits correctly?" ──────────────────────────────
export async function audit(sc: SceneCtx): Promise<SceneResult> {
  const items = unused(sc.state);
  if (!items.length) {
    await sc.send(`You're using everything — nothing unused or expiring right now. Nice.`);
    return {};
  }
  await sc.send(
    `Good question — I checked your plan. ${items.length} ${items.length === 1 ? 'thing is' : 'things are'} going unused:\n` +
      items.map((i) => `• ${i.label} — ${i.detail}`).join('\n'),
  );
  const top = items[0]!;
  const offer: Record<string, { text: string; run: () => Promise<SceneResult> }> = {
    FSA: { text: `The one I'd act on is the FSA — that's money you'd lose. Want me to file the receipt?`, run: () => fsa(sc) },
    Books: { text: `The easiest win is your books — want your two this month?`, run: () => books(sc) },
    EAP: { text: `Your EAP is free and confidential — want me to find an in-network therapist?`, run: () => eap(sc) },
    Preventive: { text: `Want me to book the physical + dental? They're $0 in-network.`, run: () => physical(sc) },
  };
  const o = offer[top.label] ?? { text: `Want me to take care of ${top.label}?`, run: () => physical(sc) };
  await sc.send(o.text);
  return { pending: { label: top.label, onApprove: o.run } };
}

// ── physical — in-network booking ────────────────────────────────────────────
export async function physical(sc: SceneCtx): Promise<SceneResult> {
  const prep = await brightConnector.prepare(sc.ctx, {
    workflow: 'appointment', request: 'annual physical for Leo',
    contextFacts: [fact('dependent', 'family', 'Leo'), fact('dependentId', 'family', 'dep-leo'), fact('specialty', 'health', 'pediatrics')],
    documents: [],
  });
  if (!('action' in prep)) {
    await sc.send(`I couldn't find an in-network option right now — want me to widen the search?`);
    return {};
  }
  const action = prep.action;
  await sc.send(`${action.summary} ${action.disclosures[0]} Reply YES to book.`);
  return {
    pending: {
      label: 'the appointment',
      onApprove: async () => {
        const sub = await brightConnector.submit(sc.ctx, action, `bright:${action.resourceKey}`);
        const providerName = action.summary.split(',')[0]?.trim() || 'the provider';
        sc.state.booking = { providerName, when: (action.payload as { when?: string }).when ?? '', ref: sub.reference };
        sc.state.preventiveBooked = true;
        await sc.send(`✅ ${sub.detail} I'll remind you the day before and send what to bring.`);
        return { followUp: [{ via: 'bright', ref: sub.reference }] };
      },
      onDecline: async () => { await sc.send(`No problem — I'll leave it for now.`); },
    },
  };
}

// ── fsa — use-it-or-lose-it reimbursement ────────────────────────────────────
export async function fsa(sc: SceneCtx): Promise<SceneResult> {
  const receipt = sc.state.unclaimed[0];
  if (!receipt) {
    await sc.send(`Nothing left to file — your receipts are all claimed.`);
    return {};
  }
  const claim = `${receipt.category}|${receipt.amountCents}|${receipt.description}`;
  const prep = await northstarConnector.prepare(sc.ctx, {
    workflow: 'reimbursement', request: 'file FSA claim',
    contextFacts: [fact('claim', 'coverage', claim)], documents: [],
  });
  if (!('action' in prep)) {
    await sc.send(`I couldn't prepare that claim — want me to try again?`);
    return {};
  }
  const action = prep.action;
  await sc.send(`I'll file ${receipt.description} — ${dollars(receipt.amountCents)} — against your FSA. Reply YES and I'll submit it.`);
  return {
    pending: {
      label: 'the FSA claim',
      onApprove: async () => {
        const sub = await northstarConnector.submit(sc.ctx, action, `northstar:${action.resourceKey}`);
        sc.state.filed.push({ category: receipt.category, amountCents: receipt.amountCents, description: receipt.description, ref: sub.reference, status: 'submitted' });
        sc.state.fsaRemainingCents = Math.max(0, sc.state.fsaRemainingCents - receipt.amountCents);
        sc.state.unclaimed.shift();
        await sc.send(`✅ Filed — ${dollars(receipt.amountCents)} · FSA · submitted (not paid yet). I'll ping you when it lands.`);
        return { followUp: [{ via: 'northstar', ref: sub.reference }] };
      },
      onDecline: async () => { await sc.send(`Okay — the deadline's still ${demoCatalog.benefits.fsa.deadline}, so we have time.`); },
    },
  };
}

// ── books — buy the book they actually want, then get reimbursed ────────────
export async function books(sc: SceneCtx, arg?: string): Promise<SceneResult> {
  const w = demoCatalog.benefits.wellness;
  const left = w.unitsPerMonth - sc.state.booksUsedThisMonth;
  if (left <= 0) {
    await sc.send(`You've already used your ${w.unitsPerMonth} ${w.unitLabel}s this month — they reset on the 1st.`);
    return {};
  }

  // A named book → find it and buy it. No title → ask for one (clear, not a menu).
  const query = (arg ?? '').trim();
  if (!query || query.length < 3) {
    await sc.send(`You've got ${left} book${left === 1 ? '' : 's'} a month on your ${w.label} — name one and I'll buy it and expense it.`);
    return {};
  }

  const results = await searchBooks(query).catch(() => []);
  if (!results.length) {
    await sc.send(`I couldn't find that one — try the title again?`);
    return {};
  }
  const book = results[0]!;
  const covered = book.priceCents <= w.unitMaxCents * left;
  const usedLabel = left === w.unitsPerMonth ? 'none used yet' : `${left} left this month`;
  await sc.send(`Found it — "${book.title}" by ${book.author}, ${book.format}, ${dollars(book.priceCents)}.\n${book.url}`);
  await sc.send(
    `Your ${w.label} covers it (${w.unitsPerMonth} a month, ${usedLabel})${covered ? '' : ' — partly'}. ` +
      `I'd ship it to your address on file: ${sc.state.shippingAddress}.\n` +
      `Reply YES and I'll buy it and file it with Ramp — or send a different address.`,
  );

  return {
    pending: {
      label: `"${book.title}"`,
      onApprove: async () => {
        const order = await orderBook(book.id, `book|${book.id}`);
        await sc.send(`✅ Ordered — "${order.title}", ${dollars(order.priceCents)}, arriving ${order.eta}. I'll send tracking when it ships.`);
        const prep = await rampConnector.prepare(sc.ctx, {
          workflow: 'reimbursement', request: 'file wellness book expense',
          contextFacts: [fact('expense', 'coverage', `Bookshop.org|${order.priceCents}|"${order.title}"`)], documents: [],
        });
        if (!('action' in prep)) { await sc.send(`I ordered it but couldn't file the expense — want me to try again?`); return {}; }
        const sub = await rampConnector.submit(sc.ctx, prep.action, `ramp:${prep.action.resourceKey}`);
        sc.state.booksUsedThisMonth += 1;
        sc.state.filed.push({ category: 'wellness-books', amountCents: order.priceCents, description: `"${order.title}"`, ref: sub.reference, status: 'submitted' });
        await sc.send(`✅ Filed with Ramp (${sub.reference}) — ${dollars(order.priceCents)} comes back to you as a wellness expense.`);
        return { followUp: [{ via: 'ramp', ref: sub.reference }] };
      },
      onDecline: async () => { await sc.send(`No problem — I'll leave it.`); },
    },
  };
}

// ── eap — real therapists from the plan's directory, with availability ───────
export async function eap(sc: SceneCtx): Promise<SceneResult> {
  const left = demoCatalog.benefits.eap.sessionsPerYear - sc.state.eapUsed;
  if (left <= 0) {
    await sc.send(`You've used all ${demoCatalog.benefits.eap.sessionsPerYear} EAP sessions this year — they reset in January.`);
    return {};
  }
  const all = await searchTherapists(demoCatalog.network.id).catch(() => [] as Therapist[]);
  const inNet = all.filter((t) => t.inNetwork);
  if (!inNet.length) {
    await sc.send(`I couldn't reach your plan's therapist directory just now — want me to try again?`);
    return {};
  }
  const picks = inNet.slice(0, 2);
  await sc.send(`Your EAP covers ${left} free, confidential sessions a year — none used. I found ${picks.length} in-network therapists with evening openings:`);
  await sc.send(picks.map((t) => `• ${t.name}, ${t.credentials} — ${t.focus} · ${t.nextSlots.join(', ')}${t.telehealth ? ' · telehealth' : ''}`).join('\n'));

  const request = async (t: Therapist, when: string): Promise<SceneResult> => {
    const r = await requestTherapist(t.id, when, `eap|${t.id}|${when}`);
    sc.state.eapUsed += 1;
    sc.state.eapRequest = { therapistName: r.therapistName, when: r.when };
    await sc.send(`✅ Requested — ${r.when} with ${r.therapistName} (free under your EAP). Nothing's charged, and I'll confirm as soon as they accept.`);
    return {};
  };

  const first = picks[0]!;
  const second = picks[1];
  await sc.send(`Want me to request ${first.nextSlots[0]} with ${first.name}${second ? `, or ${second.nextSlots[0]} with ${second.name}` : ''}?`);
  return {
    pending: {
      label: `${first.name} (EAP)`,
      onApprove: () => request(first, first.nextSlots[0]!),
      onDecline: async () => { await sc.send(`No problem — your EAP is there whenever you want it.`); },
      onText: async (text) => {
        if (!second) return undefined;
        const t = text.toLowerCase();
        const otherName = second.name.toLowerCase().split(' ')[0]!;
        if (t.includes(otherName) || /\b(other|second|2nd|latter)\b/.test(t)) return request(second, second.nextSlots[0]!);
        return undefined;
      },
    },
  };
}

// ── absence — pure life, no benefit ──────────────────────────────────────────
export async function absence(sc: SceneCtx): Promise<SceneResult> {
  if (sc.state.absenceSent) { await sc.send(`Already sent that one to the school.`); return {}; }
  await sc.send(`On it — no benefit needed for this one. I drafted the note: "Leo will be absent Tuesday. We'll pick up any missed work." Reply SEND.`);
  return {
    pending: {
      label: 'the school note',
      onApprove: async () => {
        sc.state.absenceSent = true;
        await sc.send(`✅ Sent to the school. Done — nothing slips.`);
        return {};
      },
      onDecline: async () => { await sc.send(`Okay, I won't send it.`); },
    },
  };
}

// ── status — what's in flight (polls the ledger, so it's never stale) ────────
export async function status(sc: SceneCtx): Promise<SceneResult> {
  await refreshClaims(sc);
  const LABEL: Record<string, string> = { vision: 'glasses claim', 'wellness-books': 'books' };
  const done: string[] = [];
  const open: string[] = [];
  if (sc.state.booking) done.push(`physical booked (${sc.state.booking.providerName}, ${sc.state.booking.when})`);
  if (sc.state.eapRequest) done.push(`EAP session requested (${sc.state.eapRequest.therapistName}, ${sc.state.eapRequest.when})`);
  for (const f of sc.state.filed) done.push(`${LABEL[f.category] ?? f.category} ${f.status} (${dollars(f.amountCents)})`);
  if (sc.state.absenceSent) done.push('school note sent');
  const left = unused(sc.state);
  for (const u of left) open.push(`${u.label} — ${u.detail}`);
  await sc.send(
    (done.length ? `Done so far: ${done.join('; ')}.\n` : '') +
      (open.length ? `Still open:\n${open.map((o) => `• ${o}`).join('\n')}` : `Nothing left — you're all set.`),
  );
  return {};
}

/** Poll every filed claim/expense so state reflects the provider, not our last guess. */
export async function refreshClaims(sc: SceneCtx): Promise<void> {
  for (const f of sc.state.filed) {
    if (f.status === 'paid') continue;
    const via = f.ref.startsWith('EXP-') ? 'ramp' : 'northstar';
    const connector = via === 'ramp' ? rampConnector : northstarConnector;
    const r = await connector.lookup(sc.ctx, `${via}:${f.ref}`).catch(() => ({ kind: 'absent' as const }));
    if (r.kind === 'found' && r.outcome.state === 'completed') f.status = 'paid';
  }
}

export const SCENES = {
  triage, audit, physical, fsa, books, eap, absence, status,
} as const;
export type SceneId = keyof typeof SCENES;
