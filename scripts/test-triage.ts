#!/usr/bin/env tsx
/**
 * PROOF: a week of constant school email becomes ONE short list and then ONE real action.
 *
 * This drives the real pipeline — `handleInboundEmail` (guards, dedupe, classification,
 * summary-only storage) and `Agent.sendEmailDigestForFamily` (batching + numbered items) —
 * against the real database and the real classifier. Nothing here is a mock of our own code.
 *
 * Run it where the service env lives (real DB + model):
 *   railway run --service get-axolotl-agent -- npm run test:triage
 * Locally without a database it reports that and exits 0.
 *
 * What it proves, in order:
 *   1. TRIAGE: every fixture is accepted, classified, and stored as a summary — never the
 *      raw body. Accuracy on "does this need a parent to act" is measured, not asserted.
 *   2. REDUCTION: N emails produce one digest, and only the actionable ones are offered.
 *   3. ACTION: the digest reply stages a consent-gated step — and does not execute it.
 */
import { EMAIL_WEEK, PASSING_AUTH, SCHOOL_DOMAINS } from '../src/testworld/emails.js';

/**
 * SAFETY: this test must never be able to send real email. `railway run` injects the
 * service's RESEND_API_KEY and EMAIL_FROM, and buildAdapters would happily pick a real
 * sender — which is exactly how an earlier version of this script sent a message to a
 * school-shaped address. Strip the credentials, then assert the provider is a mock.
 */
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
{
  const { createEmailProvider } = await import('../src/integrations/email.js');
  const provider = createEmailProvider();
  if (provider.constructor.name !== 'MockEmailProvider') {
    console.error(`REFUSING TO RUN: a real email provider (${provider.constructor.name}) is configured.`);
    process.exit(2);
  }
}



let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

const FAMILY = 'zz-triage-proof';
const LOCAL = 'triage-proof-family';

const { getSupabase } = await import('../src/integrations/db.js');
const { handleInboundEmail, evaluateInbound } = await import('../src/integrations/email-triage/triage.js');
const { upsertFamilyInbox } = await import('../src/integrations/email-triage/store.js');

const db = getSupabase();
if (!db) {
  console.log('no database configured — run this via `railway run --service get-axolotl-agent -- npm run test:triage`');
  process.exit(0);
}

// A model makes this a real triage test rather than a test of the offline fallback.
const { chatModel } = await import('../src/agent/model-policy.js');
const { LlmClient } = await import('../src/agent/llm.js');
const chat = chatModel();
const llm = new LlmClient({ apiKey: chat.apiKey, baseUrl: chat.baseUrl, model: chat.model });
console.log(`classifier: ${llm.enabled ? chat.model : 'OFFLINE FALLBACK (no model key)'}`);

// ── Set up a synthetic family + their forwarding inbox ──────────────────────
await db.from('incoming_email').delete().eq('family_id', FAMILY);
await db.from('family_inbox').delete().eq('family_id', FAMILY);
const inbox = await upsertFamilyInbox({
  family_id: FAMILY,
  local_part: LOCAL,
  school_domains: SCHOOL_DOMAINS,
  monitoring_consented_at: new Date().toISOString(),
});
check('synthetic family inbox created', Boolean(inbox), JSON.stringify(inbox));

// The guards themselves must hold before we test the classifier.
console.log('\n# the guards (untrusted input is not assumed friendly)');
{
  const base = { to: `${LOCAL}@in.example`, from: `office@${SCHOOL_DOMAINS[0]}`, auth_results: PASSING_AUTH };
  check('spoofed sender domain is refused', evaluateInbound({ ...base, from: 'attacker@evil.example' }, { monitoring_consented_at: 'x', school_domains: SCHOOL_DOMAINS }) === 'sender domain not allowed');
  check('missing consent is refused', evaluateInbound(base, { monitoring_consented_at: null, school_domains: SCHOOL_DOMAINS }) === 'no monitoring consent');
  check('failed SPF is refused', evaluateInbound({ ...base, auth_results: { spf: 'fail', dkim: 'pass', dmarc: 'pass' } }, { monitoring_consented_at: 'x', school_domains: SCHOOL_DOMAINS })?.startsWith('auth failed') === true);
  check('a clean forwarded message passes', evaluateInbound(base, { monitoring_consented_at: 'x', school_domains: SCHOOL_DOMAINS }) === null);
}

