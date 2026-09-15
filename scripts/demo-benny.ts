#!/usr/bin/env tsx
/**
 * Benny demo — the four beats, end-to-end, as an iMessage-style transcript.
 *
 * Starts the fictional institutions, seeds the life signals (school inbox), runs the
 * trigger engine, and drives the real connectors through prepare → approve → submit →
 * follow-through. The connectors hit real HTTP endpoints, so the loop — not just the
 * copy — is real; and the follow-through beats poll the ledger so "submitted → paid"
 * actually happens on screen.
 *
 *   npm run demo:benny
 */
import { startDemoServer } from '../src/demo/server.js';
import { randomBytes } from 'node:crypto';
import { demoCatalog } from '../src/demo/catalog.js';
import { findTriggers, type InboxSignal } from '../src/demo/triggers.js';
import { brightConnector, northstarConnector } from '../src/demo/connectors.js';
import type { PersonalFact } from '../src/domain/personal-context.js';
import type { ConnectorContext, Outcome } from '../src/benefits/connectors.js';

const server = await startDemoServer();
const now = new Date('2026-12-01T12:00:00Z');

const inbox: InboxSignal[] = [
  { id: 'm-1', subject: 'Physical required before enrollment', actionType: 'health_requirement', dependentId: 'dep-leo' },
  { id: 'm-2', subject: 'Leo will be out Tuesday', actionType: 'absence', dependentId: 'dep-leo' },
];

const triggers = findTriggers(demoCatalog, now, inbox);
if (!triggers.some((t) => t.kind === 'dependent-physical')) throw new Error('demo: physical trigger missing (check the inbox seed + catalog)');

const ctx: ConnectorContext = { owner: 'member-maya', credential: 'demo-credential', signal: new AbortController().signal };
const fact = (subject: string, category: PersonalFact['category'], statement: string): PersonalFact => ({
  id: subject, subject, category, statement,
  source: { kind: 'person_report', messageId: 'demo', observedAt: now.toISOString() },
});
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const transcript: Array<{ from: 'benny' | 'you'; text: string }> = [];
const benny = (t: string) => transcript.push({ from: 'benny', text: t });
const you = (t: string) => transcript.push({ from: 'you', text: t });

const nextCode = () => randomBytes(3).toString('hex').toUpperCase();
/** Submitted work, polled back at the end so "submitted → paid" is real. */
const followThrough: Array<{ via: 'northstar' | 'bright'; ref: string }> = [];

// ── Beat 1 — the physical (life → coverage → book) ───────────────────────────
{
  const kid = demoCatalog.dependents.find((d) => d.id === 'dep-leo')!;
  benny(`Good morning, Maya. A few things came in. First, the school emailed: ${kid.name} needs a physical before enrollment. Your plan covers it ${demoCatalog.benefits.preventive.costShare}.`);
  const prep = await brightConnector.prepare(ctx, {
    workflow: 'appointment', request: 'annual physical for Leo',
    contextFacts: [fact('dependent', 'family', 'Leo'), fact('dependentId', 'family', 'dep-leo'), fact('specialty', 'health', 'pediatrics')],
    documents: [],
  });
  if ('action' in prep) {
    const c = nextCode();
    benny(`${prep.action.summary} ${prep.action.disclosures[0]} Reply YES ${c} to book.`);
    you(`YES ${c}`);
    const sub = await brightConnector.submit(ctx, prep.action, `bright:${prep.action.resourceKey}`);
    followThrough.push({ via: 'bright', ref: sub.reference });
    benny(`${sub.detail} I'll remind you the day before and send what to bring.`);
  }
}

// ── Beat 2 — FSA use-it-or-lose-it ───────────────────────────────────────────
{
  const fsa = demoCatalog.benefits.fsa;
  benny(`Second: your FSA has ${dollars(fsa.balanceCents)} and the plan year ends ${fsa.deadline} — use it or lose it. I found an unreimbursed receipt: Leo's glasses, ${dollars(18435)}.`);
  const prep = await northstarConnector.prepare(ctx, {
    workflow: 'reimbursement', request: 'file FSA claim for glasses',
    contextFacts: [fact('claim', 'coverage', 'vision|18435|glasses receipt')],
    documents: [],
  });
  if ('action' in prep) {
    const c = nextCode();
    benny(`${prep.action.summary} Amount ${dollars(prep.action.amountCents)}. Reply YES ${c} to file it.`);
    you(`YES ${c}`);
    const sub = await northstarConnector.submit(ctx, prep.action, `northstar:${prep.action.resourceKey}`);
    followThrough.push({ via: 'northstar', ref: sub.reference });
    benny(`Filed — ${sub.detail}`);
  }
}

// ── Beat 3 — books (wellness stipend) ────────────────────────────────────────
{
  const w = demoCatalog.benefits.wellness;
  benny(`Third: your ${w.label} gives you ${w.unitsPerMonth} ${w.unitLabel}s a month, and you haven't used any yet. Want your two books? I'll expense them.`);
  const prep = await northstarConnector.prepare(ctx, {
    workflow: 'reimbursement', request: 'reimburse two books',
    contextFacts: [fact('claim', 'coverage', 'wellness-books|6400|two books')],
    documents: [],
  });
  if ('action' in prep) {
    const c = nextCode();
    benny(`Two books, ${dollars(prep.action.amountCents)}, on your stipend. Reply YES ${c} and they're yours.`);
    you(`YES ${c}`);
    const sub = await northstarConnector.submit(ctx, prep.action, `northstar:${prep.action.resourceKey}`);
    followThrough.push({ via: 'northstar', ref: sub.reference });
    benny(`Done — ${sub.detail}`);
  }
}

// ── Beat 4 — pure life (absence → tell the school) ───────────────────────────
{
  const kid = demoCatalog.dependents.find((d) => d.id === 'dep-leo')!;
  benny(`Last thing, no benefit attached — just life: ${kid.name} is out Tuesday. I drafted the note: "Leo will be absent Tuesday. We'll pick up any missed work." Reply SEND and I'll send it.`);
  you('SEND');
  benny(`Sent to the school. Done — nothing slips.`);
}

// ── Follow-through: poll the ledger so "submitted → paid" is real ────────────
benny('While I have you — let me confirm everything landed.');
await new Promise((r) => setTimeout(r, 2800));
for (const item of followThrough) {
  const connector = item.via === 'northstar' ? northstarConnector : brightConnector;
  const r = await connector.lookup(ctx, `${item.via}:${item.ref}`);
  if (r.kind === 'found') benny(r.outcome.detail);
}
benny(`That's the two maps working: your plan covered the physical, the FSA and books are paid, and the school note is out. Next time something changes — at school, in your plan, or in your family — I'll bring it to you before you have to ask.`);

// ── Print the transcript ─────────────────────────────────────────────────────
console.log('\n════════════════════════  Benny · iMessage  ════════════════════════════\n');
for (const m of transcript) {
  console.log(m.from === 'benny' ? 'Benny' : '        You');
  console.log(`${m.text}\n`);
}
console.log('════════════════════════════════════════════════════════════════════════\n');
console.log('fictional demo — no real accounts, providers, or money');

await server.close();
