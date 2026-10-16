/**
 * src/agent/decide.ts, offline: thresholds, the fallback that never says yes, what gets logged,
 * and Jev as the second check on a bare YES. A fake fetch stands in for Jev.
 *
 *   npm run test:decide
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvesYes, decide, jevEnabled, probablyYes, thresholdsFor, vetoesYes, yesQuestion, type DecisionLog } from '../src/agent/decide.js';
import { Agent } from '../src/agent/agent.js';
import { RulesIntentEngine } from '../src/agent/intent/rules.js';
import { MockCalendarProvider } from '../src/integrations/calendar.js';
import { MockMealsProvider } from '../src/integrations/meals.js';
import { MockSis } from '../src/integrations/sis.js';
import { createSeedDb, provisionFamily } from '../src/seed.js';
import type { Step } from '../src/agent/steps/types.js';

delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const ON = { JEV_ENABLED: 'true' } as NodeJS.ProcessEnv;

function jev(choice: string, confidence: number, seen?: unknown[]): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    seen?.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({ model: 'jev-1.13.0', answers: { decision: { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } } }, usage: { input_tokens: 300, output_tokens: 30 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
}
const quiet = { record: () => {} };

test('confident above the threshold acts; between asks; below the lower one hands off', async () => {
  const q = yesQuestion('Reply YES to approve the email ready to send.', 'yes');
  assert.equal((await decide('yes_to_exact_values', q, { env: ON, fetch: jev('approve', 0.99), ...quiet })).verdict, 'act');
  assert.equal((await decide('yes_to_exact_values', q, { env: ON, fetch: jev('approve', 0.83), ...quiet })).verdict, 'ask');
  assert.equal((await decide('yes_to_exact_values', q, { env: ON, fetch: jev('approve', 0.2), ...quiet })).verdict, 'handoff');
});

test('every failure is unsure and asks; none of them approves', async () => {
  const q = yesQuestion('x', 'yes');
  const cases: Array<[string, typeof fetch | undefined, NodeJS.ProcessEnv]> = [
    ['not configured', undefined, {}],
    ['error status', (async () => new Response('{"echo":"yes"}', { status: 500 })) as unknown as typeof fetch, ON],
    ['network error', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch, ON],
    ['outside the choices', jev('maybe', 0.99), ON],
  ];
  for (const [name, f, env] of cases) {
    const d = await decide('yes_to_exact_values', q, { env, fetch: f, ...quiet });
    assert.equal(d.answer, 'unsure', name);
    assert.equal(d.verdict, 'ask', name);
    assert.equal(approvesYes(d as never), false, name);
    assert.equal(vetoesYes(d as never), false, `${name}: Jev down doesn't block a plain yes`);
    assert.equal(probablyYes(d as never), false, name);
  }
});

test('a slow Jev times out as unsure', async () => {
  const slow = ((_u: string, init: RequestInit) =>
    new Promise((_, reject) => {
      const hold = setTimeout(() => {}, 5_000); // AbortSignal.timeout doesn't keep the process alive
      init.signal?.addEventListener('abort', () => { clearTimeout(hold); reject(Object.assign(new Error('t'), { name: 'TimeoutError' })); });
    })) as unknown as typeof fetch;
  const d = await decide('yes_to_exact_values', yesQuestion('x', 'yes'), { env: ON, fetch: slow, timeoutMs: 50, ...quiet });
  assert.equal(d.answer, 'unsure');
  assert.equal(d.error, 'TimeoutError');
});

test('sends the pinned model and only the question; logs a digest, not the inputs', async () => {
  const seen: Array<{ model: string; state: Record<string, string> }> = [];
  const logs: DecisionLog[] = [];
  await decide('yes_to_exact_values', yesQuestion('Reply YES to approve the email ready to send.', 'yes send it'), { env: ON, fetch: jev('approve', 0.99, seen), record: (e) => logs.push(e) });
  assert.equal(seen[0]!.model, 'jev-1.13.0');
  assert.deepEqual(Object.keys(seen[0]!.state).sort(), ['parent_reply', 'what_we_asked']);
  assert.equal(logs.length, 1);
  assert.ok(!JSON.stringify(logs[0]).includes('send it'));
  assert.match(logs[0]!.inputDigest, /^[0-9a-f]{16}$/);
});

test('thresholds come from config, and a malformed override loosens nothing', () => {
  assert.equal(thresholdsFor('yes_to_exact_values', {}).act, 0.98);
  assert.equal(thresholdsFor('yes_to_exact_values', { DECIDE_THRESHOLDS: '{"yes_to_exact_values":{"act":0.99}}' }).act, 0.99);
  assert.equal(thresholdsFor('yes_to_exact_values', { DECIDE_THRESHOLDS: '{oops' }).act, 0.98);
  assert.equal(jevEnabled({}), false);
  assert.equal(jevEnabled({ TYPESAFE_API_KEY: 'k' }), true);
  assert.equal(jevEnabled({ TYPESAFE_API_KEY: 'k', JEV_ENABLED: 'false' }), false);
});

// ── Jev on the YES gate ────────────────────────────────────────────────────────

const ID = 'decide-test-conv';
function emailStep(): Step {
  return {
    id: 'email-test',
    caseId: 'email',
    intent: 'send_email',
    channel: 'email',
    counterparty: { role: 'OTHER', email: 'sped@district.edu' },
    payload: { channel: 'email', subject: 'Speech request for Emma', body: 'Please evaluate Emma for speech.' },
    successCondition: { describe: 'Email the request', kind: 'reference_received' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };
}
function staged(): { agent: Agent; outbox: unknown[] } {
  const outbox: unknown[] = [];
  const db = createSeedDb();
  db.parents.push({ id: 'parent-maya', phone: '15555550100', email: '', firstName: 'Maya', lastName: 'Lee', studentIds: [] });
  provisionFamily(db, 'parent-maya', { children: [{ name: 'Emma', grade: '3rd' }], school: 'Soquel Elementary School', district: 'Soquel Union Elementary School District', schoolType: 'public', needs: ['speech'], challenges: ['speech'] });
  const agent = new Agent({
    intentEngine: new RulesIntentEngine(),
    sis: new MockSis(db),
    calendar: new MockCalendarProvider(),
    meals: new MockMealsProvider({}),
    db,
    defaultParentId: 'parent-maya',
    requireVerification: false,
    email: { send: async (m: unknown) => { outbox.push(m); return { id: 'mock-1' }; } } as never,
  });
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [emailStep()] });
  agent.showProposalForTest(ID);
  return { agent, outbox };
}

async function withJev<T>(f: typeof fetch, run: (calls: { n: number }) => Promise<T>): Promise<T> {
  const saved = { fetch: globalThis.fetch, enabled: process.env.JEV_ENABLED };
  const calls = { n: 0 };
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => { calls.n++; return f(...a); }) as typeof fetch;
  process.env.JEV_ENABLED = 'true';
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.enabled === undefined) delete process.env.JEV_ENABLED;
    else process.env.JEV_ENABLED = saved.enabled;
  }
}

test('veto: only a confident no stops a plain yes; probablyYes is the 0.5-0.98 band', () => {
  const d = (answer: 'approve' | 'not_approve', confidence: number) => ({ type: 'yes_to_exact_values' as const, answer, confidence, probabilities: {}, verdict: (confidence >= 0.98 ? 'act' : 'ask') as 'act' | 'ask', inputTokens: 0, ms: 0 });
  assert.equal(vetoesYes(d('not_approve', 0.95)), true);
  assert.equal(vetoesYes(d('not_approve', 0.66)), false, '"ok" on jev-1.13.0');
  assert.equal(vetoesYes(d('approve', 0.3)), false);
  assert.equal(probablyYes(d('approve', 0.76)), true, '"yes thanks" on jev-1.13.0');
  assert.equal(probablyYes(d('approve', 0.99)), false, 'sure is not "probably"');
});

test('gate: a plain yes Jev is sure is not an approval runs nothing and asks once, in a sentence', async () => {
  const { agent, outbox } = staged();
  await withJev(jev('not_approve', 0.95), async () => {
    const r = await agent.handle(ID, 'ok');
    assert.equal(outbox.length, 0);
    assert.match(r.text, /want me to go ahead with the email ready to send\?/i);
  });
});

test('gate: after one check, a yes phrase answers it even if Jev misreads it ("dale")', async () => {
  const { agent, outbox } = staged();
  await withJev(jev('not_approve', 0.94), async () => {
    const first = await agent.handle(ID, 'dale');
    assert.equal(outbox.length, 0);
    assert.match(first.text, /want me to go ahead/i);
    const second = await agent.handle(ID, 'dale');
    assert.ok(second.text.includes('Done!'), second.text);
    assert.equal(outbox.length, 1);
  });
});

test('gate: a plain yes Jev is lukewarm about still runs (Jev is a veto there)', async () => {
  const { agent, outbox } = staged();
  await withJev(jev('not_approve', 0.66), async () => {
    const r = await agent.handle(ID, 'yes');
    assert.ok(r.text.includes('Done!'), r.text);
    assert.equal(outbox.length, 1);
  });
});

test('gate: Jev down never blocks a plain yes', async () => {
  const { agent, outbox } = staged();
  await withJev((async () => new Response('', { status: 503 })) as unknown as typeof fetch, async () => {
    assert.ok((await agent.handle(ID, 'yes')).text.includes('Done!'));
    assert.equal(outbox.length, 1);
  });
});

test('gate: "sounds good, send it" runs when Jev is sure it is a yes', async () => {
  const { agent, outbox } = staged();
  await withJev(jev('approve', 1.0), async () => {
    const r = await agent.handle(ID, 'sounds good, thank you, send it over');
    assert.ok(r.text.includes('Done!'), r.text);
    assert.equal(outbox.length, 1);
  });
});

test('gate: "yes thank you so much" is not mistaken for a change when Jev reads it as a yes', async () => {
  const { agent, outbox } = staged();
  await withJev(jev('approve', 0.99), async () => {
    const r = await agent.handle(ID, 'yes thank you so much');
    assert.ok(r.text.includes('Done!'), r.text);
    assert.equal(outbox.length, 1);
  });
});

test('gate: a probable yes gets one "want me to go ahead?", then a yes runs it', async () => {
  const { agent, outbox } = staged();
  await withJev(jev('approve', 0.76), async () => {
    const r = await agent.handle(ID, 'yes thanks');
    assert.equal(outbox.length, 0);
    assert.match(r.text, /want me to go ahead/i);
    assert.equal(agent.getStateForTest(ID)?.pendingSteps?.length, 1, 'still staged');
  });
  assert.ok((await agent.handle(ID, 'yes')).text.includes('Done!'));
  assert.equal(outbox.length, 1);
});

test('gate: something Jev reads as not a yes runs nothing (and without Jev, nothing either)', async () => {
  const { agent, outbox } = staged();
  await withJev(jev('not_approve', 0.98), async () => {
    const r = await agent.handle(ID, 'hold on, let me check with my husband');
    assert.equal(outbox.length, 0);
    assert.ok(!r.text.includes('Done!'));
  });
  const b = staged();
  const r = await b.agent.handle(ID, 'sounds good, send it over');
  assert.equal(b.outbox.length, 0, 'without Jev, an unrecognised reply never sends');
  assert.ok(!r.text.includes('Done!'));
});
