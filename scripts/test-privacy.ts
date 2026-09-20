#!/usr/bin/env tsx
/**
 * Privacy primitives: sealed secrets and inbound abuse controls.
 *   npm run test:privacy
 */
import { randomBytes } from 'node:crypto';

let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

// ── SecretBox ───────────────────────────────────────────────────────────────
process.env.SECRETS_ENC_KEY = randomBytes(32).toString('base64');
const { SecretBox, secretBox } = await import('../src/lib/secret-box.js');

console.log('# sealed secrets');
const box = secretBox();
check('a 32-byte base64 key loads', box !== null);
{
  const purpose = 'gmail-token:guardian-a';
  const sealed = box!.seal('1//refresh-token-value', purpose);
  check('sealed values are prefixed, so legacy rows are recognisable', SecretBox.isSealed(sealed) && sealed.startsWith('v1:'));
  check('plaintext is not present in the ciphertext', !sealed.includes('refresh-token-value'));
  check('round-trips for the same purpose', box!.open(sealed, purpose) === '1//refresh-token-value');
  // The whole point of AAD: a row copied to another family must not open.
  check('a DIFFERENT purpose (another guardian) cannot open it', box!.open(sealed, 'gmail-token:guardian-b') === undefined);
  check('tampered ciphertext cannot open', box!.open(sealed.slice(0, -4) + 'AAAA', purpose) === undefined);
  check('legacy plaintext is reported as unsealed', SecretBox.isSealed('1//legacy') === false);
  const two = box!.seal('same', purpose);
  check('the same value seals differently each time (random IV)', two !== box!.seal('same', purpose));
}
{
  delete process.env.SECRETS_ENC_KEY;
  const { resetSecretBoxForTest } = await import('../src/lib/secret-box.js');
  resetSecretBoxForTest();
  check('no key configured → no box (so callers refuse to store secrets)', secretBox() === null);
  process.env.SECRETS_ENC_KEY = randomBytes(32).toString('base64');
  const keys = await import('../src/lib/secret-box.js');
  keys.resetSecretBoxForTest();
  check('a malformed key is rejected, not used', (() => {
    process.env.SECRETS_ENC_KEY = 'not-a-key';
    keys.resetSecretBoxForTest();
    return keys.secretBox() === null;
  })());
}

// ── Inbound guard ───────────────────────────────────────────────────────────
process.env.SECRETS_ENC_KEY = randomBytes(32).toString('base64');
const guard = await import('../src/lib/inbound-guard.js');
const t0 = 1_800_000_000_000;

console.log('\n# inbound abuse controls');
{
  delete process.env.AGENT_ALLOWLIST;
  guard.resetInboundGuardForTest();
  check('with no allowlist the line is open', guard.allowInbound('+18315550100', t0).ok === true);
  check('handles are normalised (+1 (831) 555-0100 === +18315550100)', guard.normalizeHandle('+1 (831) 555-0100') === '+18315550100');
}
{
  process.env.AGENT_ALLOWLIST = '+18315550100';
  guard.resetInboundGuardForTest();
  check('an invited number gets through', guard.allowInbound('+18315550100', t0).ok === true);
  const denied = guard.allowInbound('+19998887777', t0);
  check('an unknown number is refused as not_invited', !denied.ok && denied.reason === 'not_invited');
  check('...and the message is polite and mentions STOP', /STOP/.test(guard.denialMessage('not_invited')));
}
{
  delete process.env.AGENT_ALLOWLIST;
  process.env.INBOUND_PER_MINUTE = '3';
  guard.resetInboundGuardForTest();
  const sender = '+18315550100';
  check('first three in a minute pass', [0, 1, 2].every((i) => guard.allowInbound(sender, t0 + i).ok));
  const fourth = guard.allowInbound(sender, t0 + 3);
  check('the fourth is rate-limited', !fourth.ok && fourth.reason === 'rate');
  check('...and a minute later they are welcome again', guard.allowInbound(sender, t0 + 61_000).ok === true);
  check('...and it is per-sender (someone else is unaffected)', guard.allowInbound('+18315550999', t0 + 3).ok === true);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
