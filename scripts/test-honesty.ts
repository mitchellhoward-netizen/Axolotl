#!/usr/bin/env tsx
/**
 * Phase 1 trust fixes (docs/AGENT-PLAN.md): honest outcomes, per-field read-back, minimum data,
 * and attachments on the approved email step.
 *
 *   npx tsx --test scripts/test-honesty.ts
 *
 * No keys needed. The Stagehand read-back is tested through its pure half
 * (src/integrations/browser-formmap.ts) against a testworld-style page served on localhost and
 * parsed into a form map; the fill path is tested end to end against a fake Skyvern.
 */
// Never touch a real database or a real vendor from a test. dotenv does not override these.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.RESEND_API_KEY = '';
process.env.BROWSER_BACKEND = 'none';

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import * as cheerio from 'cheerio';

import {
  FORM_MAP_JS,
  planFill,
  readBack,
  clicksFor,
  detectConfirmation,
  selectionFor,
  type FormMap,
  type FillPlan,
} from '../src/integrations/browser-formmap.js';
import type { Step, ExecutionContext } from '../src/agent/steps/types.js';
import type { EmailMessage, EmailProvider } from '../src/integrations/email.js';

// ── A testworld-style form with a radio group, served locally ───────────────
const FORM_HTML = `<!doctype html><html><body>
<form action="/apply" method="post">
  <label for="fn">Student first name</label><input id="fn" name="first_name">
  <label for="ln">Student last name</label><input id="ln" name="last_name">
  <label for="ph">Parent phone</label><input id="ph" name="phone">
  <label for="zip">ZIP code</label><input id="zip" name="zip">
  <fieldset><legend>Grade level</legend>
    <label><input type="radio" name="grade" value="K"> Kindergarten</label>
    <label><input type="radio" name="grade" value="1"> 1st grade</label>
    <label><input type="radio" name="grade" value="2"> 2nd grade</label>
  </fieldset>
  <fieldset><legend>Days needed</legend>
    <label><input type="checkbox" name="days" value="mon"> Monday</label>
    <label><input type="checkbox" name="days" value="wed"> Wednesday</label>
    <label><input type="checkbox" name="days" value="fri"> Friday</label>
  </fieldset>
  <button type="submit">Submit</button>
</form></body></html>`;

interface Recorded { path: string; method: string; body: string }
const hits: Recorded[] = [];
let formEndpointReply: { code: number; body: string } = { code: 200, body: '{}' };
const skyvernTasks: Array<Record<string, unknown>> = [];

const server: Server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let body = '';
  for await (const chunk of req) body += chunk;
  hits.push({ path: url.pathname, method: req.method ?? '', body });
  const json = (code: number, b: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(b));
  };
  if (url.pathname === '/form') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(FORM_HTML);
  }
  if (url.pathname === '/endpoint') {
    res.writeHead(formEndpointReply.code, { 'Content-Type': 'application/json' });
    return res.end(formEndpointReply.body);
  }
  // Fake Skyvern: enough for a fill to start.
  if (url.pathname === '/v1/browser_sessions') return json(200, { browser_session_id: 'bs_honesty' });
  if (url.pathname === '/v1/run/tasks') {
    skyvernTasks.push(JSON.parse(body || '{}'));
    return json(200, { run_id: `run_${skyvernTasks.length}` });
  }
  if (url.pathname.startsWith('/v1/runs/')) return json(200, { status: 'running' });
  return json(404, {});
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const BASE = `http://127.0.0.1:${port}`;
process.env.SKYVERN_BASE_URL = BASE;
process.env.SKYVERN_API_KEY = 'test-key';
after(() => server.close());

/**
 * The test's stand-in for FORM_MAP_JS: the same rules (label → text field; fieldset legend →
 * option group; option text from its <label>), applied with cheerio to the served HTML.
 */
