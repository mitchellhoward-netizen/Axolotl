#!/usr/bin/env tsx
/**
 * Email-triage tests (Block 2f, extended for workstream 1: email forwarding live).
 *
 * Three layers:
 *   1. pure parsing + drop decisions (always runs, no DB, no network);
 *   2. the REAL /webhooks/inbound-email route over loopback HTTP, to prove it fails closed
 *      and accepts a correct secret (destructive-free: it only ever 401s or ACKs);
 *   3. an OPTIONAL database section that proves an address is stable for a family and that
 *      learned domains accumulate. It skips (exit 0) when no database is configured, so CI
 *      stays green; run it with the service env for the real proof.
 *
 *   npm run test:email
 */
import { provisionFamilyInbox, parseSchoolDomain, parseMailingAddress, forwardingAddressMessage } from '../src/integrations/email-triage/provision.js';
import {
  domainOf,
  localPartOf,
  authVerdicts,
  deriveMessageId,
  evaluateInbound,
  type InboundEmailPayload,
} from '../src/integrations/email-triage/triage.js';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

const INBOX = { monitoring_consented_at: '2026-01-01T00:00:00Z', school_domains: ['suesd.org'] };
const goodAuth = { spf: 'pass', dkim: 'pass', dmarc: 'pass' };
const base = (over: Partial<InboundEmailPayload> = {}): InboundEmailPayload => ({
  to: 'patrick-a1b2@in.chuy.app',
  from: 'Office <office@suesd.org>',
  subject: 'Conference sign-up',
  text: 'Please sign up.',
  auth_results: goodAuth,
  ...over,
});

console.log('# parsing');
ok('domainOf strips display name', domainOf('Office <office@suesd.org>') === 'suesd.org');
ok('domainOf lowercases', domainOf('A@SUESD.ORG') === 'suesd.org');
ok('localPartOf extracts local part', localPartOf('patrick-a1b2@in.chuy.app') === 'patrick-a1b2');
ok('localPartOf takes the first of a list', localPartOf('a@x.com, b@y.com') === 'a');

console.log('\n# auth verdicts');
const v = authVerdicts({ spf: 'pass', dkim: 'fail', dmarc: 'pass' });
ok('object form parsed', v.spf === 'pass' && v.dkim === 'fail' && v.dmarc === 'pass');
const v2 = authVerdicts('spf=pass dkim=pass dmarc=fail');
ok('raw header string parsed', v2.spf === 'pass' && v2.dkim === 'pass' && v2.dmarc === 'fail');

console.log('\n# guards');
ok('accepts an allowlisted, authenticated school email', evaluateInbound(base(), INBOX) === null);
ok('drops unknown sender domain', evaluateInbound(base({ from: 'x@evil.com' }), INBOX) === 'sender domain not allowed');
ok('drops without consent', evaluateInbound(base(), { ...INBOX, monitoring_consented_at: null }) === 'no monitoring consent');
ok('drops SPF fail', evaluateInbound(base({ auth_results: { spf: 'fail', dkim: 'pass', dmarc: 'pass' } }), INBOX)?.startsWith('auth failed') === true);
ok('drops DKIM fail', evaluateInbound(base({ auth_results: { spf: 'pass', dkim: 'fail', dmarc: 'pass' } }), INBOX)?.startsWith('auth failed') === true);
ok('drops DMARC fail', evaluateInbound(base({ auth_results: { spf: 'pass', dkim: 'pass', dmarc: 'fail' } }), INBOX)?.startsWith('auth failed') === true);
ok('drops missing auth entirely', evaluateInbound(base({ auth_results: undefined }), INBOX)?.startsWith('auth failed') === true);
ok('drops missing recipient', evaluateInbound(base({ to: undefined }), INBOX) === 'missing to/from');

