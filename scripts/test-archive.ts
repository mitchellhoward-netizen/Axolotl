/**
 * The agent's bridge to the rules archive (src/archive/client.ts → archive/rulesarchive/serve.py).
 * Needs python3 with PyYAML. Run: npm run test:archive
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveClient, ArchiveUnavailable, type ArchiveProgram } from '../src/archive/client.js';

const client = new ArchiveClient();
test.after(() => client.close());

test('the worker answers, and names its programs', async () => {
  const r = await client.ping();
  assert.equal(r.version, 1);
  assert.ok(r.programs.includes('school_meals'));
});

test('every archive case evaluated through the bridge gives the status and tier the archive expects', async () => {
  const programs: ArchiveProgram[] = ['school_meals', 'snap', 'medicaid', 'msp', 'ltc_medicaid', 'disability', 'turning_65'];
  let n = 0;
  for (const program of programs) {
    for (const c of await client.cases(program)) {
      const d = await client.evaluate(program, c.household, c.as_of);
      assert.equal(d.status, c.expect.status, `${c.id} status`);
      if (c.expect.tier !== undefined) assert.equal(d.tier, c.expect.tier, `${c.id} tier`);
      n++;
    }
  }
  assert.ok(n >= 497, `ran ${n} cases`);
});

test('a California family of 2 on $30,000: free meals for all, reduced-price federal category, with its rules', async () => {
  const d = await client.evaluate(
    'school_meals',
    {
      state: 'ca',
      members: [{ id: 'p', age: 40 }, { id: 'c1', age: 10, relationship: 'child', student: true }],
      facts: { reported_income: [{ owner: 'p', kind: 'earned', amount: 30000, frequency: 'annual' }] },
    },
    '2026-09-15',
  );
  assert.equal(d.status, 'eligible');
  assert.ok(d.reasons.some((r) => r.rule === 'SCH-FED-INCOME-TEST'));
  assert.ok(d.links.length > 0);
});

test('a warm call is fast', async () => {
  await client.ping();
  const t = performance.now();
  for (let i = 0; i < 20; i++) await client.ping();
  const ms = (performance.now() - t) / 20;
  assert.ok(ms < 50, `${ms.toFixed(1)} ms a call`);
});

test('a bad request is an error, and the worker keeps answering', async () => {
  await assert.rejects(client.evaluate('lottery' as ArchiveProgram, { state: 'ca', members: [] }, '2026-09-15'), /unknown program/);
  assert.equal((await client.ping()).version, 1);
});

test('no Python means ArchiveUnavailable, never an answer', async () => {
  const broken = new ArchiveClient({ python: '/nonexistent/python3', timeoutMs: 2000 });
  await assert.rejects(broken.ping(), ArchiveUnavailable);
  broken.close();
});