function formMapFromHtml(html: string): FormMap {
  const $ = cheerio.load(html);
  let n = 0;
  const fields: FormMap['fields'] = [];
  $('input, select, textarea').each((_, el) => {
    const t = ($(el).attr('type') ?? 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(t)) return;
    const id = $(el).attr('id');
    const label = (id ? $(`label[for="${id}"]`).text() : '') || $(el).attr('name') || '';
    fields.push({ label: label.trim(), selector: `[data-axl="${++n}"]`, type: t, value: String($(el).attr('value') ?? '') });
  });
  const optionGroups: FormMap['optionGroups'] = [];
  $('fieldset').each((_, fs) => {
    const inputs = $(fs).find('input[type="radio"], input[type="checkbox"]');
    if (!inputs.length) return;
    optionGroups.push({
      question: $(fs).find('legend').text().trim(),
      type: inputs.first().attr('type') === 'radio' ? 'radio' : 'checkbox',
      options: inputs.toArray().map((el) => ({
        label: $(el).closest('label').text().trim(),
        selector: `[data-axl-opt="${++n}"]`,
        checked: $(el).attr('checked') !== undefined,
      })),
    });
  });
  return { fields, optionGroups };
}

/** Apply a plan to a copy of the map, the way a correct fill would; `tamper` breaks it after. */
function simulateFill(map: FormMap, plan: FillPlan, tamper?: (m: FormMap) => void): FormMap {
  const m: FormMap = structuredClone(map);
  for (const t of plan.targets) {
    if (t.kind === 'field') {
      const f = m.fields.find((x) => x.selector === t.field.selector)!;
      f.value = t.want.value;
    } else {
      const g = m.optionGroups.find((x) => x.options[0]!.selector === t.group.options[0]!.selector)!;
      for (const sel of clicksFor(g, t.select)) {
        const o = g.options.find((x) => x.selector === sel)!;
        if (g.type === 'radio') for (const other of g.options) other.checked = false;
        o.checked = !o.checked;
      }
    }
  }
  tamper?.(m);
  return m;
}

const WANT = [
  { label: 'Student first name', value: 'Maya' },
  { label: 'Student last name', value: 'Lopez' },
  { label: 'Parent phone', value: '831-555-0100' },
  { label: 'ZIP code', value: '95073' },
  { label: 'Grade level', value: '1st grade' },
  { label: 'Days needed', value: 'Monday, Friday' },
];

async function servedMap(): Promise<FormMap> {
  const html = await (await fetch(`${BASE}/form`)).text();
  return formMapFromHtml(html);
}

// ── Fix 4: read-back per field, radio and checkbox groups ───────────────────

test('the form-map script is a valid browser expression that reads option groups', () => {
  assert.doesNotThrow(() => new Function(`return ${FORM_MAP_JS}`));
  assert.match(FORM_MAP_JS, /input\[type="radio"\]/);
  assert.match(FORM_MAP_JS, /optionGroups: order\.map/);
});

test('the radio and checkbox groups on the page are planned, not skipped', async () => {
  const map = await servedMap();
  assert.equal(map.optionGroups.length, 2);
  const plan = planFill(map, WANT);
  assert.equal(plan.unmatched.length, 0, JSON.stringify(plan.unmatched));
  const grade = plan.targets.find((t) => t.want.label === 'Grade level');
  assert.equal(grade?.kind, 'group');
  const days = plan.targets.find((t) => t.want.label === 'Days needed');
  assert.ok(days?.kind === 'group' && days.select.size === 2);
});

test('a correct fill passes read-back', async () => {
  const map = await servedMap();
  const plan = planFill(map, WANT);
  assert.deepEqual(readBack(simulateFill(map, plan), WANT, plan), []);
});

test('read-back catches the wrong radio option', async () => {
  const map = await servedMap();
  const plan = planFill(map, WANT);
  const after = simulateFill(map, plan, (m) => {
    const g = m.optionGroups.find((x) => x.question === 'Grade level')!;
    for (const o of g.options) o.checked = o.label === '2nd grade';
  });
  const misses = readBack(after, WANT, plan);
  assert.deepEqual(misses.map((x) => x.label), ['Grade level']);
  assert.equal(misses[0]!.found, '2nd grade');
});

test('read-back catches a value typed into the wrong field, even though "some field" holds it', async () => {
  const map = await servedMap();
  const plan = planFill(map, WANT);
  // The ZIP landed in the phone box and the ZIP box is empty: the old check passed this,
  // because "any field holds 95073".
  const after = simulateFill(map, plan, (m) => {
    m.fields.find((f) => f.label === 'Parent phone')!.value = '95073';
    m.fields.find((f) => f.label === 'ZIP code')!.value = '';
  });
  const misses = readBack(after, WANT, plan).map((x) => x.label).sort();
  assert.deepEqual(misses, ['Parent phone', 'ZIP code']);
});