console.log('\n# idempotency key');
const a = deriveMessageId(base({ message_id: 'abc@mail' }));
ok('uses the explicit Message-ID', a === 'abc@mail');
ok('reads Message-ID from headers', deriveMessageId(base({ headers: { 'message-id': 'hdr@mail' } })) === 'hdr@mail');
const d1 = deriveMessageId(base());
const d2 = deriveMessageId(base());
ok('derives a stable id when none present', d1 === d2 && d1.startsWith('derived-'));


// ── Workstream 1: the address a family is issued ─────────────────────────────

console.log('\n# reading the school domain (the sender guard is strict, so this must be right)');
ok('reads an office address', parseSchoolDomain('the school sends from office@suesd.org') === 'suesd.org');
ok('ignores a consumer mailbox', parseSchoolDomain('I use maya@gmail.com') === undefined);
ok('still finds the school when a gmail is also present', parseSchoolDomain('me: maya@gmail.com, school: office@suesd.org') === 'suesd.org');
ok('accepts a bare domain when the message is about school', parseSchoolDomain('their district is suesd.org') === 'suesd.org');
ok('refuses to guess a bare .com from loose text', parseSchoolDomain('I bought it on amazon.com yesterday') === undefined);
ok('never treats our own inbound domain as the school', parseSchoolDomain('forward to abc@in.example', { inboundDomain: 'in.example' }) === undefined);
ok('strips a leading @', parseSchoolDomain('@suesd.org is the district') === 'suesd.org');
ok('empty text is not a domain', parseSchoolDomain('') === undefined);

console.log('\n# capturing a mailing address (needed BEFORE an incident, not after)');
ok('reads a simple street address', parseMailingAddress('123 Main St, Soquel, CA 95073') === '123 Main St, Soquel, CA 95073');
ok('reads one with an apartment', /456 Oak Ave Apt 3/.test(String(parseMailingAddress('send it to 456 Oak Ave Apt 3, Santa Cruz CA'))) === true);
ok('accepts a bare house number + suffix', parseMailingAddress('my address is 89 Bay Rd') === '89 Bay Rd');
ok('does not invent an address from a grade', parseMailingAddress('he is in grade 1') === undefined);
ok('does not invent an address from a ZIP alone', parseMailingAddress('95073') === undefined);
ok('does not invent an address from a phone number', parseMailingAddress('call me at 555 010 7788') === undefined);
ok('handles empty input', parseMailingAddress('') === undefined);

console.log('\n# what the parent is actually told');
{
  const withDomains = forwardingAddressMessage({ ok: true, created: true, address: 'leo-a1b2@in.example', localPart: 'leo-a1b2', domains: ['suesd.org'], hasMailingAddress: true });
  ok('gives the address', /leo-a1b2@in\.example/.test(String(withDomains)));
  ok('says we only read what they forward', /only ever read what you forward/i.test(String(withDomains)));
  ok('warns off medical records and passwords', /medical records or passwords/i.test(String(withDomains)));
  ok('does NOT nag for a domain we already have', !/email address your school sends from/i.test(String(withDomains)));
  const noDomains = forwardingAddressMessage({ ok: true, created: true, address: 'leo-a1b2@in.example', localPart: 'leo-a1b2', domains: [], hasMailingAddress: false });
  ok('asks for the school domain when the allowlist is empty', /email address your school sends from/i.test(String(noDomains)));
  const noAddress = forwardingAddressMessage({ ok: false, created: false, domains: [], hasMailingAddress: false, detail: 'INBOUND_DOMAIN is not set' });
  ok('says NOTHING when there is no address to give', noAddress === undefined);
}

console.log('\n# never invent an address when the deployment has no inbound domain');
{
  const saved = process.env.INBOUND_DOMAIN;
  delete process.env.INBOUND_DOMAIN;
  const res = await provisionFamilyInbox({ familyId: 'no-domain-test', seed: 'Leo' });
  ok('reports no address rather than a fake one', res.address === undefined);
  ok('...and explains why', /INBOUND_DOMAIN/.test(String(res.detail)));
  ok('...and is not "ok"', res.ok === false);
  if (saved !== undefined) process.env.INBOUND_DOMAIN = saved;
}

