#!/usr/bin/env tsx
/**
 * Reading school mail from a connected Gmail: which mail is selected, which is accepted, and
 * that it lands in triage the same way forwarded mail does. Drives the real reader against a
 * fake Gmail API on localhost; the triage sink is in memory, so no database is needed.
 *
 *   npm run test:gmail-ingest
 */
import { createServer, type Server } from 'node:http';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const AUTH_OK = 'mx.google.com; dkim=pass header.i=@x; spf=pass smtp.mailfrom=x; dmarc=pass';
function message(id: string, from: string, subject: string, body: string, auth = AUTH_OK, messageId = `<${id}@mail>`) {
  return {
    id,
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        { name: 'Message-ID', value: messageId },
        { name: 'Authentication-Results', value: auth },
      ],
      parts: [
        { mimeType: 'text/plain', body: { data: b64(body) } },
        { mimeType: 'text/html', body: { data: b64(`<p>${body}</p>`) } },
      ],
    },
  };
}

const mailbox = new Map<string, ReturnType<typeof message>>();
let lastQuery = '';
let lastAuth = '';
let failList = false;
const server: Server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  lastAuth = String(req.headers.authorization ?? '');
  const json = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/gmail/v1/users/me/messages') {
    if (failList) return json(401, {});
    lastQuery = url.searchParams.get('q') ?? '';
    return json(200, { messages: [...mailbox.keys()].map((id) => ({ id })) });
  }
  const m = url.pathname.match(/^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/);
  if (m) return mailbox.has(m[1]!) ? json(200, mailbox.get(m[1]!)) : json(404, {});
  return json(404, {});
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
process.env.GMAIL_API_BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const { ingestGmailForFamily, schoolMailQuery, toInboundPayload, acceptGmailMessage } = await import('../src/integrations/email-triage/gmail-ingest.js');
const { isSchoolSender } = await import('../src/integrations/email-triage/triage.js');
type Row = { family_id: string; message_id?: string | null; summary?: string | null; from_domain?: string | null };
const stored: Row[] = [];
const sink = {
  exists: async (id: string) => stored.some((r) => r.message_id === id),
  insert: async (row: Omit<Row, 'id'>) => { stored.push(row as Row); return { id: `e${stored.length}`, ...row }; },
};

console.log('# which senders count as the school');
check('the school domain', isSchoolSender('suesd.org', ['suesd.org']));
check('a subdomain of it', isSchoolSender('mail.suesd.org', ['suesd.org']));
check('a school platform', isSchoolSender('notifications.parentsquare.com', []));
check('not a lookalike', !isSchoolSender('suesd.org.evil.com', ['suesd.org']) && !isSchoolSender('notparentsquare.com', []));
check('not everyday mail', !isSchoolSender('amazon.com', ['suesd.org']));

console.log('\n# the Gmail search selects only school mail');
{
  const q = schoolMailQuery(['suesd.org'], Date.UTC(2026, 8, 1));
  check('bounded by time', q.startsWith(`after:${Math.floor(Date.UTC(2026, 8, 1) / 1000)} `), q);
  check('names the school and the platforms', q.includes('from:suesd.org') && q.includes('from:parentsquare.com'));
  check('never sent mail or drafts', q.includes('-in:sent') && q.includes('-in:drafts'));
}

console.log('\n# messages become triage payloads');
{
  const p = toInboundPayload(message('m1', 'Ms. Lee <lee@suesd.org>', 'Field trip form', 'Please sign by Friday.'), 'mom@gmail.com');
  check('headers are read', p.from === 'Ms. Lee <lee@suesd.org>' && p.subject === 'Field trip form');
  check('the plain-text body is used', p.text === 'Please sign by Friday.' && !p.html);
  check('Message-ID is the dedupe key', p.message_id === '<m1@mail>');
  check('accepted when Google authenticated the school', acceptGmailMessage(p, ['suesd.org']) === null);
  const spoof = toInboundPayload(message('m2', 'Principal <p@suesd.org>', 'Urgent', 'wire money', 'mx.google.com; dkim=fail; spf=fail; dmarc=fail'));
  check('refused when the sender fails authentication', acceptGmailMessage(spoof, ['suesd.org']) !== null);
  const other = toInboundPayload(message('m3', 'Deals <x@shop.com>', 'Sale', 'buy'));
  check('refused when it is not school mail', acceptGmailMessage(other, ['suesd.org']) === 'sender not a school');
}

