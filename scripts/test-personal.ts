import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { emptyPersonalContext, rememberFact, openPersonalCase, extendPersonalCase, personalView, caseProgress, requireReadyStep, importSchoolContext } from '../src/domain/personal-context.js';
import { createPersonalPlanner, isPersonalControl, personalModelContext, personalPlanSchema } from '../src/agent/personal.js';
import { LlmClient } from '../src/agent/llm.js';
import type { Account } from '../src/benefits/runtime.js';

const now = Date.parse('2026-09-14T12:00:00Z');
const blank = (): Account => ({ sender: 'fictional@example.invalid', space: 'dm-fixture', line: 'line-fixture',
  paused: false, tasks: [], connections: {}, outbox: [], revocations: [], personal: emptyPersonalContext() });

test('facts retain provenance, expiry boundaries and corrections without merging people', () => {
  const p = emptyPersonalContext();
  const old = rememberFact(p, { subject: 'Emma', category: 'coverage', statement: 'Old plan covers speech assessments', validUntil: new Date(now).toISOString() }, 'msg-old', now - 1000);
  const other = rememberFact(p, { subject: 'Sam', category: 'coverage', statement: 'Different dependent plan', validUntil: new Date(now + 1).toISOString() }, 'msg-sam', now);
  assert.deepEqual(personalView(p, [], now - 1).facts.map(f => f.id), [old.id, other.id]);
  assert.deepEqual(personalView(p, [], now).facts.map(f => f.id), [other.id]);
  assert.deepEqual(personalView(p, [], now + 1).facts, []);
  assert.throws(() => rememberFact(p, { subject: 'Sam', category: 'coverage', statement: 'Wrong person correction', supersedes: old.id }, 'bad', now));
  const fresh = rememberFact(p, { subject: 'Emma', category: 'coverage', statement: 'New plan requires referral', supersedes: old.id }, 'msg-new', now);
  assert.equal(fresh.source.kind, 'person_report');
  assert.equal(fresh.source.messageId, 'msg-new');
  assert.equal(p.facts.find(f => f.id === old.id)?.statement, 'Old plan covers speech assessments');
  assert.deepEqual(personalView(p, [], now).facts.map(f => f.id), [other.id, fresh.id]);
  assert.throws(() => rememberFact(p, { subject: 'Emma', category: 'coverage', statement: 'Forged', source: { kind: 'provider' } }, 'bad', now));
});

test('one case spans institutions; submission and a parent report do not finish the goal', () => {
  const p = emptyPersonalContext();
  const c = openPersonalCase(p, { subject: 'Emma', goal: 'Get Emma evaluated and supported', steps: [
    { domain: 'healthcare', goal: 'Book an evaluation appointment', dependsOn: [] },
    { domain: 'school', goal: 'Record the evaluation and agreed support at school', dependsOn: [0] },
    { domain: 'benefits', goal: 'Reimburse eligible evaluation expenses', dependsOn: [0] },
  ] }, 'speech', now);
  const t = { id: 'AABBCCDD', caseId: c.id, stepId: c.steps[0]!.id, status: 'submitted',
    outcome: { state: 'submitted', reference: 'fixture-appointment', evidence: 'Accepted appointment request', observedAt: new Date(now).toISOString() } };
  assert.throws(() => requireReadyStep(p, [t], c.id, c.steps[2]!.id));
  c.steps[1]!.report = { text: 'The school says it is done', messageId: 'parent-report', at: new Date(now).toISOString() };
  t.status = 'completed'; t.outcome.state = 'completed';
  const progress = caseProgress(c, [t]);
  assert.equal(progress.status, 'open');
  assert.deepEqual(progress.steps.map(s => s.status), ['completed', 'reported_done', 'planned']);
  requireReadyStep(p, [t], c.id, c.steps[2]!.id);
  assert.throws(() => requireReadyStep(p, [t], randomUUID(), c.steps[2]!.id));
  // State without evidence does not count as completed.
  t.outcome.evidence = '';
  assert.equal(caseProgress(c, [t]).steps[2]!.status, 'blocked');
});

test('case expansion keeps stable step IDs and rejects forward edges/cycles atomically', () => {
  const p = emptyPersonalContext();
  const c = openPersonalCase(p, { subject: 'Emma', goal: 'Speech support', steps: [{ domain: 'school', goal: 'Review report', dependsOn: [] }] }, 'school', now);
  const original = c.steps[0]!.id;
  extendPersonalCase(p, c.id, [{ domain: 'healthcare', goal: 'Arrange evaluation', dependsOn: [0] }]);
  assert.equal(p.cases.length, 1); assert.equal(c.steps[0]!.id, original);
  assert.deepEqual(c.steps[1]!.dependsOn, [original]);
  assert.throws(() => extendPersonalCase(p, c.id, [{ domain: 'benefits', goal: 'Invalid self dependency', dependsOn: [2] }]));
  assert.equal(c.steps.length, 2);
});

test('school import preserves known family context without importing authority or transcript', () => {
  const p = importSchoolContext({ profile: { children: [{ name: 'Emma', grade: '3' }], school: 'Fictional Elementary',
    needs: ['speech evaluation'], challenges: [], notes: 'Works evenings' }, cases: [{ id: 'old-school', kind: 'evaluation',
    summary: 'Get Emma speech support', child: 'Emma', status: 'resolved', createdAt: new Date(now - 1000).toISOString() }] }, 'profile:fixture', now);
  assert.ok(p.facts.some(f => f.statement.includes('Fictional Elementary')));
  assert.ok(p.facts.every(f => f.source.kind === 'school_profile'));
  assert.deepEqual(p.history, []);
  assert.equal(caseProgress(p.cases[0]!, []).status, 'open');
  assert.equal(caseProgress(p.cases[0]!, []).steps[0]!.status, 'reported_done');
});

