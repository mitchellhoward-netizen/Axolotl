#!/usr/bin/env tsx
/**
 * Email-triage guard tests (Block 2f). Pure functions only — no DB, no network — so this
 * runs in CI. Covers the parsing + the drop decisions that keep non-school / spoofed mail
 * out and make retries idempotent.
 *
 *   npm run test:email
 */
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

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
