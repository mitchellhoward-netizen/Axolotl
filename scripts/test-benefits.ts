import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { BenefitsEngine } from '../src/benefits/engine.js';
import type { BenefitCase } from '../src/benefits/model.js';
import { LAB_START } from '../src/benefits/model.js';
import type { BenefitProvider } from '../src/benefits/provider.js';
import { SCENARIOS } from '../src/benefits/scenarios.js';
import { labServer } from '../src/benefits/server.js';
import { BenefitStore } from '../src/benefits/store.js';

const URL = 'postgresql://benny_lab@127.0.0.1:55432/benny_benefits_lab';
const schema = `benefits_test_${randomBytes(8).toString('hex')}`;
const fixedWall = Date.parse('2026-09-14T16:00:00.000Z');
let store = new BenefitStore(schema, URL, () => fixedWall);
let checks = 0;

async function rejectsStatus(p: Promise<unknown>, status = 409): Promise<void> {
  await assert.rejects(p, (e: unknown) => !!e && typeof e === 'object' && (e as { status?: number }).status === status);
  checks++;
}
async function prepareApprove(engine: BenefitsEngine, owner: string, c: BenefitCase): Promise<BenefitCase> {
  await engine.command(owner, c.id, 'prepare');
  const prepared = await store.get(owner, c.id);
  assert.equal(prepared.status, 'awaiting_approval');
  assert.ok(prepared.proposal);
  await engine.command(owner, c.id, 'approve', prepared.revision, prepared.proposal.hash);
  checks += 2;
  return store.get(owner, c.id);
}
async function advanceTick(engine: BenefitsEngine, owner: string, minutes = 1): Promise<BenefitCase[]> {
  await store.advance(owner, minutes);
  await engine.tick(owner);
  return store.list(owner);
}
async function orderCount(owner: string, existing?: boolean): Promise<number> {
  const suffix = existing === undefined ? '' : ` AND (data->>'existing')::boolean=$2`;
  const args = existing === undefined ? [owner] : [owner, existing];
  return Number((await store.pool.query(`SELECT count(*) FROM provider_orders WHERE owner=$1${suffix}`, args)).rows[0].count);
}

