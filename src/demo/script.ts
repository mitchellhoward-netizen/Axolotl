/**
 * Benny demo — the scripted conversation, built from the REAL connectors so the same
 * turns drive both the console transcript and the live iMessage director.
 *
 * Each turn is a group of Benny bubbles followed by the person's expected reply (the
 * approval). The director pauses on `reply`; the console prints it. Follow-through is
 * resolved separately (it polls the ledger after a delay so "submitted → paid" is real).
 */
import { randomBytes } from 'node:crypto';
import { demoCatalog } from './catalog.js';
import { brightConnector, northstarConnector } from './connectors.js';
import type { PersonalFact } from '../domain/personal-context.js';
import type { ConnectorContext } from '../benefits/connectors.js';

export interface DemoTurn { benny: string[]; reply: string }
export interface DemoScript {
  turns: DemoTurn[];
  followThrough: Array<{ via: 'northstar' | 'bright'; ref: string }>;
  introFollowThrough: string;
  summary: string;
}

const kid = () => demoCatalog.dependents.find((d) => d.id === 'dep-leo')!;
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fact = (subject: string, category: PersonalFact['category'], statement: string): PersonalFact => ({
  id: subject, subject, category, statement,
  source: { kind: 'person_report', messageId: 'demo', observedAt: new Date().toISOString() },
});

export async function buildDemoScript(ctx: ConnectorContext): Promise<DemoScript> {
  const turns: DemoTurn[] = [];
  const followThrough: DemoScript['followThrough'] = [];
  const nextCode = () => randomBytes(3).toString('hex').toUpperCase();

  // ── Beat 1 — the physical (life → coverage → book) ──────────────────────────
  {
    const benny = [
      `Good morning, Maya. A few things came in while you were out. First, the school emailed: ${kid().name} needs a physical before enrollment. Your plan covers it ${demoCatalog.benefits.preventive.costShare}.`,
    ];
    const prep = await brightConnector.prepare(ctx, {
      workflow: 'appointment', request: 'annual physical for Leo',
      contextFacts: [fact('dependent', 'family', 'Leo'), fact('dependentId', 'family', 'dep-leo'), fact('specialty', 'health', 'pediatrics')],
      documents: [],
    });
    if ('action' in prep) {
      const code = nextCode();
      benny.push(`${prep.action.summary} ${prep.action.disclosures[0]} Reply YES ${code} to book.`);
      const sub = await brightConnector.submit(ctx, prep.action, `bright:${prep.action.resourceKey}`);
      followThrough.push({ via: 'bright', ref: sub.reference });
      turns.push({ benny, reply: `YES ${code}` });
      turns.push({ benny: [`${sub.detail} I'll remind you the day before and send what to bring.`], reply: '' });
    }
  }

  // ── Beat 2 — FSA use-it-or-lose-it ──────────────────────────────────────────
  {
    const fsa = demoCatalog.benefits.fsa;
    const benny = [
      `Second: your FSA has ${dollars(fsa.balanceCents)} and the plan year ends ${fsa.deadline} — use it or lose it. I found an unreimbursed receipt: Leo's glasses, ${dollars(18435)}.`,
    ];
    const prep = await northstarConnector.prepare(ctx, {
      workflow: 'reimbursement', request: 'file FSA claim for glasses',
      contextFacts: [fact('claim', 'coverage', 'vision|18435|glasses receipt')],
      documents: [],
    });
    if ('action' in prep) {
      const code = nextCode();
      benny.push(`${prep.action.summary} Amount ${dollars(prep.action.amountCents)}. Reply YES ${code} to file it.`);
      const sub = await northstarConnector.submit(ctx, prep.action, `northstar:${prep.action.resourceKey}`);
      followThrough.push({ via: 'northstar', ref: sub.reference });
      turns.push({ benny, reply: `YES ${code}` });
      turns.push({ benny: [`Filed — ${sub.detail}`], reply: '' });
    }
  }

  // ── Beat 3 — books (wellness stipend) ───────────────────────────────────────
  {
    const w = demoCatalog.benefits.wellness;
    const benny = [
      `Third: your ${w.label} gives you ${w.unitsPerMonth} ${w.unitLabel}s a month, and you haven't used any yet. Want your two books? I'll expense them.`,
    ];
    const prep = await northstarConnector.prepare(ctx, {
      workflow: 'reimbursement', request: 'reimburse two books',
      contextFacts: [fact('claim', 'coverage', 'wellness-books|6400|two books')],
      documents: [],
    });
    if ('action' in prep) {
      const code = nextCode();
      benny.push(`Two books, ${dollars(prep.action.amountCents)}, on your stipend. Reply YES ${code} and they're yours.`);
      const sub = await northstarConnector.submit(ctx, prep.action, `northstar:${prep.action.resourceKey}`);
      followThrough.push({ via: 'northstar', ref: sub.reference });
      turns.push({ benny, reply: `YES ${code}` });
      turns.push({ benny: [`Done — ${sub.detail}`], reply: '' });
    }
  }

  // ── Beat 4 — pure life (absence → tell the school) ──────────────────────────
  {
    const benny = [
      `Last thing, no benefit attached — just life: ${kid().name} is out Tuesday. I drafted the note: "Leo will be absent Tuesday. We'll pick up any missed work." Reply SEND and I'll send it.`,
    ];
    turns.push({ benny, reply: 'SEND' });
    turns.push({ benny: ['Sent to the school. Done — nothing slips.'], reply: '' });
  }

  return {
    turns,
    followThrough,
    introFollowThrough: 'While I have you — let me confirm everything landed.',
    summary: `That's the two maps working: your plan covered the physical, the FSA and books are paid, and the school note is out. Next time something changes — at school, in your plan, or in your family — I'll bring it to you before you have to ask.`,
  };
}

/** Poll the ledger (after the claims flip) and return the follow-through lines. */
export async function resolveFollowThrough(items: DemoScript['followThrough'], ctx: ConnectorContext): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 2800));
  const lines: string[] = [];
  for (const item of items) {
    const connector = item.via === 'northstar' ? northstarConnector : brightConnector;
    const r = await connector.lookup(ctx, `${item.via}:${item.ref}`);
    if (r.kind === 'found') lines.push(r.outcome.detail);
  }
  return lines;
}
