import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, after, test } from 'node:test';
import { discover, FICTIONAL_SOURCES, nudge } from '../src/benefits/discovery.js';
import { BenefitsEngine } from '../src/benefits/engine.js';
import { LAB_START } from '../src/benefits/model.js';
import { BenefitStore } from '../src/benefits/store.js';

const now = Date.parse(LAB_START);
const schema = `benefits_test_${randomBytes(8).toString('hex')}`;
const store = new BenefitStore(schema, 'postgresql://benny_lab@127.0.0.1:55432/benny_benefits_lab', () => now);
const engine = new BenefitsEngine(store);
before(() => store.init());
after(async () => { try { await store.pool.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await store.close(); } });
const sources = () => structuredClone(FICTIONAL_SOURCES);
const glasses = () => discover(sources(), now).find(r => r.finding.expenseId === 'inbox-glasses')!.candidate!;
const nudges = (c: ReturnType<typeof glasses>) => c.events.filter(e => ['opportunity_nudge', 'deadline_nudge'].includes(e.type));

test('joins records, deduplicates forwarded receipt, separates exclusions from unknowns', () => {
  const results = discover(sources(), now);
  assert.equal(results.length, 7);
  assert.deepEqual(results.filter(r => r.finding.decision === 'actionable').map(r => r.finding.expenseId), ['inbox-glasses', 'inbox-visit']);
  assert.deepEqual(results.filter(r => r.finding.decision === 'excluded').map(r => r.finding.expenseId), ['inbox-old', 'inbox-paid']);
  assert.equal(results.filter(r => r.candidate).length, 4);
  assert.equal(results[0]!.candidate!.facts.amountCents, 18435);
  assert.equal(results[1]!.candidate!.facts.amountCents, 7320);
  assert.match(results[0]!.candidate!.evidence[1]!.detail, /inbox-1, forwarded-inbox-1/);
  const dental = results.find(r => r.finding.expenseId === 'inbox-dental')!;
  assert.equal(dental.candidate, undefined);
  assert.match(dental.finding.reason, /Multiple plans/);
});

test('conflicting copies, missing identity and missing enrollment never become claims', () => {
  const conflict = sources(); conflict.receipts[1]!.amountCents = 18436;
  assert.equal(discover(conflict, now)[0]!.candidate, undefined);
  assert.match(discover(conflict, now)[0]!.finding.reason, /disagree/);
  const identity = sources(); identity.people = identity.people.filter(p => p.id !== 'sam');
  assert.equal(discover(identity, now)[0]!.candidate, undefined);
  const enrollment = sources(); enrollment.plans[0]!.members = ['alex'];
  assert.equal(discover(enrollment, now)[0]!.candidate, undefined);
});

test('matching uses coverage rules and authority, not keywords or a known scenario ID', () => {
  const excluded = sources(); excluded.plans[0]!.categories.vision = false;
  assert.equal(discover(excluded, now)[0]!.finding.decision, 'excluded');
  const authority = sources(); authority.people[1]!.authorized = false;
  assert.match(discover(authority, now)[0]!.finding.reason, /Authority/);
  const modified = sources();
  modified.receipts = [{ ...modified.receipts[2]!, expenseId: 'unseen-expense', description: 'Unfamiliar receipt title', amountCents: 4319 }];
  const result = discover(modified, now)[0]!;
  assert.equal(result.finding.decision, 'actionable');
  assert.equal(result.candidate!.facts.amountCents, 4319);
  assert.equal(result.candidate!.scenarioId, 'receipt:unseen-expense');
  modified.receipts[0]!.itemized = false;
  assert.match(discover(modified, now)[0]!.finding.reason, /documents are missing/);
});

test('quiet hours apply at 22:00 and 08:00 Pacific boundaries, including winter offset', () => {
  for (const date of ['2026-09-15T04:59:59Z', '2026-09-15T15:00:00Z']) {
    const c = glasses(); nudge(c, Date.parse(date)); assert.equal(nudges(c).length, 1, date);
  }
  for (const date of ['2026-09-15T05:00:00Z', '2026-09-15T14:59:59Z']) {
    const c = glasses(); nudge(c, Date.parse(date)); assert.equal(nudges(c).length, 0, date);
  }
  const winter = glasses(); winter.facts.deadline = '2026-12-20T07:59:59Z';
  nudge(winter, Date.parse('2026-12-15T15:59:59Z')); assert.equal(nudges(winter).length, 0);
  nudge(winter, Date.parse('2026-12-15T16:00:00Z')); assert.equal(nudges(winter).length, 1);
});