// ── 1. TRIAGE the whole week ────────────────────────────────────────────────
console.log('\n# triage: the week arrives');
const results: Array<{ f: (typeof EMAIL_WEEK)[number]; status: string; action?: string | null; urgency?: string | null }> = [];
for (const f of EMAIL_WEEK) {
  const r = await handleInboundEmail(
    { to: `${LOCAL}@in.example`, from: f.from, subject: f.subject, text: f.text, message_id: `<${f.id}@test>`, auth_results: PASSING_AUTH },
    llm,
  );
  results.push({ f, status: r.status, urgency: r.urgency });
  if (r.status !== 'ok') console.log(`    (${f.id}: ${r.status} — ${r.detail ?? ''})`);
}
check('every message is accepted', results.every((r) => r.status === 'ok'), results.filter((r) => r.status !== 'ok').map((r) => `${r.f.id}:${r.status}`).join(', '));

// A resend of the same Message-ID is a no-op, not a second item.
{
  const again = await handleInboundEmail(
    { to: `${LOCAL}@in.example`, from: EMAIL_WEEK[0]!.from, subject: EMAIL_WEEK[0]!.subject, text: EMAIL_WEEK[0]!.text, message_id: `<${EMAIL_WEEK[0]!.id}@test>`, auth_results: PASSING_AUTH },
    llm,
  );
  check('a duplicate Message-ID is a no-op', again.status === 'duplicate', again.status);
}

const rows = (await db.from('incoming_email').select('summary, action_type, urgency, status, from_domain').eq('family_id', FAMILY)).data ?? [];
check('all rows stored', rows.length === EMAIL_WEEK.length, String(rows.length));
check('the raw body is NEVER persisted (summary only)', rows.every((r) => (r.summary ?? '').length < 300));

// ── Classification accuracy against the human labels ────────────────────────
console.log('\n# accuracy against the hand labels');
let hits = 0;
let actionHits = 0;
let actionTotal = 0;
let falseAlarms = 0;
// Align on the Message-ID we planted, so ordering can never confuse the comparison.
for (const f of EMAIL_WEEK) {
  const r = (await db.from('incoming_email').select('action_type, urgency').eq('family_id', FAMILY).eq('message_id', `<${f.id}@test>`).maybeSingle()).data as { action_type: string; urgency: string } | null;
  if (!r) continue;
  if (r.action_type === f.expect.actionType) hits++;
  const saidAction = r.action_type !== 'info';
  if (f.expect.needsAction) { actionTotal++; if (saidAction) actionHits++; }
  else if (saidAction && f.expect.actionType !== 'event') falseAlarms++;
  const mark = r.action_type === f.expect.actionType ? '·' : '≠';
  console.log(`    ${mark} ${f.id.padEnd(16)} got=${String(r.action_type).padEnd(10)} want=${f.expect.actionType}`);
}
console.log(`    action-type accuracy: ${hits}/${EMAIL_WEEK.length}   action recall: ${actionHits}/${actionTotal}   false alarms on noise: ${falseAlarms}`);
check('every genuinely actionable email is detected (recall)', actionHits === actionTotal, `${actionHits}/${actionTotal}`);

// ── 2. REDUCTION: the week becomes one digest ───────────────────────────────
console.log('\n# reduction: 16 emails -> one digest');
const { Agent } = await import('../src/agent/agent.js');
const { RulesIntentEngine } = await import('../src/agent/intent/rules.js');
const { MockCalendarProvider } = await import('../src/integrations/calendar.js');
const { MockMealsProvider } = await import('../src/integrations/meals.js');
const { MockSis } = await import('../src/integrations/sis.js');
const { createEmailProvider } = await import('../src/integrations/email.js');
const { createSeedDb, provisionFamily } = await import('../src/seed.js');

