import { Agent } from '../src/agent/agent.js';
import { LlmClient } from '../src/agent/llm.js';
import { RulesIntentEngine } from '../src/agent/intent/rules.js';
import { MockCalendarProvider } from '../src/integrations/calendar.js';
import { MockMealsProvider } from '../src/integrations/meals.js';
import { MockSis } from '../src/integrations/sis.js';
import { createEmailProvider } from '../src/integrations/email.js';
import { createSeedDb, provisionFamily } from '../src/seed.js';
import { redactForLog } from '../src/agent/tools.js';
import { grantDomain, resetGrantsForTest } from '../src/agent/authorization.js';
import type { Step } from '../src/agent/steps/types.js';
import type { ConversationState } from '../src/agent/state.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ID = 'consent-test-conv';

function makeEmailStep(): Step {
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

/**
 * SAFETY: this suite must never be able to send real mail. `railway run` injects the service's
 * RESEND_API_KEY/EMAIL_FROM, and the executor picks its provider from the ambient env — which is
 * how a sibling test once sent a message to a school-shaped address. Strip the credentials, then
 * assert the effective provider is a mock.
 */
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
{
  const provider = createEmailProvider();
  if (provider.constructor.name !== 'MockEmailProvider') {
    console.error(`REFUSING TO RUN: a real email provider (${provider.constructor.name}) is configured.`);
    process.exit(2);
  }
}

/** A staged form submit — the step a parent amends with "yes last name Howard". */
function makeSubmitStep(): Step {
  return {
    id: 'submit-test',
    caseId: 'form',
    intent: 'submit_form',
    channel: 'submit',
    counterparty: { role: 'OTHER' },
    payload: {
      channel: 'submit',
      url: 'https://world.example/apply',
      values: { child_first_name: 'Patrick', child_last_name: 'Grom', grade: '1', parent_email: 'parent@example.test', address: '1 Main St' },
    },
    successCondition: { describe: 'Form submitted', kind: 'reference_received' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };
}

function makeAgent(llm?: LlmClient, email?: import('../src/integrations/email.js').EmailProvider): Agent {
  const db = createSeedDb();
  // The seed has no parents/students; create + provision one so buildToolContext resolves.
  db.parents.push({ id: 'parent-maya', phone: '15555550100', email: '', firstName: 'Maya', lastName: 'Lee', studentIds: [] });
  provisionFamily(db, 'parent-maya', {
    children: [{ name: 'Emma', grade: '3rd' }],
    school: 'Soquel Elementary School',
    district: 'Soquel Union Elementary School District',
    schoolType: 'public',
    needs: ['speech'],
    challenges: ['speech'],
  });
  return new Agent({
    llm,
    intentEngine: new RulesIntentEngine(),
    sis: new MockSis(db),
    calendar: new MockCalendarProvider(),
    meals: new MockMealsProvider({}),
    db,
    defaultParentId: 'parent-maya',
    requireVerification: false,
    email: email ?? createEmailProvider(),
  });
}

async function main(): Promise<void> {
  const agent = makeAgent();

  // Seed a pending consent-gated step (as the intelligence layer / brain would after a proposal).
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);

  // 1. A non-consent reply must EXPOSE the proposal and NOT execute anything.
  const stray = await agent.handle(ID, 'ok thanks');
  check('"ok thanks" does NOT execute (no "Done!")', !stray.text.includes('Done!'), stray.text.slice(0, 60));
  check('"ok thanks" expires the pending steps', !agent.getStateForTest(ID)?.pendingSteps?.length, JSON.stringify(agent.getStateForTest(ID)?.pendingSteps));

  // 2. A strict consent reply DOES execute (via the mock email provider).
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);
  const yes = await agent.handle(ID, 'submit it');
  check('"submit it" executes (returns "Done!")', yes.text.includes('Done!'), yes.text.slice(0, 60));
  check('"submit it" clears pending steps after execution', !agent.getStateForTest(ID)?.pendingSteps?.length);

  // 3. "submit it" to a context with a stray affirmative word (e.g. "go") — only whole-message match counts.
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);
  const okWord = await agent.handle(ID, 'go');
  check('whole-message "go" is a valid consent', okWord.text.includes('Done!'), okWord.text.slice(0, 60));
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] } as ConversationState);
  const okThanks2 = await agent.handle(ID, 'yes please');
  check('"yes please" is a valid consent', okThanks2.text.includes('Done!'), okThanks2.text.slice(0, 60));

  // 3b. "YES <amendment>" — approval of the pending step WITH a change.
  // This is the real-thread failure: a parent answered "YES Last name Howard" to "Reply YES to
  // submit, or tell me what to change", the strict matcher did not recognise it, and the
  // not-a-clear-yes/no branch EXPIRED the staged submit — silently destroying the work and
  // starting over. An amendment must never expire the proposal, never execute, and never guess.
  {
    const outbox: Array<{ to?: string; subject?: string; body?: string }> = [];
    const capture = { send: async (m: { to?: string; subject?: string; body?: string }) => { outbox.push(m); return { id: 'test-1' }; } };
    const amendAgent = makeAgent(undefined, capture as never);
    const staged = () => amendAgent.getStateForTest(ID)?.pendingSteps?.[0];
    const values = () => (staged()?.payload as { values: Record<string, string> } | undefined)?.values ?? {};

    // (a) the exact production message
    amendAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const a = await amendAgent.handle(ID, 'YES Last name Howard');
    check('"yes last name Howard" keeps the step staged (does NOT expire it)', amendAgent.getStateForTest(ID)?.pendingSteps?.length === 1);
    check('...applies the amendment to the staged payload', values().child_last_name === 'Howard', JSON.stringify(values()));
    check('...does NOT execute anything', !a.text.includes('Done!') && outbox.length === 0, a.text.slice(0, 60));
    check('...re-shows the changed proposal and asks for YES again', /Howard/.test(a.text) && /reply yes/i.test(a.text), a.text.slice(0, 160));

    // (b) an address amendment
    amendAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const b = await amendAgent.handle(ID, 'yes use 456 Oak Ave');
    check('"yes use 456 Oak Ave" applies the address', values().address === '456 Oak Ave', JSON.stringify(values()));
    check('...and is still awaiting their YES', amendAgent.getStateForTest(ID)?.pendingSteps?.length === 1 && !b.text.includes('Done!'));

    // (c) "yes but change the grade to 2" — re-confirm, never auto-execute changed values
    amendAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const c = await amendAgent.handle(ID, 'yes but change the grade to 2');
    check('"yes but change the grade to 2" applies the change', values().grade === '2', JSON.stringify(values()));
    check('...and asks for a fresh YES because the proposal changed', amendAgent.getStateForTest(ID)?.pendingSteps?.length === 1 && !c.text.includes('Done!') && /reply yes/i.test(c.text));

    // (d) extra words that are NOT an amendment: do not guess, do not expire
    amendAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const d = await amendAgent.handle(ID, 'yes what about the other one');
    check('"yes what about the other one" does NOT execute', !d.text.includes('Done!') && outbox.length === 0);
    check('...and does NOT expire the proposal either', amendAgent.getStateForTest(ID)?.pendingSteps?.length === 1, d.text.slice(0, 120));
    check('...it asks what to change instead', /change/i.test(d.text), d.text.slice(0, 120));

    // (e) a retraction kills the proposal, and a later "yes" cannot resurrect it
    amendAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const e = await amendAgent.handle(ID, 'no wait');
    check('"no wait" does not execute', outbox.length === 0 && !e.text.includes('Done!'));
    check('"no wait" clears the staged proposal', !amendAgent.getStateForTest(ID)?.pendingSteps?.length);
    const e2 = await amendAgent.handle(ID, 'yes');
    check('a later "yes" cannot fire the retracted proposal', outbox.length === 0 && !e2.text.includes('Done!'));

    // (f) HARD INVARIANT: a question never executes a pending step, even mid-proposal
    amendAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const f = await amendAgent.handle(ID, 'what does that form need from me?');
    check('a question never executes a pending step', outbox.length === 0 && !f.text.includes('Done!'));

    // (g) and the plain path still works: a bare YES executes exactly once
    amendAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()] });
    const g = await amendAgent.handle(ID, 'yes');
    check('a bare YES still executes the pending step', g.text.includes('Done!') && outbox.length === 1, g.text.slice(0, 60));
  }

  // 3b-ii. A CHANGE REQUEST with no affirmation — the second hole in the same flow.
  // The review message ends "Reply YES to submit, or tell me what to change." A bare change
  // request is not an affirmation, so the old gate expired the proposal: the parent was invited
  // to say exactly this and it destroyed the staged work. A change must keep the work, apply what
  // we can read, re-show it, and execute NOTHING.
  {
    const outbox: Array<{ to?: string; subject?: string; body?: string }> = [];
    const capture = { send: async (m: { to?: string; subject?: string; body?: string }) => { outbox.push(m); return { id: 'test-1' }; } };
    const crAgent = makeAgent(undefined, capture as never);
    const staged = () => crAgent.getStateForTest(ID)?.pendingSteps?.[0];
    const values = () => (staged()?.payload as { values: Record<string, string> } | undefined)?.values ?? {};

    // (a) the exact message the review invites
    crAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const a = await crAgent.handle(ID, 'change the last name to Howard');
    check('"change the last name to Howard" keeps the step staged', crAgent.getStateForTest(ID)?.pendingSteps?.length === 1, a.text.slice(0, 90));
    check('...applies the change to the staged payload', values().child_last_name === 'Howard', JSON.stringify(values()));
    check('...does NOT execute anything', !a.text.includes('Done!') && outbox.length === 0, a.text.slice(0, 60));
    check('...re-shows the changed proposal and asks for YES', /Howard/.test(a.text) && /reply yes/i.test(a.text), a.text.slice(0, 160));

    // (b) another phrasing, and the earlier edit must not be lost
    const b = await crAgent.handle(ID, 'actually make it grade 2');
    check('"actually make it grade 2" applies the change', values().grade === '2', JSON.stringify(values()));
    check('...and the earlier edit survives (the proposal is amended, not replaced)', values().child_last_name === 'Howard', JSON.stringify(values()));
    check('...still staged, still not executed', crAgent.getStateForTest(ID)?.pendingSteps?.length === 1 && outbox.length === 0);

    // (c) a refusal that also names the change is NOT a cancellation. Decision (documented in
    // src/agent/agent.ts and consent.ts): the parent is declining to approve, not abandoning the
    // work, so we apply the change where we can read it and ask again. We never execute.
    crAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const c = await crAgent.handle(ID, 'no, change the last name to Howard');
    check('"no, change the last name to Howard" does NOT execute', outbox.length === 0 && !c.text.includes('Done!'), c.text.slice(0, 60));
    check('...does NOT cancel the staged work either', crAgent.getStateForTest(ID)?.pendingSteps?.length === 1, c.text.slice(0, 90));
    check('...applies the named change', values().child_last_name === 'Howard', JSON.stringify(values()));

    // (d) a change we cannot place on a field: ask, keep the work, never guess a field
    crAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
    const d = await crAgent.handle(ID, 'change it to Howard');
    check('"change it to Howard" keeps the work and asks which field', crAgent.getStateForTest(ID)?.pendingSteps?.length === 1 && /which field/i.test(d.text), d.text.slice(0, 140));
    check('...and never executes on a vague instruction', outbox.length === 0 && !d.text.includes('Done!'));

    // (d2) THE SHORTEST FORM OF OUR OWN INVITATION. The review message ends "Reply YES to submit,
    // or tell me what to change", so a bare "change it" is the parent doing exactly what we asked.
    // It was matched as a whole-message DECLINE, which expired the proposal and destroyed the work.
    for (const bare of ['change it', 'update it', 'edit it']) {
      crAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
      const r = await crAgent.handle(ID, bare);
      check(`"${bare}" keeps the work and asks which field`, crAgent.getStateForTest(ID)?.pendingSteps?.length === 1 && /which field/i.test(r.text), r.text.slice(0, 130));
      check(`"${bare}" never executes`, outbox.length === 0 && !r.text.includes('Done!'));
    }

    // (d3) ...while genuine refusals that merely read like the change verbs still decline.
    for (const decline of ['no', 'cancel', 'cancel it', 'forget it']) {
      crAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
      const r = await crAgent.handle(ID, decline);
      check(`"${decline}" still clears the work`, !crAgent.getStateForTest(ID)?.pendingSteps?.length, r.text.slice(0, 90));
      check(`"${decline}" does not execute`, outbox.length === 0 && !r.text.includes('Done!'));
    }

    // (e) REGRESSION GUARD: messages that are not change requests must still expire, or a stale
    // proposal lingers and a later "yes" could fire work the parent has moved on from.
    for (const unrelated of ['what about the bus?', 'ok thanks', 'the office said we should change the address to 456 Oak Ave because we moved']) {
      crAgent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeSubmitStep()] });
      const r = await crAgent.handle(ID, unrelated);
      check(`"${unrelated.slice(0, 34)}…" still expires the proposal`, !crAgent.getStateForTest(ID)?.pendingSteps?.length, r.text.slice(0, 80));
    }

    // (f) an amendment can never be applied to a DIFFERENT or stale proposal: with nothing staged,
    // the same change request is just a message and must not resurrect anything.
    crAgent.setStateForTest(ID, { phase: 'idle', collected: {} });
    const f = await crAgent.handle(ID, 'change the last name to Howard');
    check('a change request with nothing staged executes nothing', outbox.length === 0 && !f.text.includes('Done!'));
    check('...and stages nothing', !crAgent.getStateForTest(ID)?.pendingSteps?.length);
  }

  // 3c. The amendment parser itself, at the unit level.
  {
    const { parseConsentAmendment, amendmentHasEdits, applyAmendmentToSteps } = await import('../src/agent/steps/consent.js');
    const p1 = parseConsentAmendment('yes last name Howard');
    check('parser: "yes last name Howard" is an amendment', Boolean(p1) && p1!.changes[0]?.field === 'last_name' && p1!.changes[0]?.value === 'Howard');
    const p2 = parseConsentAmendment('yes');
    check('parser: a bare "yes" is NOT an amendment (strict consent owns it)', p2 === null);
    const p3 = parseConsentAmendment('ok thanks');
    check('parser: "ok thanks" is not an amendment (it stays an expiry)', p3 === null);
    check('parser: "yes what about the other one" has no edits', Boolean(parseConsentAmendment('yes what about the other one')) && !amendmentHasEdits(parseConsentAmendment('yes what about the other one')!));
    check('parser: a question is not an amendment', parseConsentAmendment('what about the bus?') === null);
    check('parser: a decline is not an amendment', parseConsentAmendment('no wait') === null);
    const { parseChangeRequest } = await import('../src/agent/steps/consent.js');
    const cr1 = parseChangeRequest('change the last name to Howard');
    check('parser: a bare change request is readable', cr1?.kind === 'apply' && cr1.amendment.changes[0]?.field === 'last_name' && cr1.amendment.changes[0]?.value === 'Howard');
    check('parser: a bare affirmation is NOT a change request (disjoint from consent)', parseChangeRequest('yes') === null);
    check('parser: "ok thanks" is not a change request', parseChangeRequest('ok thanks') === null);
    check('parser: a question is not a change request', parseChangeRequest('what about the bus?') === null);
    check('parser: a plain decline is not a change request', parseChangeRequest('no thanks') === null);
    check('parser: an unrunnable change asks instead of guessing', parseChangeRequest('change it to Howard')?.kind === 'ask');
    check('parser: a bare "change it" asks rather than expiring', parseChangeRequest('change it')?.kind === 'ask');
    check('parser: a bare "update it" asks too', parseChangeRequest('update it')?.kind === 'ask');
    check('parser: "cancel it" is NOT a change request', parseChangeRequest('cancel it') === null);
    check('parser: "forget it" is NOT a change request', parseChangeRequest('forget it') === null);
    check('parser: a narrative that merely mentions a change is not a change request', parseChangeRequest('the office said we should change the address to 456 Oak Ave because we moved') === null);
    check('parser: a non-value is not applied ("my email is different")', parseChangeRequest('change my email to different')?.kind === 'ask');
    check('parser: a real email value IS applied', parseChangeRequest('change the email to parent@example.com')?.kind === 'apply');

    const parsed = parseConsentAmendment('yes last name Howard and grade 2')!;
    check('parser: reads two edits from one message', parsed.changes.length === 2);
    const applied = applyAmendmentToSteps([makeSubmitStep()], { changes: [{ field: 'last_name', value: 'Howard' }], unparsed: [] });
    check('apply: reports what it changed', applied.applied.length === 1 && applied.unapplied.length === 0);
    const missing = applyAmendmentToSteps([makeSubmitStep()], { changes: [{ field: 'dob', value: '2019-04-02' }], unparsed: [] });
    check('apply: a field the form does not have is reported, never invented', missing.applied.length === 0 && missing.unapplied.length === 1);
    const onEmail = applyAmendmentToSteps([makeEmailStep()], { changes: [{ field: 'last_name', value: 'Howard' }], unparsed: [] });
    check('apply: a name edit is NOT silently rewritten into an email body', onEmail.applied.length === 0 && onEmail.unapplied.length === 1);
    const added = applyAmendmentToSteps([makeEmailStep()], { changes: [], unparsed: [], appendBody: 'mention the bus' });
    check('apply: an email body addition does apply', added.applied.length === 1);
  }

  // 4. Sensitive creds AND family PII must be redacted from any logged args. The log
  // store must not become a second copy of the family's data (a real leak: child name,
  // school and parent email were reaching production logs through tool arguments).
  const redacted = redactForLog({ password: 'hunter2', code: '123456', url: 'https://x', fields: [{ label: 'Password', value: 'hunter2' }, { label: 'Email', value: 'a@b.com' }] }) as Record<string, unknown>;
  check('password redacted', redacted.password === '[redacted]', JSON.stringify(redacted));
  check('code redacted', redacted.code === '[redacted]', JSON.stringify(redacted));
  check('sensitive labeled field redacted', (redacted.fields as Array<{ label: string; value: string }>)[0]!.value === '[redacted]', JSON.stringify(redacted.fields));
  check('email in a labeled field is redacted', (redacted.fields as Array<{ label: string; value: string }>)[1]!.value === '[redacted]', JSON.stringify(redacted.fields));
  check('url preserved', redacted.url === 'https://x');

  // 4b. Family PII in tool arguments never reaches a log line.
  const fill = redactForLog({
    url: 'https://ps134.org/afterschool/',
    values: { first_name: 'Patrick', last_name: 'Grom', grade: '1st', school: 'P.S. 134', parent_email: 'parent@example.com', phone: '+18315550100' },
  }) as { url: string; values: Record<string, string> };
  check('child + parent PII in fill values redacted', Object.values(fill.values).every((v) => v === '[redacted]'), JSON.stringify(fill.values));
  check('the URL being filled is still visible for debugging', fill.url === 'https://ps134.org/afterschool/');
  const shape = redactForLog({ note: 'reach me at parent@example.com or +1 (831) 555-0100', sent_to: 'maya@school.org', alt: '831-555-0100', bare: '8315550100' }) as Record<string, string>;
  check('email masked by SHAPE even under an unknown key', shape.sent_to === '[email]', JSON.stringify(shape));
  check('email + phone masked inside free text', !/parent@example\.com|555-0100|5550100/.test(shape.note ?? ''), JSON.stringify(shape));
  check('formatted and bare phone numbers both masked', shape.alt === '[number]' && shape.bare === '[number]', JSON.stringify(shape));
  // Debuggability must survive: run ids and long numeric ids are NOT phone numbers.
  const ids = redactForLog({ run_id: 'tsk_576233651510202774', claim: 'CLM-F53C498F', ts: '2026-09-19T20:00:53Z' }) as Record<string, string>;
  check('a Skyvern run id is preserved for diagnosis', ids.run_id === 'tsk_576233651510202774' && ids.claim === 'CLM-F53C498F', JSON.stringify(ids));
  check('an ISO timestamp is preserved', ids.ts === '2026-09-19T20:00:53Z', JSON.stringify(ids));

  // A diverted life command expires the old school proposal, never authorizes it.
  agent.setStateForTest(ID, { phase: 'confirming', collected: {}, pendingSteps: [makeEmailStep()], pendingCall: true });
  agent.expirePendingConsent(ID);
  check('life control clears school consent and call flags', !agent.getStateForTest(ID)?.pendingSteps && !agent.getStateForTest(ID)?.pendingCall);
  const afterLife = await agent.handle(ID, 'YES');
  check('YES after a life control cannot execute an old school step', !afterLife.text.includes('Done!'));

  // Exercise the real Agent tool loop, not just the new tool dispatcher.
  const llm = new LlmClient({ apiKey: 'fixture', baseUrl: 'https://fixture.invalid', model: 'fixture' });
  const results: string[] = [];
  const offered: string[][] = [];
  const systems: string[] = [];
  llm.chatWithTools = async (system, messages, tools) => {
    const turns = messages as Array<{ role: string; content?: string }>;
    if (!turns.some(m => m.role === 'tool')) {
      systems.push(system);
      offered.push(tools.map(t => (t as { function: { name: string } }).function.name));
      return { calls: [
        { id: 'context', name: 'get_life_context', arguments: '{}' },
        { id: 'plan', name: 'plan_life_work', arguments: JSON.stringify({ reply: 'Plan saved', facts: [], newCases: [], reports: [] }) },
        { id: 'school', name: 'send_email', arguments: JSON.stringify({ to: 'sped@district.edu', subject: 'Paperwork', body: 'Please share the form.' }) },
      ] };
    }
    results.push(...turns.filter(m => m.role === 'tool').map(m => m.content ?? ''));
    return { text: 'I drafted the school email for your approval.' };
  };
  const unified = makeAgent(llm);
  const seed = () => ({ phase: 'idle' as const, collected: {}, onboarded: true, emailProofSent: true,
    profile: { children: [{ name: 'Emma' }], school: 'Fictional School', needs: [], challenges: [] } });
  // The recipient control (workstream 4) refuses any address the family does not hold, and it is
  // right to: fixture@example.invalid is on no record. A real family gets a school on record by
  // being emailed by it (triage stores the sender), and the parent can also grant a domain — which
  // is exactly what the denial copy offers. Model that gate honestly rather than loosening the
  // control: nothing is staged until the domain is held.
  resetGrantsForTest();
  unified.setStateForTest('with-life', seed());
  // (The denial direction — an address supplied by content, and one we simply do not hold — is
  // proven exhaustively in scripts/test-authorization.ts. Not duplicated here, because running an
  // extra turn through this shared mock would shift the captured prompt/tool arrays that the
  // life-tools assertions below read by index.)
  grantDomain('parent-maya', 'example.invalid');

  let plans = 0;
  await unified.handle('with-life', 'Help me organize paperwork and email sped@district.edu', {
    context: async () => ({ enrolled: true, marker: 'only-this-sender' }),
    plan: async () => { plans++; return 'Saved one plan'; },
  });
  check('same brain offers both life and school tools', ['get_life_context', 'plan_life_work', 'send_email'].every(n => offered[0]!.includes(n)));
  check('same turn reads life context and saves a plan', plans === 1 && results.some(r => r.includes('only-this-sender')));
  check('same turn still stages school email for consent', unified.getStateForTest('with-life')?.pendingSteps?.[0]?.requiresConsent === true);
  check('...staged because the PARENT supplied that address (not an operator allowlist)', unified.getStateForTest('with-life')?.pendingSteps?.[0]?.requiresConsent === true);
  results.length = 0;
  unified.setStateForTest('without-life', seed());
  await unified.handle('without-life', 'Help me organize paperwork and email sped@district.edu');
  check('life binding cannot leak into the next sender', plans === 1 && !results.some(r => r.includes('only-this-sender')) && results.some(r => r.includes('not enabled')));
  check('school email still available without life enrollment', unified.getStateForTest('without-life')?.pendingSteps?.[0]?.requiresConsent === true);
  // The school agent a plain parent talks to must be school-only: no benefits tools
  // offered, and no benefits instructions in its prompt.
  check('a sender without life tools is never offered benefits tools', !offered[1]!.includes('get_life_context') && !offered[1]!.includes('plan_life_work') && offered[1]!.includes('send_email'));
  check('a sender without life tools gets a school-only prompt', !/LIFE AND BENEFITS|get_life_context|plan_life_work/.test(systems[1] ?? ''));
  check('life-enabled prompt still carries the benefits instructions', /LIFE AND BENEFITS/.test(systems[0] ?? ''));

  console.log('\n========================================');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('========================================');
  if (fail > 0) process.exit(1);
}

void main();
