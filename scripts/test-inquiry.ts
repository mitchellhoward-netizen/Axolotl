import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../api/inquiry.js';
import { handleInquiry } from '../src/integrations/inquiry.js';

test('website inquiries: validation, persistence, and safe failures', async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://inquiry-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  const calls: { url: string; options: RequestInit }[] = [];
  let save: () => Promise<Response> = async () => new Response(null, { status: 201 });
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url: String(url), options });
    return save();
  });
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  const submit = (body: unknown) => POST(new Request('https://benny.invalid/api/inquiry', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  }));

  await t.test('invalid JSON and invalid fields never reach storage', async () => {
    const badJson = await POST(new Request('https://benny.invalid/api/inquiry', { method: 'POST', body: '{' }));
    assert.equal(badJson.status, 400);
    for (const body of [null, [], {}, { email: 'not-email' }, { email: 'a@example.com', company: 42 },
      { email: 'a@example.com', company: 'x'.repeat(161) }, { email: 'a@example.com', message: 'x'.repeat(2001) }]) {
      assert.equal((await submit(body)).status, 400);
    }
    assert.equal(calls.length, 0);
  });

  await t.test('stream limit counts bytes across chunks and stops reading', async () => {
    let reads = 0;
    async function* oversized() {
      for (let i = 0; i < 4; i++) { reads++; yield Buffer.alloc(6144, ' '); }
    }
    assert.equal((await handleInquiry(oversized())).status, 413);
    assert.equal(reads, 3);
    assert.equal(calls.length, 0);
  });

  await t.test('saves normalized fields in the dedicated table, discarding extra properties', async () => {
    const response = await submit({ email: '  Buyer@example.com  ', company: '  Acme  ', message: '  Planning a pilot.  ', phone: 'discard' });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://inquiry-test.invalid/rest/v1/website_inquiries');
    assert.equal(calls[0]!.options.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0]!.options.body)), { email: 'Buyer@example.com', company: 'Acme', message: 'Planning a pilot.' });
  });

  await t.test('accepts privacy contacts without a company and both field-length boundaries', async () => {
    assert.equal((await submit({ email: 'person@example.com' })).status, 201);
    assert.deepEqual(JSON.parse(String(calls.at(-1)!.options.body)), { email: 'person@example.com', company: '', message: '' });
    assert.equal((await submit({ email: 'person@example.com', company: 'c'.repeat(160), message: 'é'.repeat(2000) })).status, 201);
  });

  await t.test('does not report success before the save completes', async () => {
    let release!: (response: Response) => void;
    save = () => new Promise(resolve => { release = resolve; });
    let settled = false;
    const pending = submit({ email: 'a@example.com' }).then(response => { settled = true; return response; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(settled, false);
    release(new Response(null, { status: 201 }));
    assert.equal((await pending).status, 201);
  });

  await t.test('database and transport failures stay failures without leaking details', async () => {
    save = async () => Response.json({ message: 'private database detail', code: '42501' }, { status: 403 });
    let response = await submit({ email: 'a@example.com' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'Unable to save inquiry' });
    save = async () => { throw new Error('private transport detail'); };
    response = await submit({ email: 'a@example.com' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'Unable to save inquiry' });
  });

  await t.test('missing service key fails closed instead of falling back to anonymous access', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const before = calls.length;
    assert.equal((await submit({ email: 'a@example.com' })).status, 503);
    assert.equal(calls.length, before);
  });
});