// ── The real route, over loopback HTTP ──────────────────────────────────────
console.log('\n# /webhooks/inbound-email fails closed (real route, real request)');
{
  const { startWebServer } = await import('../src/integrations/web.js');
  const port = 31000 + Math.floor(Math.random() * 2000);
  const body = JSON.stringify({ to: 'nobody@in.example', from: 'office@suesd.org', subject: 'hi', text: 'hello' });
  const post = (headers: Record<string, string>) =>
    fetch(`http://127.0.0.1:${port}/webhooks/inbound-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
      .then((r) => r.status).catch(() => -1);

  delete process.env.INBOUND_WEBHOOK_SECRET;
  let server = startWebServer({}, port);
  ok('no secret configured -> 401 (fails closed, cannot be left open)', (await post({})) === 401);
  server.close();

  process.env.INBOUND_WEBHOOK_SECRET = 'test-secret-value';
  server = startWebServer({}, port);
  ok('wrong secret -> 401', (await post({ 'x-inbound-secret': 'wrong' })) === 401);
  ok('missing header -> 401', (await post({})) === 401);
  ok('correct secret -> 200 ACK', (await post({ 'x-inbound-secret': 'test-secret-value' })) === 200);
  server.close();
  delete process.env.INBOUND_WEBHOOK_SECRET;
}

// ── Optional: the real database (skipped in CI) ─────────────────────────────
{
  const { getSupabase } = await import('../src/integrations/db.js');
  if (!getSupabase()) {
    console.log('\n# database section skipped (no database configured — run with the service env for the real proof)');
  } else {
    console.log('\n# against the real database: a stable address per family');
    process.env.INBOUND_DOMAIN = process.env.INBOUND_DOMAIN || 'in.example';
    const fam = 'zz-forwarding-test';
    const c = getSupabase()!;
    await c.from('family_inbox').delete().eq('family_id', fam);
    const first = await provisionFamilyInbox({ familyId: fam, seed: 'Leo', domains: ['suesd.org'] });
    ok('provisions an address', /^leo-[a-z0-9]+@in\.example$/.test(String(first.address)), String(first.address));
    ok('...and reports it as newly created', first.created === true);
    const second = await provisionFamilyInbox({ familyId: fam, seed: 'Leo', domains: ['suesd.org'] });
    ok('the SAME address on the next call (never changes under the parent)', second.address === first.address, `${first.address} vs ${second.address}`);
    ok('...and no longer reports created', second.created === false);
    const learned = await provisionFamilyInbox({ familyId: fam, seed: 'Leo', domains: ['conference.suesd.org'], mailingAddress: '123 Main St, Soquel, CA 95073' });
    ok('a newly learned domain is ADDED, not swapped', learned.domains.includes('suesd.org') && learned.domains.includes('conference.suesd.org'), JSON.stringify(learned.domains));
    ok('the address still has not changed', learned.address === first.address);
    // The column is a migration. If the database has not had db/email-triage.sql applied
    // since mailing_address was added, say so LOUDLY and skip rather than passing on intent.
    const probe = await c.from('family_inbox').select('mailing_address').eq('family_id', fam).maybeSingle();
    if (probe.error && /mailing_address/.test(probe.error.message)) {
      console.log('  ⚠ MIGRATION REQUIRED: apply db/email-triage.sql — family_inbox.mailing_address is missing,');
      console.log('    so a mailing address cannot be stored yet. (Correctly reported as not stored.)');
      ok('an unstorable address is reported honestly, not assumed', learned.hasMailingAddress === false);
    } else {
      ok('the mailing address is stored', learned.hasMailingAddress === true);
      const reread = await provisionFamilyInbox({ familyId: fam, seed: 'Leo' });
      ok('...and persists across calls', reread.hasMailingAddress === true);
    }
    await c.from('family_inbox').delete().eq('family_id', fam);
    console.log('  (cleanup: synthetic inbox row removed)');
  }
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
