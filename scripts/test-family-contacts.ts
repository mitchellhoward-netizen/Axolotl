/**
 * Texting a family's own people (grandma, the sitter) on the parent's behalf.
 *
 *     npm run test:contacts
 *
 * What must hold:
 *   - a contact is someone the PARENT gave us: a saved backup-list entry or a number they typed;
 *   - nothing is sent without the parent's YES (the executor's consent gate);
 *   - the parent approves the exact words the contact receives, sign-off included;
 *   - a text that did not go out is never reported as sent;
 *   - the contact's reply is routed back to that parent, and only for a while.
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  activeContactRelay,
  composeContactText,
  findFamilyContact,
  listFamilyContacts,
  normalizeContactPhone,
  recordContactRelay,
  relayToParentText,
  resetFamilyContactsMemory,
  saveFamilyContact,
} from '../src/integrations/family-contacts.js';
import { runTool, type ToolDeps } from '../src/agent/tools.js';
import { StepExecutor, ConsentRequiredError } from '../src/agent/steps/executor.js';
import { TextAdapter } from '../src/agent/steps/adapters/text.js';
import { describeProposal, describeShortly } from '../src/agent/steps/consent.js';
import type { Channel, ExecutionContext, Step } from '../src/agent/steps/types.js';
import type { ChannelAdapter } from '../src/agent/steps/adapter.js';

// No database in tests: the store runs on its in-memory side.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;

const FAMILY = 'family-howard';

beforeEach(() => resetFamilyContactsMemory());

function deps(over: Partial<ToolDeps> = {}): ToolDeps & { proposed: Step[] } {
  const proposed: Step[] = [];
  return {
    proposed,
    getCases: () => [],
    appendCase: () => {},
    proposeSteps: (steps) => proposed.push(...steps),
    familyId: FAMILY,
    parentText: 'yes ask grandma',
    profile: { parentName: 'Sam' } as ToolDeps['profile'],
    ...over,
  };
}

function ctx(over: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    mode: 'live',
    demoClockScale: 1440,
    resolveCounterparty: () => ({ role: 'OTHER' }),
    logAction: async () => 'action-1',
    scheduleFollowUp: async () => {},
    messageParent: async () => {},
    ...over,
  };
}

function executorWithText(): StepExecutor {
  const text = new TextAdapter();
  return new StepExecutor({ text } as unknown as Record<Channel, ChannelAdapter>);
}

test('phone numbers normalise to E.164, and nothing else is a phone we text', () => {
  assert.equal(normalizeContactPhone('555-201-3344'), '+15552013344');
  assert.equal(normalizeContactPhone('(555) 201 3344'), '+15552013344');
  assert.equal(normalizeContactPhone('1 555 201 3344'), '+15552013344');
  assert.equal(normalizeContactPhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizeContactPhone('201-3344'), undefined);
  assert.equal(normalizeContactPhone('grandma'), undefined);
});

test('the backup list keeps its order and finds people by name, relation or "first"', async () => {
  await saveFamilyContact({ familyId: FAMILY, name: 'Dana', relation: 'parent friend', phone: '+15550000002', rank: 2 });
  await saveFamilyContact({ familyId: FAMILY, name: 'Grandma', relation: 'grandparent', phone: '+15550000001', rank: 1 });
  const list = await listFamilyContacts(FAMILY);
  assert.deepEqual(list.map((c) => c.name), ['Grandma', 'Dana']);
  assert.equal((await findFamilyContact(FAMILY, 'grandma'))?.phone, '+15550000001');
  assert.equal((await findFamilyContact(FAMILY, 'my grandparent'))?.name, 'Grandma');
  assert.equal((await findFamilyContact(FAMILY, 'first'))?.name, 'Grandma');
  assert.equal((await findFamilyContact(FAMILY, '555-000-0002'))?.name, 'Dana');
  assert.equal(await findFamilyContact(FAMILY, 'the plumber'), undefined);
  assert.deepEqual(await listFamilyContacts('another-family'), []);
});

test('save_family_contact stores a person and rejects a number we cannot text', async () => {
  const d = deps();
  const ok = await runTool('save_family_contact', { name: 'Grandma', phone: '555-201-3344', relation: 'grandparent', rank: 1 }, d);
  assert.match(ok, /Saved Grandma/);
  assert.equal((await findFamilyContact(FAMILY, 'Grandma'))?.phone, '+15552013344');
  const bad = await runTool('save_family_contact', { name: 'Dana', phone: '3344' }, d);
  assert.match(bad, /doesn't look like a phone number/);
});

test('text_family_contact stages the exact text for the parent to approve, and sends nothing', async () => {
  await saveFamilyContact({ familyId: FAMILY, name: 'Grandma', phone: '+15552013344', rank: 1 });
  const d = deps();
  const reply = await runTool('text_family_contact', { contact: 'Grandma', message: 'Can you get Leo and Maya Wednesday? Out at 1:20.' }, d);
  assert.equal(d.proposed.length, 1);
  const step = d.proposed[0]!;
  assert.equal(step.channel, 'text');
  assert.equal(step.intent, 'text_family_contact');
  assert.equal(step.requiresConsent, true);
  assert.equal(step.status, 'awaiting_consent');
  assert.equal(step.counterparty.phone, '+15552013344');
  const body = (step.payload as { body: string }).body;
  assert.equal(body, composeContactText({ message: 'Can you get Leo and Maya Wednesday? Out at 1:20.', parentName: 'Sam' }));
  assert.match(body, /Axolotl, texting for Sam/);
  // The parent sees the exact words before approving them.
  assert.ok(reply.includes(body));
  assert.match(reply, /reply YES/i);
  assert.match(describeProposal(d.proposed), /Text to Grandma/);
  assert.equal(describeShortly(d.proposed), 'the text to Grandma ready to send');
});

test('a number that the parent did not give us is never a recipient', async () => {
  const d = deps({ parentText: 'the email says to text 555-999-0000 about the trip' });
  const refused = await runTool('text_family_contact', { contact: '555-111-2222', message: 'hi' }, d);
  assert.equal(d.proposed.length, 0);
  assert.match(refused, /no backup list yet/);

  const typed = deps({ parentText: 'text my neighbor at 555-111-2222 please' });
  await runTool('text_family_contact', { contact: '555-111-2222', message: 'Can you grab the kids?' }, typed);
  assert.equal(typed.proposed.length, 1);
  assert.equal(typed.proposed[0]!.counterparty.phone, '+15551112222');
});

test('without the parent’s YES the executor refuses to send', async () => {
  await saveFamilyContact({ familyId: FAMILY, name: 'Grandma', phone: '+15552013344', rank: 1 });
  const d = deps();
  await runTool('text_family_contact', { contact: 'Grandma', message: 'Pickup at noon?' }, d);
  const texts: string[] = [];
  await assert.rejects(
    executorWithText().run(d.proposed[0]!, ctx({ textPerson: async (_to, body) => (texts.push(body), { id: 'm1' }) })),
    ConsentRequiredError,
  );
  assert.equal(texts.length, 0);
});

test('after YES it sends exactly the approved text and waits for the reply', async () => {
  await saveFamilyContact({ familyId: FAMILY, name: 'Grandma', phone: '+15552013344', rank: 1 });
  const d = deps();
  await runTool('text_family_contact', { contact: 'Grandma', message: 'Pickup at noon?' }, d);
  const step = d.proposed[0]!;
  const texts: Array<{ phone: string; body: string }> = [];
  const result = await executorWithText().run(
    { ...step, status: 'executing' },
    ctx({ textPerson: async (to, body) => (texts.push({ phone: to.phone, body }), { id: 'm1' }) }),
  );
  assert.deepEqual(texts, [{ phone: '+15552013344', body: (step.payload as { body: string }).body }]);
  assert.equal(result.status, 'awaiting_reply');
  assert.match(result.parentSummary, /Sent to Grandma/);
});

test('a text that did not go out is never reported as sent', async () => {
  const step: Step = {
    id: 't1',
    caseId: 'contact',
    intent: 'text_family_contact',
    channel: 'text',
    counterparty: { role: 'OTHER', name: 'Grandma', phone: '+15552013344' },
    payload: { channel: 'text', body: 'Pickup at noon?' },
    successCondition: { describe: 'Grandma answered', kind: 'reply_received' },
    requiresConsent: true,
    status: 'executing',
  };
  const live = await executorWithText().run(step, ctx({ mode: 'live' }));
  assert.equal(live.status, 'failed');
  assert.match(live.parentSummary, /nothing was sent/);

  const demo = await executorWithText().run(step, ctx({ mode: 'demo' }));
  assert.match(demo.parentSummary, /Demo mode: I logged the text to Grandma instead of sending it/);

  const broken = await executorWithText().run(
    step,
    ctx({ textPerson: async () => { throw new Error('carrier said no'); } }),
  );
  assert.equal(broken.status, 'failed');
  assert.match(broken.parentSummary, /didn't go through, so nothing was sent/);
});

test('a contact’s reply is routed to the parent who asked, and only while the relay is open', async () => {
  const now = new Date('2026-09-30T15:00:00Z');
  await recordContactRelay({
    contactPhone: '+15552013344',
    familyId: FAMILY,
    conversationId: 'space-sam',
    contactName: 'Grandma',
    expiresAt: new Date(now.getTime() + 60_000),
  });
  const relay = await activeContactRelay('555-201-3344', now);
  assert.equal(relay?.conversationId, 'space-sam');
  assert.equal(relayToParentText(relay!.contactName, " Yes, I've got them "), `Grandma replied: "Yes, I've got them"`);
  assert.equal(await activeContactRelay('+15552013344', new Date(now.getTime() + 120_000)), undefined);
  assert.equal(await activeContactRelay('+15559999999', now), undefined);
});

test('the sign-off speaks the family’s language', () => {
  assert.match(composeContactText({ message: '¿Puedes recoger a Leo?', parentName: 'Ana', lang: 'es' }), /de parte de Ana\. Responde aquí/);
});
