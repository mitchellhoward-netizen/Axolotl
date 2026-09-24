import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// Tests must never inspect the real .env, and the store has to look unconfigured
// so the failure paths below are the ones under test.
process.env.DOTENV_CONFIG_PATH = '/dev/null';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;

const { parseSignup, confirmationText, FAMILY_SIZES } = await import('../src/integrations/waitlist.js');
const { startWebServer } = await import('../src/integrations/web.js');

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FALLBACK_FILE = path.join(REPO, 'public', 'waitlist.json');

async function fixture() {
  const server: Server = startWebServer({}, 0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const post = (origin: string, body: unknown) =>
  fetch(`${origin}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('a family signup needs a 10-digit US phone number', () => {
  const ok = parseSignup({ kind: 'family', phone: '4155550123' });
  assert.deepEqual(ok, { ok: true, row: { kind: 'family', phone: '4155550123' } });

  assert.equal(parseSignup({ kind: 'family', phone: '415555012' }).ok, false);
  assert.equal(parseSignup({ kind: 'family', phone: '' }).ok, false);
  assert.equal(parseSignup({ kind: 'family' }).ok, false);
  // A bare phone with no kind is the old form's payload; it is a family signup.
  assert.deepEqual(parseSignup({ phone: '4155550123' }), ok);
});

test('a circle signup carries the family count, and only from the offered list', () => {
  const ok = parseSignup({ kind: 'circle', phone: '4155550123', families: FAMILY_SIZES[1], school: 'Lincoln' });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.row, { kind: 'circle', phone: '4155550123', families: '4 to 6', school: 'Lincoln' });

  assert.equal(parseSignup({ kind: 'circle', phone: '4155550123' }).ok, false);
  assert.equal(parseSignup({ kind: 'circle', phone: '4155550123', families: '40' }).ok, false);
  // The school is optional, so an empty one is stored as empty rather than failing.
  const noSchool = parseSignup({ kind: 'circle', phone: '4155550123', families: FAMILY_SIZES[0] });
  assert.equal(noSchool.ok, true);
  if (noSchool.ok) assert.equal(noSchool.row.school, '');
});

test('a school signup needs a name, role, school and a valid email, and no phone', () => {
  const ok = parseSignup({
    kind: 'school',
    name: 'Dana Reyes',
    role: 'Family Engagement Coordinator',
    school: 'Lincoln Unified',
    email: 'dana@lincoln.example',
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.row.phone, undefined);

  assert.equal(parseSignup({ kind: 'school', name: 'Dana', role: 'Coordinator', school: 'Lincoln' }).ok, false);
  assert.equal(
    parseSignup({ kind: 'school', name: 'D', role: 'C', school: 'L', email: 'not-an-email' }).ok,
    false,
  );
});

test('an unknown signup kind is rejected instead of defaulting', () => {
  const result = parseSignup({ kind: 'district', phone: '4155550123' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /type/i);
});

test('overlong values are cut to the column limits rather than rejected', () => {
  const result = parseSignup({ kind: 'school', name: 'x'.repeat(400), role: 'r', school: 's', email: 'a@b.co', message: 'm'.repeat(5000) });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.row.name?.length, 120);
    assert.equal(result.row.message?.length, 2000);
  }
});

test('only families and circles get a confirmation text', () => {
  assert.match(confirmationText({ kind: 'family', phone: '4155550123' }) ?? '', /on the list/i);
  assert.match(confirmationText({ kind: 'circle', phone: '4155550123' }) ?? '', /circles/i);
  // A school request is answered by email, so it must not receive a text.
  assert.equal(confirmationText({ kind: 'school', email: 'dana@lincoln.example' }), null);
});

test('the endpoint rejects a malformed signup with 400 and a reason', async (t) => {
  const app = await fixture();
  t.after(app.close);

  const bad = await post(app.origin, { kind: 'family', phone: '123' });
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.equal(body.ok, false);

  const notJson = await fetch(`${app.origin}/api/waitlist`, { method: 'POST', body: 'nope' });
  assert.equal(notJson.status, 400);
});

test('a signup that cannot be stored fails loudly instead of being written to a local file', async (t) => {
  const app = await fixture();
  t.after(app.close);

  // Supabase is unconfigured above, so this is the outage path: the parent has to
  // see an error rather than a "you're on the list" for a signup that went nowhere.
  const response = await post(app.origin, { kind: 'family', phone: '4155550123' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);

  // The old host fell back to appending public/waitlist.json. That file must not
  // come back: on an ephemeral host it was a signup silently lost, reported as saved.
  assert.equal(existsSync(FALLBACK_FILE), false, 'public/waitlist.json was written again');
});