test('the same model context includes school and coverage but excludes executor secrets', async () => {
  const a = blank();
  rememberFact(a.personal!, { subject: 'Emma', category: 'school', statement: 'School requested speech evaluation' }, 'school', now);
  rememberFact(a.personal!, { subject: 'self', category: 'coverage', statement: 'Employer provides a plan through Fixture' }, 'work', now);
  a.connections.wex = { generation: 'private-generation', status: 'active', expiresAt: now + 1000,
    credential: 'DO-NOT-EXPOSE-CREDENTIAL', accountId: 'DO-NOT-EXPOSE-ACCOUNT', code: 'DEADBEEF' };
  a.outbox.push({ id: 'private-message', text: 'DO-NOT-EXPOSE-AUTH-LINK', proactive: false, attempts: 0, nextRunAt: now });
  const view = JSON.stringify(personalModelContext(a, now));
  assert.match(view, /School requested speech evaluation/); assert.match(view, /Employer provides/);
  assert.doesNotMatch(view, /DO-NOT-EXPOSE|DEADBEEF|private-generation/);
  const planner = createPersonalPlanner({ async completeJson(system, user, options) {
    assert.match(system, /NOT different assistants/);
    assert.equal(options?.private, true); assert.ok(options?.signal);
    assert.deepEqual(JSON.parse(user).availableConnectors, []);
    return JSON.stringify({ reply: 'We can connect the school request to your plan. Coverage still needs checking.', facts: [], newCases: [], reports: [] });
  } });
  assert.match((await planner('What about her evaluation?', a, now, [])).reply, /school request/);
});

test('bounded retrieval finds an older relevant fact and keeps document candidates attributed', () => {
  const a = blank();
  const speech = rememberFact(a.personal!, { subject: 'Emma', category: 'school', statement: 'Speech evaluation was requested by school.' }, 'old-school', now);
  for (let i = 0; i < 35; i++) rememberFact(a.personal!, { subject: 'self', category: 'preference', statement: `Unrelated preference ${i}` }, `recent-${i}`, now);
  a.tasks.push({ id: 'AABBCCDD', workflow: 'fsa', request: 'Glasses receipt', revision: 1, status: 'needs_information', detail: 'Review needed',
    documents: ['fictional-document'], attempts: 0, failures: 0, createdAt: now, events: [],
    documentReview: { issues: ['OCR needs verification'], questions: ['Check plan eligibility'], documents: [{
      id: 'fictional-document', digest: 'fictional-digest', kind: 'receipt', status: 'extracted', pages: 1, issues: [],
      facts: [{ field: 'paidCents', value: 18435, source: { document: 'fictional-document', page: 1, line: 4, method: 'ocr', quote: 'RAW QUOTE NOT IN MODEL CONTEXT' } }],
    }] } });
  const view = personalModelContext(a, now, 'Emma speech evaluation');
  assert.equal(view.facts[0]!.id, speech.id);
  assert.equal(view.facts.length, 30); assert.equal(view.omitted.facts, 6);
  const candidate = view.tasks[0]!.documentReview!.documents[0]!.facts[0]!;
  assert.equal(candidate.value, 18435); assert.equal(candidate.source.method, 'ocr');
  assert.equal(candidate.source.document, 'fictional-document');
  assert.doesNotMatch(JSON.stringify(view), /RAW QUOTE/);
  assert.match(JSON.stringify(view), /OCR needs verification/);
});

test('model output cannot issue approvals, impersonate a provider, or run arbitrary school tools', () => {
  const base = { reply: 'No action.', facts: [], newCases: [], reports: [] };
  for (const action of [
    { kind: 'command', command: { verb: 'YES', code: 'DEADBEEF' } },
    { kind: 'command', command: { verb: 'CONNECT', provider: 'DEADBEEF' } },
    { kind: 'command', command: { verb: 'START' } },
    { kind: 'school', tool: 'send_email' },
  ]) assert.equal(personalPlanSchema.safeParse({ ...base, action }).success, false);
  assert.equal(personalPlanSchema.safeParse({ ...base, reports: [{ caseId: randomUUID(), stepId: randomUUID(), text: 'Done', verified: true }] }).success, false);
});

test('exact controls bypass reasoning but ordinary requests beginning with command words do not', () => {
  for (const text of ['YES DEADBEEF', 'YES', 'STOP', 'READ ABCDEF12', 'CONNECT WEX', 'CONNECT CAFEBABE']) assert.equal(isPersonalControl(text), true, text);
  for (const text of ['Read the school report and check my plan', 'No our school changed', 'Update my insurance information', 'Connect the school request to my benefits', 'Enroll Emma in school']) assert.equal(isPersonalControl(text), false, text);
});

test('private model errors never echo response bodies into logs; timeouts reach fetch', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const logs: string[] = [];
  const signal = AbortSignal.timeout(1000);
  try {
    console.warn = (...args) => { logs.push(args.join(' ')); };
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.signal, signal);
      return new Response('PRIVATE MEDICAL TEXT FROM VENDOR', { status: 500 });
    };
    const llm = new LlmClient({ apiKey: 'fictional', baseUrl: 'https://fixture.invalid', model: 'fixture' });
    assert.equal(await llm.completeJson('fixture', 'fictional input', { signal, private: true }), null);
    assert.doesNotMatch(logs.join(' '), /PRIVATE MEDICAL/);
    assert.match(logs.join(' '), /500/);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});