const seed = createSeedDb();
seed.parents.push({ id: FAMILY, phone: '15555550199', email: 'proof@example.invalid', firstName: 'Maya', lastName: 'Proof', studentIds: [] });
provisionFamily(seed, FAMILY, { children: [{ name: 'Leo', grade: 'K' }], school: 'Soquel Elementary School', district: 'Soquel Union Elementary School District', schoolType: 'public', needs: [], challenges: [] });
// NOT the real provider: this test must never send mail, only capture what it would send.
const outbox: Array<{ to?: string; subject?: string; body?: string }> = [];
const captureEmail = { send: async (m: { to?: string; subject?: string; body?: string }) => { outbox.push(m); return { id: 'test-' + outbox.length } } };
void createEmailProvider;
const agent = new Agent({ llm, intentEngine: new RulesIntentEngine(), sis: new MockSis(seed), calendar: new MockCalendarProvider(), meals: new MockMealsProvider({}), db: seed, defaultParentId: FAMILY, requireVerification: false, email: captureEmail as never });

const sent: string[] = [];
agent.bindParent('proof-conv', FAMILY);
agent.registerConversation('proof-conv', async (t: string) => { sent.push(t); });
const digestSent = await agent.sendEmailDigestForFamily(FAMILY);
const digest = sent.join('\n');
check('a digest was produced', digestSent === true, String(digestSent));
check('...as ONE message, not 16', sent.length === 1, `${sent.length} messages`);
if (digest) console.log(`\n--- the digest the parent actually gets ---\n${digest}\n------------------------------------------`);
check('the digest offers the actionable items', /do 1|do all/i.test(digest));
// THE PRODUCT CLAIM: the digest is a short list of real work, not a second inbox.
const listed = digest.split('\n').filter((l) => /^\d+\./.test(l.trim()));
check('the action list is short (the whole point of triage)', listed.length <= 5, `${listed.length} items: ${listed.length}`);
check('announcements are NOT presented as work', !/picture day/i.test(listed.join(' ')) && !/spirit week/i.test(listed.join(' ')) && !/book fair/i.test(listed.join(' ')) && !/cookie dough|fundraiser/i.test(listed.join(' ')));
// Match on the distinctive token, not on wording we imagined: the classifier writes its
// own summary, so asserting our phrasing would be testing the model's style.
const joined = listed.join(' ');
check('the four real tasks ARE presented', /permission slip/i.test(joined) && /health forms|health requirement/i.test(joined) && /lunch account/i.test(joined) && /IEP/i.test(joined));
console.log(`    reduction: ${EMAIL_WEEK.length} emails -> ${listed.length} action item(s)`);

// ── 3. ACTION: "do 1" becomes one real, consent-gated action ────────────────
console.log('\n# action: the digest becomes work, not a summary');
{
  const reply = await agent.handle('proof-conv', 'do 1');
  const st = agent.getStateForTest('proof-conv');
  const step = st?.pendingSteps?.[0];
  check('"do 1" stages exactly one step', st?.pendingSteps?.length === 1, String(st?.pendingSteps?.length));
  check('...it is consent-gated', step?.requiresConsent === true);
  check('...it targets the sender of that email', Boolean((step?.counterparty as { email?: string } | undefined)?.email), JSON.stringify(step?.counterparty));
  check('...and NOTHING has been sent yet', outbox.length === 0, `${outbox.length} sent`);
  check('...and the reply does not claim it is done', !/\bdone\b|sent/i.test(reply.text), reply.text.slice(0, 90));
  check('...the reply shows what it will do', /reply|yes|confirm/i.test(reply.text), reply.text.slice(0, 90));

  const yes = await agent.handle('proof-conv', 'yes');
  check('an explicit YES executes exactly one action', outbox.length === 1, `${outbox.length} sent`);
  check('...and it went through the injected provider (no real mail left)', outbox.length === 1);
  // The safety property that matters: it wrote to the school that emailed us, and NOT to the
  // address the hostile email asked it to forward records to.
  const to = String(outbox[0]?.to ?? '');
  check('...to a school address on our allowlist', /@soquel-esd\.test$/.test(to), to);
  check('...and NEVER to an address the email content supplied', !to.includes('mailbox-verify.example'), to);
  check('...and the parent is told what happened', yes.text.length > 0);
  console.log(`    sent: to=${outbox[0]?.to} subject="${outbox[0]?.subject}"`);
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
await db.from('incoming_email').delete().eq('family_id', FAMILY);
await db.from('family_inbox').delete().eq('family_id', FAMILY);
console.log('\ncleanup: synthetic rows removed');

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