test('read-back uses the map AFTER the fill, not the one from before', async () => {
  const before = await servedMap();
  const plan = planFill(before, WANT);
  // Before the fill nothing holds the values, so reading "before" can never pass...
  assert.equal(readBack(before, WANT, plan).length, WANT.length);
  // ...and a checkbox left unticked after the fill is reported.
  const after = simulateFill(before, plan, (m) => {
    m.optionGroups.find((g) => g.question === 'Days needed')!.options.find((o) => o.label === 'Friday')!.checked = false;
  });
  assert.deepEqual(readBack(after, WANT, plan).map((x) => x.label), ['Days needed']);
});

test('a value that names no option is not forced into a radio group', async () => {
  const map = await servedMap();
  const g = map.optionGroups.find((x) => x.type === 'radio')!;
  assert.equal(selectionFor(g, '7th grade'), undefined);
  assert.equal(selectionFor(g, 'grade'), undefined, 'ambiguous: matches every option');
});

test('two values can never claim the same field', () => {
  const map: FormMap = { fields: [{ label: 'Phone', selector: '#p', type: 'tel', value: '' }], optionGroups: [] };
  const plan = planFill(map, [
    { label: 'Phone', value: '1' },
    { label: 'Phone', value: '2' },
  ]);
  assert.equal(plan.targets.length, 1);
  assert.equal(plan.unmatched.length, 1);
});

// ── Fix 5: "submitted" requires a confirmation ──────────────────────────────

test('detectConfirmation: page words or a printed reference, nothing less', () => {
  assert.equal(detectConfirmation('Your response has been recorded.').confirmed, true);
  assert.equal(detectConfirmation('Thank you for your application! Confirmation number: AB12345').reference, 'AB12345');
  assert.equal(detectConfirmation('Application form — Student first name').confirmed, false);
  assert.equal(detectConfirmation('Please fix the errors below and submit again.').confirmed, false);
  assert.equal(detectConfirmation('').confirmed, false);
});

const ctx = (): ExecutionContext & { followUps: Date[] } => {
  const followUps: Date[] = [];
  return {
    followUps,
    mode: 'live',
    demoClockScale: 1440,
    resolveCounterparty: (r) => ({ role: r }),
    logAction: async () => 'a1',
    scheduleFollowUp: async (_c, at) => void followUps.push(at),
    messageParent: async () => {},
  };
};

const formStep = (email?: string): Step => ({
  id: 's1',
  caseId: 'c1',
  intent: 'report_absence',
  channel: 'form',
  counterparty: { role: 'ATTENDANCE', name: 'the attendance office', email },
  payload: { channel: 'form', formId: 'absence', fields: { Student: 'Maya', Date: '2026-10-16' } },
  successCondition: { describe: 'absence reported', kind: 'reference_received' },
  requiresConsent: true,
  status: 'executing',
});

class CapturingEmail implements EmailProvider {
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    return { sent: true, id: `msg-${this.sent.length}` };
  }
}