console.log('\n# one pass over the inbox');
{
  mailbox.clear();
  mailbox.set('a', message('a', 'Ms. Lee <lee@suesd.org>', 'Field trip permission slip', 'Sign and return by Friday.'));
  mailbox.set('b', message('b', 'ParentSquare <noreply@parentsquare.com>', 'Picture day Tuesday', 'Picture day is Tuesday.'));
  mailbox.set('c', message('c', 'Principal <p@suesd.org>', 'Gift cards', 'Buy gift cards', 'mx.google.com; dkim=fail; spf=fail; dmarc=fail'));
  mailbox.set('d', message('d', 'Shop <deals@shop.com>', 'Sale', 'Sale'));
  const r = await ingestGmailForFamily({ familyId: 'fam1', schoolDomains: ['suesd.org'], accessToken: 'tok-1', afterMs: 0, sink, mailbox: 'mom@gmail.com' });
  check('the reader authenticates as the parent', lastAuth === 'Bearer tok-1');
  check('it searches for school mail', lastQuery.includes('from:suesd.org'));
  check('school and platform mail is triaged', r.triaged === 2 && stored.length === 2, JSON.stringify(r));
  check('spoofed and unrelated mail is skipped', (r.skipped['dmarc failed'] ?? 0) + (r.skipped['sender not authenticated'] ?? 0) === 1 && r.skipped['sender not a school'] === 1, JSON.stringify(r.skipped));
  check('stored for this family, without the body', stored.every((s) => s.family_id === 'fam1' && !JSON.stringify(s).includes('Sign and return')));
  const again = await ingestGmailForFamily({ familyId: 'fam1', schoolDomains: ['suesd.org'], accessToken: 'tok-1', afterMs: 0, sink });
  check('a re-read stores nothing twice', again.triaged === 0 && stored.length === 2 && again.results.every((x) => x.status === 'duplicate'));
}
{
  failList = true;
  let threw = false;
  try { await ingestGmailForFamily({ familyId: 'fam1', schoolDomains: [], accessToken: 'bad', afterMs: 0, sink }); } catch { threw = true; }
  check('an API failure throws, so the cursor does not move', threw);
  failList = false;
}

console.log('\n# the connect link is signed');
{
  process.env.SECRETS_ENC_KEY = 'test-key-for-signing-only';
  const { signState, verifyState } = await import('../src/lib/signed-state.js');
  const s = signState('parent-1', 60_000)!;
  check('a link we issued verifies', verifyState(s) === 'parent-1');
  check('a bare family id does not', verifyState('parent-1') === undefined);
  const [body] = s.split('.');
  const forged = `${Buffer.from(JSON.stringify({ v: 'attacker', exp: Date.now() + 60_000 })).toString('base64url')}.${s.split('.')[1]}`;
  check('a forged family id does not', verifyState(forged) === undefined && body !== forged.split('.')[0]);
  check('an expired link does not', verifyState(signState('parent-1', 1_000, Date.now() - 10_000)!) === undefined);
  const { gmailConnectUrl } = await import('../src/integrations/gmail.js');
  const link = gmailConnectUrl('parent-1');
  const state = new URL(link).searchParams.get('state') ?? '';
  check('the connect link carries a signed state, not the raw id', state !== 'parent-1' && verifyState(state) === 'parent-1');
}

server.close();
console.log(`\n✓ ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