async function main(): Promise<void> {
  await store.init();
  const engine = new BenefitsEngine(store);

  // Every fixture is reachable and its first policy decision is exact.
  assert.equal(SCENARIOS.length, 19);
  assert.equal(new Set(SCENARIOS.map(s => s.id)).size, 19);
  const expected: Record<string, string> = {
    'fsa-unknown': 'needs_information', 'fsa-outside-window': 'ineligible', 'fsa-insufficient': 'needs_information',
    'fsa-paid': 'ineligible', 'dependent-documents': 'needs_information', 'dependent-authority': 'needs_information',
  };
  const catalogOwner = await store.createWorkspace('catalog');
  for (const s of SCENARIOS) {
    const c = await engine.load(catalogOwner, s.id);
    assert.equal(c.scenarioId, s.id);
    await engine.command(catalogOwner, c.id, 'prepare');
    const after = await store.get(catalogOwner, c.id);
    assert.equal(after.status, expected[s.id] ?? (s.id === 'refill-existing' ? 'queued' : 'awaiting_approval'), s.id);
  }
  checks += 40;
  assert.equal((await engine.state(catalogOwner)).scenarios.length, 19);

  // A provider must not even be consulted before exact consent.
  const calls = { lookup: 0, submit: 0, existing: 0 };
  const forbidden: BenefitProvider = {
    async lookup() { calls.lookup++; return undefined; },
    async submit() { calls.submit++; throw new Error('unexpected'); },
    async observeExisting() { calls.existing++; throw new Error('unexpected'); },
  };
  const consentOwner = await store.createWorkspace('consent');
  const consentEngine = new BenefitsEngine(store, forbidden);
  const consent = await consentEngine.load(consentOwner, 'fsa-glasses');
  await consentEngine.command(consentOwner, consent.id, 'prepare');
  await consentEngine.tick(consentOwner);
  assert.deepEqual(calls, { lookup: 0, submit: 0, existing: 0 });
  const p1 = (await store.get(consentOwner, consent.id)).proposal!;
  await rejectsStatus(consentEngine.command(consentOwner, consent.id, 'approve', p1.revision, '0'.repeat(64)));
  await consentEngine.command(consentOwner, consent.id, 'revise');
  const p2 = (await store.get(consentOwner, consent.id)).proposal!;
  assert.notEqual(p2.hash, p1.hash);
  assert.equal(p2.revision, p1.revision + 1);
  await rejectsStatus(consentEngine.command(consentOwner, consent.id, 'approve', p1.revision, p1.hash));
  await consentEngine.command(consentOwner, consent.id, 'approve', p2.revision, p2.hash);
  await consentEngine.command(consentOwner, consent.id, 'approve', p2.revision, p2.hash);
  assert.equal(Number((await store.pool.query('SELECT count(*) FROM approvals WHERE case_id=$1', [consent.id])).rows[0].count), 1);
  checks += 5;

  // Concurrent workers and repeated approval create one durable order.
  const raceOwner = await store.createWorkspace('race');
  const race = await engine.load(raceOwner, 'fsa-glasses');
  await prepareApprove(engine, raceOwner, race);
  await Promise.all([engine.tick(raceOwner), engine.tick(raceOwner), engine.tick(raceOwner)]);
  assert.equal(await orderCount(raceOwner, false), 1);
  await advanceTick(engine, raceOwner);
  const raceDone = await store.get(raceOwner, race.id);
  assert.equal(raceDone.status, 'completed');
  assert.equal(raceDone.realizedCents, 18435);
  checks += 3;

  // Claims count paid outcomes, not acceptance, and preserve asymmetric amounts.
  const moneyOwner = await store.createWorkspace('money');
  for (const id of ['fsa-glasses', 'health-reimbursement']) {
    const c = await engine.load(moneyOwner, id);
    await prepareApprove(engine, moneyOwner, c);
  }
  await engine.tick(moneyOwner);
  let money = await store.list(moneyOwner);
  assert.deepEqual(money.map(c => c.realizedCents), [0, 0]);
  await advanceTick(engine, moneyOwner);
  money = await store.list(moneyOwner);
  assert.deepEqual(money.map(c => c.realizedCents).sort((a, b) => a - b), [7320, 18435]);
  assert.equal((await store.metrics(moneyOwner)).realizedCents, 25755);
  checks += 3;

  // Refill readiness needs pickup; appointment readiness needs elapsed appointment time.
  const readyOwner = await store.createWorkspace('ready');
  const refill = await engine.load(readyOwner, 'refill');
  const appt = await engine.load(readyOwner, 'kids-appointment');
  await prepareApprove(engine, readyOwner, refill);
  await prepareApprove(engine, readyOwner, appt);
  await engine.tick(readyOwner); await advanceTick(engine, readyOwner);
  assert.equal((await store.get(readyOwner, refill.id)).status, 'ready');
  await engine.command(readyOwner, refill.id, 'confirm');
  assert.equal((await store.get(readyOwner, refill.id)).status, 'completed');
  assert.equal((await store.get(readyOwner, appt.id)).status, 'ready');
  await rejectsStatus(engine.command(readyOwner, appt.id, 'confirm'));
  checks += 3;

  // Zero refills asks a clinician and never claims dispensing.
  const renewalOwner = await store.createWorkspace('renewal');
  const renewal = await engine.load(renewalOwner, 'renewal');
  await engine.command(renewalOwner, renewal.id, 'prepare');
  const renewalProposal = (await store.get(renewalOwner, renewal.id)).proposal!;
  assert.equal(renewalProposal.operation, 'request_renewal');
  await engine.command(renewalOwner, renewal.id, 'approve', renewalProposal.revision, renewalProposal.hash);
  await engine.tick(renewalOwner); await advanceTick(engine, renewalOwner);
  assert.equal((await store.get(renewalOwner, renewal.id)).status, 'blocked');
  assert.match((await store.get(renewalOwner, renewal.id)).nextAction, /licensed prescriber|not authorization/i);
  checks += 3;

  // Existing refill observation has no submission.
  const existingOwner = await store.createWorkspace('existing');
  const existing = await engine.load(existingOwner, 'refill-existing');
  await engine.command(existingOwner, existing.id, 'prepare');
  await engine.tick(existingOwner); await advanceTick(engine, existingOwner);
  assert.equal(await orderCount(existingOwner, false), 0);
  assert.equal(await orderCount(existingOwner, true), 1);
  assert.equal((await store.get(existingOwner, existing.id)).status, 'ready');
  checks += 3;

  // Missing document updates the same reference, with a fresh revision and approval.
  const docsOwner = await store.createWorkspace('docs');
  const docs = await engine.load(docsOwner, 'claim-documents');
  await prepareApprove(engine, docsOwner, docs); await engine.tick(docsOwner); await advanceTick(engine, docsOwner);
  const needsDocs = await store.get(docsOwner, docs.id); const oldRef = needsDocs.providerReference!;
  assert.equal(needsDocs.status, 'needs_information');
  await engine.command(docsOwner, docs.id, 'repair');
  const repaired = await store.get(docsOwner, docs.id);
  assert.equal(repaired.status, 'awaiting_approval'); assert.ok(repaired.revision > needsDocs.revision);
  await engine.command(docsOwner, docs.id, 'approve', repaired.revision, repaired.proposal!.hash);
  await engine.tick(docsOwner); await advanceTick(engine, docsOwner);
  assert.equal((await store.get(docsOwner, docs.id)).providerReference, oldRef);
  assert.equal(await orderCount(docsOwner), 1);
  checks += 5;

  // Timeout-after-submit is reconciled by key, even after proposal deadline.
  const timeoutOwner = await store.createWorkspace('timeout');
  const timeout = await engine.load(timeoutOwner, 'fsa-timeout');
  await prepareApprove(engine, timeoutOwner, timeout); await engine.tick(timeoutOwner);
  assert.equal((await store.get(timeoutOwner, timeout.id)).status, 'reconciling');
  await store.advance(timeoutOwner, 7 * 1440); // beyond Sep 18 deadline and retry delay
  await engine.tick(timeoutOwner);
  assert.equal((await store.get(timeoutOwner, timeout.id)).status, 'completed');
  assert.equal(await orderCount(timeoutOwner, false), 1);
  checks += 3;

  // A closed worker can reopen the same schema and reclaim an expired execution lease.
  const restartOwner = await store.createWorkspace('restart');
  const restartCase = await engine.load(restartOwner, 'dependent-enrollment');
  await prepareApprove(engine, restartOwner, restartCase);
  await store.change(restartOwner, restartCase.id, c => {
    c.status = 'executing'; c.leaseToken = 'dead-worker'; c.leaseUntil = new Date(Date.parse(LAB_START) - 1).toISOString();
  });
  await store.close();
  store = new BenefitStore(schema, URL, () => fixedWall);
  const restarted = new BenefitsEngine(store);
  await restarted.tick(restartOwner); await advanceTick(restarted, restartOwner);
  assert.equal((await store.get(restartOwner, restartCase.id)).status, 'completed');
  assert.equal(await orderCount(restartOwner, false), 1);
  checks += 2;

  // Crash AFTER provider commit, BEFORE local receipt: an expired lease must look up,
  // not create a second refill (which has no expense-ID uniqueness safety net).
  const crashOwner = await store.createWorkspace('crash-after-commit');
  const crashCase = await restarted.load(crashOwner, 'refill');
  const crashJob = await prepareApprove(restarted, crashOwner, crashCase);
  const accepted = await restarted.provider.submit(crashOwner, crashJob, await store.now(crashOwner));
  await store.change(crashOwner, crashCase.id, c => {
    c.status = 'executing'; c.leaseToken = 'dead-worker'; c.leaseUntil = new Date(fixedWall + 30000).toISOString();
  });
  await restarted.tick(crashOwner);
  assert.equal((await store.get(crashOwner, crashCase.id)).providerReference, undefined);
  await advanceTick(new BenefitsEngine(store), crashOwner);
  assert.equal((await store.get(crashOwner, crashCase.id)).providerReference, accepted.reference);
  assert.equal((await store.get(crashOwner, crashCase.id)).status, 'ready');
  assert.equal(await orderCount(crashOwner), 1);
  checks += 4;

  // A changed receipt is a changed action even when the amount still passes policy.
  const evidenceOwner = await store.createWorkspace('changed-evidence');
  const evidenceCase = await restarted.load(evidenceOwner, 'fsa-glasses');
  await prepareApprove(restarted, evidenceOwner, evidenceCase);
  await store.change(evidenceOwner, evidenceCase.id, c => { c.facts.expenseId = 'different-receipt'; });
  await restarted.tick(evidenceOwner);
  assert.equal((await store.get(evidenceOwner, evidenceCase.id)).status, 'blocked');
  assert.equal(await orderCount(evidenceOwner), 0);
  await rejectsStatus(restarted.command(evidenceOwner, evidenceCase.id, 'repair'));
  checks += 2;

  // Cancellation revokes queued approval. Accepted requests cannot be cancelled locally.
  const cancelOwner = await store.createWorkspace('cancel');
  const cancelCase = await restarted.load(cancelOwner, 'health-reimbursement');
  await prepareApprove(restarted, cancelOwner, cancelCase);
  await restarted.command(cancelOwner, cancelCase.id, 'cancel');
  await restarted.tick(cancelOwner);
  assert.equal((await store.get(cancelOwner, cancelCase.id)).status, 'cancelled');
  assert.equal(await orderCount(cancelOwner), 0);
  await rejectsStatus(restarted.command(crashOwner, crashCase.id, 'cancel'));
  await store.advance(readyOwner, 3 * 1440);
  await restarted.command(readyOwner, appt.id, 'confirm');
  assert.equal((await store.get(readyOwner, appt.id)).status, 'completed');
  checks += 3;

  // A stale queued approval cannot execute after 24 hours, even inside the plan window.
  const expiredOwner = await store.createWorkspace('expired-consent');
  const expiredCase = await restarted.load(expiredOwner, 'refill');
  await prepareApprove(restarted, expiredOwner, expiredCase);
  await store.advance(expiredOwner, 1440); await restarted.tick(expiredOwner);
  assert.equal((await store.get(expiredOwner, expiredCase.id)).status, 'blocked');
  assert.equal(await orderCount(expiredOwner), 0);
  checks += 2;

  // Denial, slot loss, expired connection, and unavailable provider fail safely.
  for (const [id, want] of [['claim-denied', 'denied'], ['appointment-slot-lost', 'blocked'], ['connection-expired', 'blocked']] as const) {
    const owner = await store.createWorkspace(`fault-${id}`); const c = await restarted.load(owner, id);
    await prepareApprove(restarted, owner, c); await restarted.tick(owner);
    if (id === 'claim-denied') await advanceTick(restarted, owner);
    const out = await store.get(owner, c.id); assert.equal(out.status, want, id); assert.equal(out.realizedCents, 0);
    if (id === 'appointment-slot-lost') { await restarted.command(owner, c.id, 'repair'); assert.equal((await store.get(owner, c.id)).status, 'awaiting_approval'); }
    if (id === 'connection-expired') assert.equal(out.facts.connectionActive, false);
    checks += 2;
  }
  const unavailableOwner = await store.createWorkspace('unavailable');
  const unavailable = await restarted.load(unavailableOwner, 'provider-unavailable');
  await prepareApprove(restarted, unavailableOwner, unavailable);
  for (const minutes of [0, 1, 2]) { if (minutes) await store.advance(unavailableOwner, minutes); await restarted.tick(unavailableOwner); }
  const stopped = await store.get(unavailableOwner, unavailable.id);
  assert.equal(stopped.status, 'blocked'); assert.equal(stopped.attempts, 3); assert.equal(await orderCount(unavailableOwner), 0);
  await rejectsStatus(restarted.command(unavailableOwner, unavailable.id, 'repair'));
  await rejectsStatus(restarted.command(unavailableOwner, unavailable.id, 'cancel'));
  checks += 3;

  // Exact inclusive boundaries: service coverage endpoints pass; deadline passes at equality and fails one ms later.
  for (const which of ['start', 'end'] as const) {
    const owner = await store.createWorkspace(`boundary-${which}`);
    const c = await restarted.load(owner, 'dependent-enrollment');
    await store.change(owner, c.id, x => { x.facts.serviceAt = which === 'start' ? x.facts.coverageStart : x.facts.coverageEnd; });
    await restarted.command(owner, c.id, 'prepare'); assert.equal((await store.get(owner, c.id)).status, 'awaiting_approval');
  }
  const boundaryOwner = await store.createWorkspace('boundary-deadline');
  const deadline = await restarted.load(boundaryOwner, 'fsa-glasses');
  const boundaryNow = await store.now(boundaryOwner);
  await store.change(boundaryOwner, deadline.id, c => { c.facts.deadline = new Date(boundaryNow).toISOString(); });
  await restarted.command(boundaryOwner, deadline.id, 'prepare');
  assert.equal((await store.get(boundaryOwner, deadline.id)).status, 'awaiting_approval');
  await store.pool.query('DELETE FROM cases WHERE owner=$1 AND id=$2', [boundaryOwner, deadline.id]);
  const late = await restarted.load(boundaryOwner, 'fsa-glasses');
  await store.change(boundaryOwner, late.id, c => { c.facts.deadline = new Date(fixedWall - 1).toISOString(); });
  await restarted.command(boundaryOwner, late.id, 'prepare'); assert.equal((await store.get(boundaryOwner, late.id)).status, 'expired');
  checks += 4;

  // Constructor refuses non-loopback and wrong DB synchronously, before a pool can connect.
  assert.throws(() => new BenefitStore(schema, 'postgresql://x@example.com/benny_benefits_lab'));
  assert.throws(() => new BenefitStore(schema, 'postgresql://x@127.0.0.1/production'));
  assert.throws(() => new BenefitStore(schema, 'postgresql://x@127.0.0.1/benny_benefits_lab?host=example.com'));
  checks += 3;

  // HTTP boundary: isolated cookie workspaces, ownership, consent and strict request shape/origin.
  const server = labServer(restarted);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as AddressInfo).port;
  const request = async (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${path}`, init);
  try {
    assert.equal((await request('/api/tick', { method: 'POST' })).status, 401);
    const aState = await request('/api/state'); const bState = await request('/api/state');
    const cookieA = aState.headers.get('set-cookie')!.split(';')[0]; const cookieB = bState.headers.get('set-cookie')!.split(';')[0];
    assert.notEqual(cookieA, cookieB);
    const post = (cookie: string, path: string, value: unknown, headers: Record<string, string> = {}) => request(path, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-benny-lab': '1', ...headers }, body: JSON.stringify(value),
    });
    assert.equal((await post(cookieA, '/api/cases', { scenarioId: 'fsa-glasses' })).status, 200);
    const stateA = await (await request('/api/state', { headers: { cookie: cookieA } })).json() as { cases: BenefitCase[] };
    const id = stateA.cases[0].id;
    assert.equal((await post(cookieB, `/api/cases/${id}/command`, { command: 'prepare' })).status, 404);
    assert.equal((await post(cookieA, `/api/cases/${id}/command`, { command: 'prepare', note: 'free text' })).status, 400);
    assert.equal((await request(`/api/cases/${id}/command`, { method: 'POST', headers: { cookie: cookieA, 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await post(cookieA, `/api/cases/${id}/command`, { command: 'prepare' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post(cookieA, `/api/cases/${id}/command`, { command: 'approve', revision: 999, hash: '0'.repeat(64) })).status, 409);
    checks += 7;
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }

  console.log(`benefits lab: ${checks} assertions passed; all 19 built-in scenarios covered`);
}

try {
  await main();
} finally {
  // This suite owns exactly one randomized schema; never drop the lab or public schema.
  try { await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await store.close().catch(() => undefined); }
}