test('reminders are bounded, snoozed and expired without extending filing dates', () => {
  const c = glasses();
  nudge(c, now); nudge(c, now); assert.equal(nudges(c).length, 1);
  nudge(c, now + 86400000); assert.equal(nudges(c).length, 1); // Not in final day.
  const friday = Date.parse('2026-09-18T16:00:00Z');
  c.snoozedUntil = new Date(friday + 3600000).toISOString();
  nudge(c, friday); assert.equal(nudges(c).length, 1);
  nudge(c, friday + 3600000); assert.equal(nudges(c).length, 2);
  assert.equal(nudges(c)[1]!.type, 'deadline_nudge');
  nudge(c, friday + 7200000); assert.equal(nudges(c).length, 2);
  const deadline = c.facts.deadline;
  nudge(c, Date.parse(deadline) + 1);
  assert.equal(c.status, 'expired'); assert.equal(c.facts.deadline, deadline);
  assert.equal(nudges(c).length, 2);
});

test('first and final prompts cannot collapse into two nudges on the same day', () => {
  const c = glasses(); const friday = Date.parse('2026-09-18T16:00:00Z');
  nudge(c, friday); nudge(c, friday + 3600000);
  assert.equal(nudges(c).length, 1);
  for (const status of ['cancelled', 'completed', 'queued', 'pending', 'executing', 'reconciling', 'ready'] as const) {
    const closed = glasses(); closed.status = status; nudge(closed, now);
    assert.equal(nudges(closed).length, 0, status);
  }
  const documents = glasses(); documents.status = 'needs_information'; documents.providerReference = 'SIM-existing-claim';
  nudge(documents, now); assert.equal(nudges(documents).length, 0);
});

test('opt-in and concurrent repeated scans preserve one case and one initial nudge per expense', async () => {
  const owner = await store.createWorkspace('discovery-race');
  await engine.tick(owner); assert.equal((await store.list(owner)).length, 0);
  await store.setDiscovery(owner, true);
  await Promise.all([engine.scan(owner), engine.scan(owner), engine.scan(owner)]);
  const initial = await engine.state(owner);
  assert.equal(initial.cases.length, 4); assert.equal(initial.discovery.nudges.length, 4);
  assert.equal(initial.metrics.providerSubmissions, 0); assert.equal(initial.metrics.approvals, 0);
  await engine.tick(owner);
  assert.deepEqual((await store.list(owner)).map(c => c.id), initial.cases.map(c => c.id));
  assert.equal((await engine.state(owner)).discovery.nudges.length, 4);
  const c = initial.cases.find(c => c.facts.expenseId === 'inbox-glasses')!;
  await engine.command(owner, c.id, 'cancel');
  await new BenefitsEngine(store).scan(owner);
  assert.equal((await store.get(owner, c.id)).status, 'cancelled');
  assert.equal((await engine.state(owner)).discovery.findings.find(f => f.expenseId === 'inbox-glasses')!.decision, 'closed');
});

test('pause and snooze survive another engine, and discovery still needs exact approval', async () => {
  const owner = await store.createWorkspace('discovery-followthrough');
  await store.setDiscovery(owner, true); await engine.scan(owner);
  const c = (await store.list(owner)).find(c => c.facts.expenseId === 'inbox-glasses')!;
  await engine.command(owner, c.id, 'snooze');
  assert.equal((await store.get(owner, c.id)).snoozedUntil, '2026-09-15T16:00:00.000Z');
  await store.setDiscovery(owner, false);
  await store.advance(owner, 4 * 1440);
  const next = new BenefitsEngine(store); await next.tick(owner);
  assert.equal((await next.state(owner)).discovery.nudges.length, 4);
  assert.equal((await next.state(owner)).discovery.enabled, false);
  await store.setDiscovery(owner, true); await next.scan(owner);
  assert.equal((await next.state(owner)).discovery.nudges.length, 8);
  await next.command(owner, c.id, 'prepare');
  const p = (await store.get(owner, c.id)).proposal!;
  assert.equal(p.amountCents, 18435);
  assert.equal((await store.metrics(owner)).providerSubmissions, 0);
  await next.command(owner, c.id, 'approve', p.revision, p.hash);
  await next.tick(owner);
  assert.equal((await next.state(owner)).discovery.findings.find(f => f.expenseId === 'inbox-glasses')!.decision, 'in_progress');
  await store.advance(owner, 1); await next.tick(owner);
  assert.equal((await store.get(owner, c.id)).realizedCents, 18435);
  assert.equal((await next.state(owner)).discovery.findings.find(f => f.expenseId === 'inbox-glasses')!.decision, 'closed');
  assert.equal((await store.metrics(owner)).providerSubmissions, 1);
});