test('FormAdapter: a bare 2xx is "sent, not confirmed", never "Submitted"', async () => {
  const { FormAdapter } = await import('../src/agent/steps/adapters/form.js');
  formEndpointReply = { code: 200, body: '{"ok":true}' };
  const r = await new FormAdapter(`${BASE}/endpoint`, new CapturingEmail()).execute(formStep(), ctx());
  assert.equal(r.status, 'awaiting_reply');
  assert.equal(r.action.status, 'sent_unconfirmed');
  assert.equal(r.referenceId, undefined, 'no made-up reference');
  assert.doesNotMatch(r.parentSummary, /submitted/i);
  assert.match(r.parentSummary, /didn't get a confirmation/);
  assert.ok(r.followUpAt, 'an unconfirmed send is chased');
});

test('FormAdapter: done only with the endpoint\'s own reference', async () => {
  const { FormAdapter } = await import('../src/agent/steps/adapters/form.js');
  formEndpointReply = { code: 201, body: '{"confirmationNumber":"ATT-2291"}' };
  const r = await new FormAdapter(`${BASE}/endpoint`, new CapturingEmail()).execute(formStep(), ctx());
  assert.equal(r.status, 'done');
  assert.equal(r.referenceId, 'ATT-2291');
  assert.equal(r.action.status, 'submitted');
});

test('FormAdapter: the email fallback is not an official submission', async () => {
  const { FormAdapter } = await import('../src/agent/steps/adapters/form.js');
  const mail = new CapturingEmail();
  const r = await new FormAdapter(undefined, mail).execute(formStep('office@school.example.org'), ctx());
  assert.equal(mail.sent.length, 1);
  assert.equal(r.status, 'awaiting_reply');
  assert.equal(r.action.status, 'sent_unconfirmed');
  assert.match(r.parentSummary, /isn't an official submission/);
});

test('BrowserAdapter / SubmitAdapter make up no reference ids', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['browser.ts', 'submit.ts', 'form.ts']) {
    const src = await readFile(new URL(`../src/agent/steps/adapters/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /referenceId:\s*['`"][a-z-]+['`"]\s*\+|`(browser|submit|form|skyvern-submit)-\$\{Date\.now/, f);
  }
});

test('BrowserAdapter without a browser fails honestly', async () => {
  const { BrowserAdapter } = await import('../src/agent/steps/adapters/browser.js');
  const r = await new BrowserAdapter().execute(
    { ...formStep(), channel: 'browser', payload: { channel: 'browser', url: `${BASE}/form`, fields: WANT, submit: true } },
    ctx(),
  );
  assert.equal(r.status, 'failed');
  assert.equal(r.referenceId, undefined);
});

// ── Fix 6: attachments on the approved email step ───────────────────────────

const emailStep = (attachments?: Step['payload'] extends infer P ? (P extends { channel: 'email' } ? P['attachments'] : never) : never): Step => ({
  id: 'e1',
  caseId: 'c1',
  intent: 'send_form',
  channel: 'email',
  counterparty: { role: 'OTHER', name: 'the front office', email: 'office@school.example.org' },
  payload: { channel: 'email', subject: 'Completed application', body: 'Attached is the application.', attachments },
  successCondition: { describe: 'sent', kind: 'reply_received' },
  requiresConsent: true,
  status: 'executing',
});

test('EmailAdapter passes the approved attachments to the provider', async () => {
  const { EmailAdapter } = await import('../src/agent/steps/adapters/email.js');
  const mail = new CapturingEmail();
  const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
  const r = await new EmailAdapter(mail).execute(
    emailStep([{ filename: 'application-maya.pdf', contentType: 'application/pdf', contentBase64: pdf }]),
    ctx(),
  );
  assert.equal(mail.sent[0]?.attachments?.[0]?.filename, 'application-maya.pdf');
  assert.equal(mail.sent[0]?.attachments?.[0]?.contentBase64, pdf);
  // A form sent by email is a submission the school has not confirmed.
  assert.equal(r.status, 'awaiting_reply');
  assert.match(r.parentSummary, /application-maya\.pdf/);
  assert.match(r.parentSummary, /don't have a confirmation/);
});

test('EmailAdapter: a plain email is still just "sent"', async () => {
  const { EmailAdapter } = await import('../src/agent/steps/adapters/email.js');
  const mail = new CapturingEmail();
  const r = await new EmailAdapter(mail).execute(emailStep(), ctx());
  assert.equal(r.status, 'done');
  assert.equal(mail.sent[0]?.attachments, undefined);
});

test('the consent proposal names every attachment', async () => {
  const { describeProposal } = await import('../src/agent/steps/consent.js');
  const text = describeProposal([
    emailStep([
      { filename: 'application-maya.pdf', contentType: 'application/pdf', path: '/tmp/a.pdf' },
      { filename: 'proof-of-address.jpg', contentType: 'image/jpeg', contentBase64: 'AAAA' },
    ]),
  ]);
  assert.match(text, /Attached: application-maya\.pdf, proof-of-address\.jpg/);
});

test('Gmail carries attachments as multipart/mixed instead of dropping them', async () => {
  const { rfc2822Message } = await import('../src/integrations/gmail.js');
  const raw = rfc2822Message(
    { to: 'office@school.example.org', subject: 'App', body: 'hi' },
    [{ filename: 'application-maya.pdf', contentType: 'application/pdf', base64: 'JVBERi0=' }],
  );
  assert.match(raw, /multipart\/mixed/);
  assert.match(raw, /filename="application-maya\.pdf"/);
  assert.match(raw, /JVBERi0=/);
});

// ── Fix 1: minimum data ─────────────────────────────────────────────────────

const PROFILE = {
  parentName: 'Ana',
  parentLastName: 'Lopez',
  phone: '831-555-0100',
  email: 'ana@example.com',
  school: 'Soquel Elementary',
  address: { street: '12 Oak St', city: 'Soquel', state: 'CA', zip: '95073' },
  emergencyContacts: [{ name: 'Grandma Jo', relationship: 'grandmother', phone: '831-555-0101' }],
  children: [{ name: 'Maya', grade: '1st', dateOfBirth: '2019-04-02', allergies: 'peanuts', medicalNotes: 'asthma inhaler' }],
} as unknown as import('../src/domain/types.js').FamilyProfile;

test('no recipe: identity and contact basics only, never health', async () => {
  const { formValuesForForm } = await import('../src/agent/family-info.js');
  const v = formValuesForForm(PROFILE, 'Maya', undefined);
  assert.equal(v['Student first name'], 'Maya');
  assert.equal(v['Parent/guardian phone'], '831-555-0100');
  assert.equal(v['Allergies'], undefined);
  assert.equal(v['Medical conditions / notes'], undefined);
  assert.equal(v['Emergency contact 1 name'], undefined);
});

test('a recipe without medical fields gets none; one that asks gets them', async () => {
  const { formValuesForForm } = await import('../src/agent/family-info.js');
  const noMed = formValuesForForm(PROFILE, 'Maya', ["Child's first name", 'Date of Birth', 'Emergency contact phone', 'Terms and conditions']);
  assert.equal(noMed['Allergies'], undefined);
  assert.equal(noMed['Medical conditions / notes'], undefined);
  assert.equal(noMed['Student date of birth'], '2019-04-02');
  assert.equal(noMed['Emergency contact 1 phone'], '831-555-0101');
  assert.equal(noMed['Home street address'], undefined, 'the form did not ask for an address');
  const med = formValuesForForm(PROFILE, 'Maya', ['Student name', 'Allergies', 'Medical conditions']);
  assert.equal(med['Allergies'], 'peanuts');
  assert.equal(med['Medical conditions / notes'], 'asthma inhaler');
});

test('skyvern_fill_form: a form whose recipe lacks medical fields receives none, and the profile wins', async () => {
  const { saveFormRecipe } = await import('../src/integrations/form-recipes.js');
  const { runTool } = await import('../src/agent/tools.js');
  const url = 'https://forms.example.org/honesty-camp';
  // A recipe auto-recorded from an old full-profile fill: its valueKeys include Allergies, but
  // the form's own labels do not ask for it. Names we sent are not the form asking.
  await saveFormRecipe({
    url,
    fills: [{ label: 'Student first name' }, { label: 'Student last name' }, { label: 'Date of birth' }, { label: 'Parent phone' }],
    controls: [],
    selects: [],
    verified: { at: new Date().toISOString(), evidence: 'completed-fill', valueKeys: ['Student first name', 'Allergies'] },
  });
  skyvernTasks.length = 0;
  const out = await runTool(
    'skyvern_fill_form',
    {
      url,
      child: 'Maya',
      values: {
        'Student first name': 'Mayaa', // the model's typo must not override the profile
        Allergies: 'none', // a health fact the form does not ask for
        'Shirt size': 'S', // not on file: allowed, and marked
      },
    },
    {
      profile: PROFILE,
      getCases: () => [],
      appendCase: () => {},
      proposeSteps: () => {},
      saveProfile: () => {},
      conversationId: 'c-honesty',
    } as unknown as Parameters<typeof runTool>[2],
  );
  assert.match(out, /^On it/, out);
  const task = skyvernTasks.find((t) => typeof t.prompt === 'string')!;
  const prompt = String(task.prompt);
  assert.match(prompt, /Student first name: Maya\b/);
  assert.doesNotMatch(prompt, /Mayaa/);
  assert.doesNotMatch(prompt, /Allergies|peanuts|asthma|Medical/i);
  assert.doesNotMatch(prompt, /Grandma Jo|12 Oak St/, 'facts the form does not ask for stay home');
  assert.match(prompt, /Shirt size: S/);
});
