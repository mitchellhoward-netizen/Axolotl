/**
 * A parent's yes is bound to the exact proposal they were shown (src/agent/steps/approval.ts,
 * wired into the gate at the top of Agent.handleTurn), and they never type anything but their
 * answer: no codes. Run: npm run test:approval
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent/agent.js';
import { RulesIntentEngine } from '../src/agent/intent/rules.js';
import { MockCalendarProvider } from '../src/integrations/calendar.js';
import { MockMealsProvider } from '../src/integrations/meals.js';
import { MockSis } from '../src/integrations/sis.js';
import { createSeedDb, provisionFamily } from '../src/seed.js';
import { checkApproval, consentRecord, invitesYes, proposalDigest, shownIn, stampApproval } from '../src/agent/steps/approval.js';
import { describeProposal } from '../src/agent/steps/consent.js';
import type { Step } from '../src/agent/steps/types.js';

// Never let a run send real mail (see test-consent.ts for why).
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const ID = 'approval-test-conv';

function emailStep(body = 'Please evaluate Emma for speech.'): Step {
  return {
    id: 'email-test',
    caseId: 'email',
    intent: 'send_email',
    channel: 'email',
    counterparty: { role: 'OTHER', email: 'sped@district.edu' },
    payload: { channel: 'email', subject: 'Speech request for Emma', body },
    successCondition: { describe: 'Email the request', kind: 'reference_received' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };
}

function submitStep(values: Record<string, string>): Step {
  return {
    id: 'submit-test',
    caseId: 'form',
    intent: 'submit_form',
    channel: 'submit',
    counterparty: { role: 'OTHER' },
    payload: { channel: 'submit', url: 'https://world.example/apply', values },
    successCondition: { describe: 'Form submitted', kind: 'reference_received' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };
}

function makeAgent(): { agent: Agent; outbox: unknown[] } {
  const outbox: unknown[] = [];
  const db = createSeedDb();
  db.parents.push({ id: 'parent-maya', phone: '15555550100', email: '', firstName: 'Maya', lastName: 'Lee', studentIds: [] });
  provisionFamily(db, 'parent-maya', {
    children: [{ name: 'Emma', grade: '3rd' }],
    school: 'Soquel Elementary School',
    district: 'Soquel Union Elementary School District',
    schoolType: 'public',
    needs: ['speech'],
    challenges: ['speech'],
  });
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
  return { agent, outbox };
}

test('only a real invitation counts as asking for approval', () => {
  assert.ok(invitesYes('Want me to submit it? Or tell me what to change.'));
  assert.ok(invitesYes('Tell me what to change, or say yes and I\u2019ll go ahead.'));
  assert.ok(invitesYes('Reply YES to submit.'));
  assert.ok(!invitesYes('Want me to look up the bus times too?'));
  assert.ok(!invitesYes('Reminder: picture day is Friday.'));
});

test('the digest changes with any consequential value and ignores the vendor session', () => {
  const a = submitStep({ first: 'Patrick', last: 'Grom' });
  const b = submitStep({ last: 'Grom', first: 'Patrick' });
  assert.equal(proposalDigest([a]), proposalDigest([b]), 'key order does not matter');
  (b.payload as { skyvernSessionId?: string }).skyvernSessionId = 'pbs_123';
  assert.equal(proposalDigest([a]), proposalDigest([b]), 'a browser session is not a value');
  const c = submitStep({ first: 'Patrick', last: 'Howard' });
  assert.notEqual(proposalDigest([a]), proposalDigest([c]));
});

test('checkApproval: not shown, changed, expired, stale', () => {
  const steps = [submitStep({ first: 'Patrick' })];
  const stamp = stampApproval(steps, 1_000);
  assert.deepEqual(checkApproval(steps, undefined, 1_000), { ok: false, reason: 'not_shown' });
  assert.deepEqual(checkApproval([submitStep({ first: 'Pat' })], stamp, 1_000), { ok: false, reason: 'changed' });
  assert.deepEqual(checkApproval(steps, stamp, stamp.expiresAt + 1), { ok: false, reason: 'expired' });
  assert.deepEqual(checkApproval(steps, { ...stamp, stale: true }, 1_000), { ok: false, reason: 'stale' });
  assert.deepEqual(checkApproval(steps, stamp, 1_000), { ok: true });
});

test('40 values: the review shows all 40, and a review missing one does not count as shown', () => {
  const values = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field_${i + 1}`, `value-${i + 1}`]));
  const steps = [submitStep(values)];
  const review = describeProposal(steps);
  for (let i = 1; i <= 40; i++) assert.ok(review.includes(`field_${i}: value-${i}`), `field_${i} shown`);
  assert.ok(shownIn([review], steps));
  assert.ok(!shownIn([review.replace('value-40', '')], steps));
});

test('a zip code is shown; a password is named but never echoed or logged', () => {
  const step = submitStep({ 'Zip code': '95073', Password: 'hunter2' });
  const review = describeProposal([step]);
  assert.match(review, /Zip code: 95073/);
  assert.match(review, /Password: \(hidden\)/);
  assert.ok(!review.includes('hunter2'));
  const record = consentRecord(step);
  assert.deepEqual(record.values, { 'Zip code': '95073' });
  assert.equal(record.digest, proposalDigest([step]));
});

test('an unshown proposal: yes runs nothing and shows every value; the next yes runs it', async () => {
  const { agent, outbox } = makeAgent();
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [emailStep()] });
  const first = await agent.handle(ID, 'yes');
  assert.equal(outbox.length, 0);
  assert.ok(!first.text.includes('Done!'));
  assert.match(first.text, /Please evaluate Emma for speech\./);
  assert.doesNotMatch(first.text, /\bYES \d{4}\b/, 'no codes');
  const second = await agent.handle(ID, 'yes');
  assert.ok(second.text.includes('Done!'), second.text);
  assert.equal(outbox.length, 1);
});

test('a shown proposal runs on a plain yes, in English or Spanish', async () => {
  for (const reply of ['yes', 'go ahead', 'send it', 'sí', 'dale', '👍']) {
    const { agent, outbox } = makeAgent();
    agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [emailStep()] });
    agent.showProposalForTest(ID);
    const r = await agent.handle(ID, reply);
    assert.ok(r.text.includes('Done!'), `${reply}: ${r.text.slice(0, 80)}`);
    assert.equal(outbox.length, 1, reply);
  }
});

test('changing one value after the review blocks the send and shows the new version', async () => {
  const { agent, outbox } = makeAgent();
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [emailStep()] });
  agent.showProposalForTest(ID);
  // Something rewrites the staged body after the parent saw it.
  const live = agent.getStateForTest(ID)!.pendingSteps![0]!;
  (live.payload as { body: string }).body = 'Please evaluate Emma and her brother.';
  const reply = await agent.handle(ID, 'yes');
  assert.equal(outbox.length, 0, 'nothing sent');
  assert.ok(!reply.text.includes('Done!'));
  assert.match(reply.text, /her brother/, 'the changed proposal is shown');
  assert.ok((await agent.handle(ID, 'yes')).text.includes('Done!'));
  assert.equal(outbox.length, 1);
});

test('an expired approval shows the proposal again and runs nothing', async () => {
  const { agent, outbox } = makeAgent();
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [emailStep()] });
  agent.showProposalForTest(ID);
  agent.getStateForTest(ID)!.pendingApproval!.expiresAt = Date.now() - 1;
  const reply = await agent.handle(ID, 'yes');
  assert.equal(outbox.length, 0);
  assert.match(reply.text, /while ago/);
  assert.equal(agent.getStateForTest(ID)?.pendingSteps?.length, 1, 'still staged');
});

test('after an unrelated message goes out, a yes gets one check in a sentence, then runs', async () => {
  const { agent, outbox } = makeAgent();
  const sent: string[] = [];
  agent.registerConversation(ID, async (t) => { sent.push(t); });
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [emailStep()] });
  agent.showProposalForTest(ID);
  await agent.sendToConversation(ID, 'Reminder: picture day is Friday.');
  const check = await agent.handle(ID, 'yes');
  assert.equal(outbox.length, 0, 'the yes might have been about picture day');
  assert.match(check.text, /want me to go ahead with the email ready to send\?/i);
  const r = await agent.handle(ID, 'yes');
  assert.ok(r.text.includes('Done!'), r.text);
  assert.equal(outbox.length, 1);
});

test('a review sent through the messenger arms the proposal without changing the text', async () => {
  const { agent } = makeAgent();
  const sent: string[] = [];
  agent.registerConversation(ID, async (t) => { sent.push(t); });
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [submitStep({ grade: '1', city: 'Soquel' })] });
  const review = 'I filled the form.\n\nWhat I entered:\n• grade: 1\n• city: Soquel\n\nWant me to submit it? Or tell me what to change.';
  await agent.sendToConversation(ID, review);
  assert.equal(sent[0], review);
  assert.ok(agent.getStateForTest(ID)?.pendingApproval);
});
