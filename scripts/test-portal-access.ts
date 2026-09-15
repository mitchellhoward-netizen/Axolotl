import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { runInNewContext } from 'node:vm';
import { WebSocket, WebSocketServer } from 'ws';
import { BennyStore, BennyVault } from '../src/benefits/runtime-store.js';
import { BennyRuntime } from '../src/benefits/runtime.js';
import { PortalAccess } from '../src/benefits/portal-access.js';
import { attachPortalWebSocket, handlePortalHttp } from '../src/benefits/portal-http.js';
import { SkyvernBrowserClient, SkyvernRequestError, navigateBrowser, passiveSnapshot, portalPolicySchema, type PortalPolicy, type SkyvernBrowser } from '../src/benefits/skyvern-browser.js';
import { personalModelContext } from '../src/agent/personal.js';

// Only fictional adapters and a disposable local schema. Never load .env or call Skyvern.
const schema = `benny_test_${randomBytes(8).toString('hex')}`;
const store = new BennyStore('postgresql://benny_lab@127.0.0.1:55432/benny_benefits_lab', new BennyVault(randomBytes(32).toString('base64')), schema);
const policy: PortalPolicy = { id: 'wex', revision: 'fictional-v1', loginUrl: 'https://fixture.invalid/login', readUrl: 'https://fixture.invalid/account',
  signedOutSelector: '#signed-out', accountId: { selector: '#account', attribute: 'data-id' }, accountLabel: { selector: '#label' },
  fields: [{ selector: '#deadline', label: 'Filing deadline' }] };
before(async () => { await store.pool.query((await readFile(new URL('../db/benny.sql', import.meta.url), 'utf8')).replace(/\bbenny\b/g, schema)); });
after(async () => { await store.pool.query(`DROP SCHEMA ${schema} CASCADE`); await store.close(); });

function fixture() {
  let now = Date.parse('2026-09-14T12:00:00Z'); let allowed = true;
  const sender = `${randomUUID()}@example.invalid`;
  const runtime = new BennyRuntime(store, [], 'https://benny.invalid', () => now, s => allowed && s === sender);
  runtime.requireEnrollment = true;
  const owner = runtime.owner(sender);
  const profiles = new Map<string, string>(); const closed = new Set<string>();
  const calls: Array<{ method: string; session?: string; profile?: string; fields?: number; expected?: string }> = [];
  let seq = 0; let accountId = 'fictional-stable-1234';
  const browser: SkyvernBrowser = {
    async create(_url, profile) { const id = `pbs_${++seq}`; calls.push({ method: 'create', session: id, profile }); return { id }; },
    async viewable() { return true; },
    async close(session) { calls.push({ method: 'close', session }); closed.add(session); },
    async findProfile(name) { return profiles.get(name); },
    async save(session, name) {
      assert.ok(closed.has(session), 'must close before saving');
      if (!profiles.has(name)) profiles.set(name, `bp_${++seq}`);
      return profiles.get(name);
    },
    async remove(profile) { calls.push({ method: 'remove', profile }); for (const [n, id] of profiles) if (id === profile) profiles.delete(n); },
    async snapshot(session, p, expected) {
      calls.push({ method: 'read', session, fields: p.fields.length, expected });
      if (expected && expected !== accountId) throw new Error('Wrong account');
      return { accountId, accountLabel: 'Fictional account ending 1234', fields: p.fields.map(f => ({ label: f.label, value: '2026-09-18' })),
        source: p.readUrl, observedAt: new Date(now).toISOString(), policyRevision: p.revision };
    },
    viewer() { throw new Error('No real stream'); },
  };
  const access = new PortalAccess(store, browser, [policy], 'https://benny.invalid', a => allowed && runtime.enrolled(a), () => now);
  runtime.portalAccess = access;
  const say = (text: string) => runtime.receive({ id: randomUUID(), sender, space: 'fictional-dm', line: 'fictional-line', text });
  const account = async () => (await store.read(owner))!;
  const connection = async () => (await account()).connections.wex!;
  const step = async (n = 1) => { for (let i = 0; i < n; i++) { await access.tick(owner); now += 1000; } };
  const begin = async () => {
    await say('Hello'); await say('JOIN PILOT'); await say('CONNECT wex');
    return (await account()).outbox.at(-1)!.text.match(/\/benny\/portal#([\w-]{43})/)![1]!;
  };
  const login = async () => { const view = (await access.open(await begin()))!; await step(2); assert.equal(await access.done(view), true); await step(6); return view; };
  const connect = async () => { const view = await login(); await say(`CONNECT ${(await connection()).code}`); return view; };
  return { runtime, access, browser, calls, profiles, owner, say, account, connection, step, begin, login, connect,
    advance(ms: number) { now += ms; }, disallow() { allowed = false; }, switchAccount() { accountId = 'someone-else'; } };
}

test('login closes/restores before identity confirmation, then requested reads refresh the profile', async () => {
  const f = fixture(); const ticket = await f.begin();
  assert.equal(f.calls.length, 0);
  const view = (await f.access.open(ticket))!;
  assert.equal(await f.access.open(ticket), undefined, 'single-use ticket');
  await f.say('CHECK wex'); assert.equal(f.calls.length, 0);
  await f.step(2); assert.equal((await f.connection()).browser!.phase, 'login');
  assert.equal(await f.access.done(view), true);
  assert.equal(await f.access.done(view), false);
  await f.step(6);
  assert.equal((await f.connection()).status, 'awaiting_confirmation');
  assert.deepEqual(f.calls.filter(c => c.method === 'read').map(c => c.fields), [0]);
  assert.deepEqual(personalModelContext(await f.account(), Date.now()).portalReads, []);
  await f.say('CHECK wex'); await f.step();
  assert.equal(f.calls.filter(c => c.method === 'read').length, 1);
  await f.say(`CONNECT ${(await f.connection()).code}`);
  const prior = (await f.connection()).browser!.profile;
  await f.say('CHECK wex'); await f.step(4);
  const c = await f.connection();
  assert.equal(c.browser!.phase, 'idle'); assert.notEqual(c.browser!.profile, prior);
  assert.deepEqual(c.browser!.snapshot!.fields, [{ label: 'Filing deadline', value: '2026-09-18' }]);
  assert.equal(f.calls.at(-2)!.expected, 'fictional-stable-1234');
  const context = JSON.stringify(personalModelContext(await f.account(), Date.parse('2026-09-14T13:00:00Z')));
  assert.match(context, /2026-09-18/); assert.doesNotMatch(context, /fictional-stable|bp_|pbs_|CONNECT [A-F0-9]{8}/);
  const sealed = (await store.pool.query('SELECT sealed FROM accounts WHERE owner=$1', [f.owner])).rows[0].sealed;
  assert.doesNotMatch(sealed, /2026-09-18|fictional-stable/);
  await f.say('DISCONNECT wex');
  const delivered: string[] = [];
  for (let i = 0; i < 12; i++) await f.runtime.deliver(async (_route, text) => { delivered.push(text); });
  assert.ok(!delivered.some(t => t.includes('2026-09-18')), 'revocation suppresses unsent read results');
  for (let i = 0; i < 6; i++) await f.runtime.tick();
  assert.equal(f.profiles.size, 0);
});

test('profile archive delays and lost save responses reconcile the same profile name across restart', async () => {
  const f = fixture(); const save = f.browser.save; let attempts = 0;
  f.browser.save = async (session, name) => {
    if (++attempts === 1) return undefined;
    const id = await save(session, name);
    if (attempts === 2) throw new Error('Response lost after profile creation');
    return id;
  };
  const view = (await f.access.open(await f.begin()))!;
  await f.step(2); await f.access.done(view); await f.step(2);
  const name = (await f.connection()).browser!.profileName;
  f.advance(5000); await f.step();
  const restart = new PortalAccess(store, f.browser, [policy], 'https://benny.invalid', () => true, () => Date.parse('2026-09-14T12:05:00Z'));
  for (let i = 0; i < 6; i++) await restart.tick(f.owner);
  assert.equal((await f.connection()).status, 'awaiting_confirmation');
  assert.ok(f.profiles.has(name!)); assert.equal(f.profiles.size, 2);
  assert.equal(f.calls.filter(c => c.method === 'create').length, 2);
});

test('STOP, allowlist removal, expired tickets, generation changes and identity changes block access', async () => {
  const f = fixture(); const ticket = await f.begin();
  await f.say('STOP'); assert.equal(await f.access.open(ticket), undefined);
  await f.say('START'); const view = await f.connect();
  await f.say('STOP'); assert.equal(await f.access.view(view), undefined);
  await f.say('CHECK wex'); await f.step(); assert.equal((await f.connection()).browser!.phase, 'idle');
  await f.say('START'); f.switchAccount(); await f.say('CHECK wex');
  for (let i = 0; i < 9; i++) { await f.step(); f.advance(65_000); }
  assert.equal((await f.connection()).status, 'expired');
  assert.equal((await f.connection()).browser, undefined);
  assert.doesNotMatch(JSON.stringify((await f.account()).outbox), /someone-else|2026-09-18/);
  const expired = await f.begin(); f.advance(600_000); assert.equal(await f.access.open(expired), undefined);
  const replaced = await f.begin(); await f.say('CONNECT wex'); assert.equal(await f.access.open(replaced), undefined);
  const denied = await f.begin(); f.disallow(); assert.equal(await f.access.open(denied), undefined);
});

test('ambiguous creation is not repeated and late resources after disconnect are cleaned up', async () => {
  const f = fixture(); let release!: () => void; let started!: () => void;
  const entered = new Promise<void>(r => { started = r; }); const wait = new Promise<void>(r => { release = r; });
  const create = f.browser.create;
  f.browser.create = async (...args) => { const result = await create(...args); started(); await wait; return result; };
  await f.access.open(await f.begin());
  const work = f.access.tick(f.owner); await entered;
  f.advance(61_000); await f.access.tick(f.owner);
  assert.equal((await f.connection()).status, 'expired');
  await f.say('DISCONNECT wex'); release(); await work;
  await f.runtime.tick();
  assert.equal(f.calls.filter(c => c.method === 'create').length, 1);
  assert.ok(f.calls.some(c => c.method === 'close' && c.session === 'pbs_1'));
});

test('failed initial and restored navigation queues durable session cleanup without recreating browsers', async () => {
  for (const restore of [false, true]) {
    const f = fixture();
    if (restore) { await f.connect(); await f.say('CHECK wex'); }
    else await f.access.open(await f.begin());
    const create = f.browser.create;
    f.browser.create = async (...args) => {
      const result = await create(...args);
      throw new SkyvernRequestError(undefined, result.id);
    };
    await f.step();
    const created = f.calls.filter(c => c.method === 'create');
    const session = created.at(-1)!.session!;
    assert.equal(created.length, restore ? 3 : 1);
    assert.equal((await f.connection()).status, 'expired');
    assert.ok((await f.account()).revocations.some(r => JSON.parse(r.credential).session === session));
    const close = f.browser.close; let attempts = 0;
    f.browser.close = async id => { if (++attempts === 1) throw new SkyvernRequestError(503); await close(id); };
    // Cleanup processes one item per tick and retries vendor failures after one hour.
    for (let i = 0; i < 5; i++) { await f.runtime.tick(); f.advance(3_600_001); }
    await f.step(2);
    assert.ok(f.calls.some(c => c.method === 'close' && c.session === session));
    assert.equal((await f.account()).revocations.length, 0);
    assert.equal(f.calls.filter(c => c.method === 'create').length, created.length);
  }
});

test('HTTP capabilities require same-origin POST, isolate status, and reject stream access after Done', async t => {
  const f = fixture(); const ticket = await f.begin();
  const server = createServer((req, res) => { void handlePortalHttp(f.access, req, res); });
  attachPortalWebSocket(server, f.access); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(r => server.close(() => r())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, cookie = '', source = f.access.origin, body = { ticket }) => fetch(origin + path, {
    method: 'POST', headers: { origin: source, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(origin + '/benny/portal/status')).status, 401);
  assert.equal((await post('/benny/portal/open', '', 'https://evil.invalid')).status, 403);
  const opened = await post('/benny/portal/open'); assert.equal(opened.status, 200);
  const cookie = opened.headers.get('set-cookie')!; assert.match(cookie, /Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await post('/benny/portal/open')).status, 401);
  await f.step(2);
  const status = await fetch(origin + '/benny/portal/status', { headers: { cookie } });
  assert.deepEqual(await status.json(), { provider: 'wex', phase: 'login' });
  assert.equal(status.headers.get('cache-control'), 'no-store');
  for (const path of ['/benny/portal', '/benny/portal.js', '/benny/novnc/core/rfb.js', '/benny/novnc/vendor/pako/lib/zlib/inflate.js']) {
    assert.equal((await fetch(origin + path)).status, 200, path);
  }
  assert.equal((await post('/benny/portal/done', cookie)).status, 200);
  let viewers = 0; f.browser.viewer = () => { viewers++; throw new Error('must not open'); };
  const client = new WebSocket(origin.replace('http:', 'ws:') + '/benny/portal/stream', { origin: f.access.origin, headers: { cookie } });
  client.on('error', () => {}); await new Promise<void>(r => client.once('close', () => r())); assert.equal(viewers, 0);
});

test('live-view proxy carries binary input/output and closes an existing viewer on STOP', { timeout: 5000 }, async t => {
  const f = fixture(); const view = (await f.access.open(await f.begin()))!; await f.step(2);
  const upstream = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(upstream, 'listening');
  upstream.on('connection', ws => { ws.on('message', data => ws.send(data)); ws.send(Buffer.from('fictional-rfb-ready')); });
  f.browser.viewer = () => `ws://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const server = createServer(); attachPortalWebSocket(server, f.access);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    for (const ws of upstream.clients) ws.terminate();
    await new Promise<void>(r => upstream.close(() => r()));
    await new Promise<void>(r => server.close(() => r()));
  });
  const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/benny/portal/stream`, {
    origin: f.access.origin, headers: { cookie: `__Host-benny_portal=${view}` },
  });
  t.after(() => client.terminate());
  assert.equal((await once(client, 'message'))[0].toString(), 'fictional-rfb-ready');
  const reply = once(client, 'message'); client.send(Buffer.from([0, 17, 254, 63]));
  const [data, binary] = await reply; assert.equal(binary, true); assert.deepEqual(data, Buffer.from([0, 17, 254, 63]));
  const closed = once(client, 'close'); await f.say('STOP'); await closed;
  assert.equal(client.readyState, WebSocket.CLOSED);
});

test('Skyvern API contract opts into archiving, sanitizes errors and reconciles profile conflicts', async () => {
  let postProfiles = 0; let exists = false; const calls: Array<{ url: string; body: any }> = [];
  let endpoint = 'wss://api.skyvern.com/cdp'; let navigationFails = false;
  const navigations: string[] = [];
  const client = new SkyvernBrowserClient('fictional-api-key', async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).endsWith('/browser_sessions')) return Response.json({ browser_session_id: 'pbs_fixture' });
    if (String(url).includes('/browser_profiles?')) return Response.json(exists ? [{ name: 'unique-operation', browser_profile_id: 'bp_fixture' }] : []);
    if (String(url).endsWith('/browser_profiles')) { postProfiles++; exists = true; return new Response('sensitive vendor error', { status: 409 }); }
    return Response.json({ status: 'running', browser_address: endpoint, stream_transport: 'cdp', vnc_streaming_supported: false });
  }, async (address, headers, url) => {
    assert.equal(address, 'wss://api.skyvern.com/cdp');
    assert.deepEqual(headers, { 'x-api-key': 'fictional-api-key', 'X-Session-Id': 'pbs_fixture' });
    navigations.push(url);
    if (navigationFails) throw new Error('private navigation diagnostic');
  });
  assert.deepEqual(await client.create(policy.loginUrl), { id: 'pbs_fixture' });
  assert.deepEqual(calls[0]!.body, { timeout: 10, generate_browser_profile: true, needs_live_view: true });
  await client.create(policy.readUrl, 'bp_existing');
  assert.deepEqual(calls[2]!.body, { timeout: 10, generate_browser_profile: true, needs_live_view: false, browser_profile_id: 'bp_existing' });
  assert.deepEqual(navigations, [policy.loginUrl, policy.readUrl]);
  navigationFails = true;
  await assert.rejects(client.create(policy.loginUrl), e => e instanceof SkyvernRequestError && e.session === 'pbs_fixture' && !/private/.test(e.message));
  assert.equal(calls.filter(c => c.url.endsWith('/browser_sessions')).length, 3);
  assert.equal(await client.save('pbs_fixture', 'unique-operation'), undefined);
  assert.equal(await client.save('pbs_fixture', 'unique-operation'), 'bp_fixture'); assert.equal(postProfiles, 1);
  assert.equal(await client.viewable('pbs_fixture'), false);
  endpoint = 'wss://attacker.invalid/cdp';
  await assert.rejects(client.create(policy.loginUrl), e => e instanceof SkyvernRequestError && e.session === 'pbs_fixture');
  assert.equal(navigations.length, 3, 'never send the API key to an untrusted CDP host');
  await assert.rejects(client.snapshot('pbs_fixture', policy), /Skyvern request unavailable/);
  const failing = new SkyvernBrowserClient('fictional-api-key', async () => new Response('private credential', { status: 500 }));
  await assert.rejects(failing.create(policy.loginUrl), e => e instanceof Error && !/private credential/.test(e.message));
  assert.equal(portalPolicySchema.safeParse({ ...policy, readUrl: 'https://fixture.invalid/account?token=secret' }).success, false);
});

test('close accepts completed, closed and missing sessions but still closes running sessions', async () => {
  for (const status of ['completed', 'closed', 'running', 'missing', 'unavailable']) {
    const methods: string[] = [];
    const client = new SkyvernBrowserClient('fictional-api-key', async (_url, init) => {
      methods.push(init!.method!);
      if (status === 'missing') return new Response(null, { status: 404 });
      if (status === 'unavailable') return new Response(null, { status: 503 });
      return Response.json({ status });
    });
    if (status === 'unavailable') await assert.rejects(client.close('pbs_fixture'));
    else await client.close('pbs_fixture');
    assert.deepEqual(methods, status === 'running' ? ['GET', 'POST'] : ['GET']);
  }
});

test('CDP navigation opens the exact reviewed URL and rejects ambiguous pages and failed navigation', async t => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
  t.after(() => new Promise<void>(r => wss.close(() => r())));
  let pageUrl = 'about:blank'; let pages = 1; let failure: 'network' | 'download' | 'protocol' | undefined;
  const commands: any[] = [];
  wss.on('connection', ws => ws.on('message', (bytes, binary) => {
    assert.equal(binary, false, 'CDP frames must be text');
    const request = JSON.parse(bytes.toString()); commands.push(request); let result;
    if (request.method === 'Target.getTargets') result = { targetInfos: [
      { type: 'service_worker', url: policy.readUrl, targetId: 'worker' },
      ...Array.from({ length: pages }, () => ({ type: 'page', url: pageUrl, targetId: 'page' })),
    ] };
    else if (request.method === 'Target.attachToTarget') {
      assert.deepEqual(request.params, { targetId: 'page', flatten: true }); result = { sessionId: 'attached' };
    } else if (request.method === 'Page.navigate') {
      assert.equal(request.sessionId, 'attached');
      result = failure === 'network' ? { errorText: 'net::ERR_FAILED' } : failure === 'download' ? { isDownload: true } : { frameId: 'frame' };
    } else throw new Error(`Unexpected command: ${request.method}`);
    ws.send(JSON.stringify({ id: request.id, ...(failure === 'protocol' && request.method === 'Page.navigate' ? { error: { code: -1 } } : { result }) }));
  }));
  const address = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
  await navigateBrowser(address, {}, policy.loginUrl);
  pageUrl = 'https://fixture.invalid/stale-page';
  await navigateBrowser(address, {}, policy.readUrl);
  assert.deepEqual(commands.filter(c => c.method === 'Page.navigate').map(c => c.params), [{ url: policy.loginUrl }, { url: policy.readUrl }]);
  for (failure of ['network', 'download', 'protocol'] as const) await assert.rejects(navigateBrowser(address, {}, policy.readUrl));
  failure = undefined;
  const count = commands.filter(c => c.method === 'Page.navigate').length;
  for (pages of [0, 2]) await assert.rejects(navigateBrowser(address, {}, policy.readUrl));
  await assert.rejects(navigateBrowser(address, {}, 'https://fixture.invalid/account?token=secret'));
  assert.equal(commands.filter(c => c.method === 'Page.navigate').length, count);
  assert.deepEqual([...new Set(commands.map(c => c.method))], ['Target.getTargets', 'Target.attachToTarget', 'Page.navigate']);
});

test('portal keyboard sends exact keys without retaining text and reconnects without another browser creation', async () => {
  class Element extends EventTarget {
    hidden = false; disabled = false; value = ''; textContent = ''; selectionStart = 0; selectionEnd = 0;
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) { document.activeElement = undefined; this.dispatchEvent(new Event('blur')); } }
    setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; }
  }
  const elements = new Map<string, Element>();
  const element = (id: string) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id)!; };
  const document = Object.assign(new EventTarget(), { getElementById: element, activeElement: undefined as Element | undefined, hidden: false });
  const window = new EventTarget(); const sessions: FakeRfb[] = []; const keys: number[] = [];
  class FakeRfb extends EventTarget {
    focusOnClick = true;
    constructor() { super(); sessions.push(this); }
    disconnect() { this.dispatchEvent(new Event('disconnect')); }
    sendKey(key: number) { keys.push(key); }
  }
  let phase = 'login'; const requests: string[] = []; const tickets: string[] = [];
  const location = { hash: '#fictional-ticket', pathname: '/benny/portal', protocol: 'https:', host: 'benny.invalid' };
  const source = await readFile(new URL('../public/benny/portal.js', import.meta.url), 'utf8');
  const keysym = async (name: string) => runInNewContext((await readFile(new URL(`../node_modules/@novnc/novnc/core/input/${name}.js`, import.meta.url), 'utf8')).replace('export default', 'globalThis.value ='));
  runInNewContext(source.replace(/^import .*;$/gm, ''), { document, window, RFB: FakeRfb,
    KeyTable: await keysym('keysym'), keysyms: await keysym('keysymdef'),
    location, history: { replaceState() { location.hash = ''; } }, setTimeout() { return 1; }, clearTimeout() {},
    fetch: async (path: string, init?: RequestInit) => {
      requests.push(path);
      if (path.endsWith('/open')) { tickets.push(JSON.parse(String(init!.body)).ticket); phase = 'login'; }
      if (path.endsWith('/done')) phase = 'confirm';
      return { ok: true, json: async () => ({ phase, provider: 'fixture' }) };
    },
  });
  const click = async (id: string) => { element(id).dispatchEvent(new Event('click')); await new Promise(resolve => setImmediate(resolve)); };
  await click('open'); sessions[0]!.dispatchEvent(new Event('connect'));
  await click('keyboard'); assert.equal(document.activeElement, element('keyboard-input'));
  assert.equal(sessions[0]!.focusOnClick, false);
  const input = (value: string) => { element('keyboard-input').value = value; element('keyboard-input').dispatchEvent(new Event('input')); };
  input('_Azé🦎'); assert.deepEqual(keys, [65, 122, 233, 0x0101f98e]); assert.equal(element('keyboard-input').value, '_');
  input(''); assert.equal(keys.at(-1), 0xff08);
  element('keyboard-input').setSelectionRange(0, 1);
  element('keyboard-input').dispatchEvent(new Event('beforeinput'));
  input('_a'); assert.deepEqual(keys.slice(-2), [95, 97], 'replacement must not swallow an actual underscore');
  element('keyboard-input').value = '_é';
  const composing = Object.assign(new Event('input'), { isComposing: true });
  const beforeComposition = keys.length;
  element('keyboard-input').dispatchEvent(composing); assert.equal(keys.length, beforeComposition);
  element('keyboard-input').dispatchEvent(new Event('compositionend')); assert.equal(keys.at(-1), 233);
  input('_'); assert.equal(keys.length, beforeComposition + 1, 'final input must not duplicate composed text');
  await click('enter'); await click('backspace'); assert.deepEqual(keys.slice(-2), [0xff0d, 0xff08]);
  element('keyboard-input').value = 'unfinished'; document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(element('keyboard-input').value, ''); assert.equal(sessions[0]!.focusOnClick, true);
  sessions[0]!.disconnect(); assert.equal(element('reconnect').hidden, false);
  await click('reconnect'); assert.equal(sessions.length, 2);
  assert.equal(requests.filter(p => p.endsWith('/open')).length, 1);
  sessions[1]!.dispatchEvent(new Event('connect'));
  sessions[0]!.disconnect(); assert.equal(element('keyboard-controls').hidden, false, 'late old-socket events cannot hide the new keyboard');
  await click('done'); assert.equal(element('keyboard-controls').hidden, true);
  sessions[1]!.dispatchEvent(new Event('connect')); assert.equal(element('keyboard-controls').hidden, true, 'late connect cannot restore finished access');
  assert.match(element('status').textContent, /Return to iMessage/);
  assert.equal(element('keyboard-input').value, '');
  location.hash = '#replacement-ticket'; window.dispatchEvent(new Event('hashchange'));
  assert.equal(element('open').hidden, false); assert.equal(element('open').disabled, false);
  assert.deepEqual(tickets, ['fictional-ticket'], 'new link does not create a browser until explicitly opened');
  await click('open'); assert.deepEqual(tickets, ['fictional-ticket', 'replacement-ticket']);
  assert.equal(location.hash, '');
  window.dispatchEvent(new Event('pagehide'));
});

test('passive CDP checks account before fields and rejects ambiguous targets without any action commands', async t => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
  t.after(() => new Promise<void>(r => wss.close(() => r())));
  let duplicate = false; let fieldReads = 0; const methods: string[] = [];
  wss.on('connection', ws => ws.on('message', bytes => {
    const request = JSON.parse(bytes.toString()); methods.push(request.method); let result;
    if (request.method === 'Target.getTargets') result = { targetInfos: Array.from({ length: duplicate ? 2 : 1 }, () => ({ type: 'page', url: policy.readUrl, targetId: 'fictional' })) };
    else if (request.method === 'Target.attachToTarget') result = { sessionId: 'attached' };
    else if (request.method === 'Runtime.evaluate') {
      assert.equal(request.params.throwOnSideEffect, true);
      try {
        const value = runInNewContext(request.params.expression, { location: { origin: 'https://fixture.invalid', pathname: '/account' }, document: {
          querySelector: () => null,
          querySelectorAll(selector: string) {
            if (selector === '#deadline') fieldReads++;
            return [{ textContent: selector === '#label' ? 'Fictional account' : '2026-09-18', getAttribute: () => 'stable-account' }];
          },
        } });
        result = { result: { value } };
      } catch { result = { exceptionDetails: { text: 'rejected' } }; }
    } else throw new Error(`Unexpected command: ${request.method}`);
    ws.send(JSON.stringify({ id: request.id, result }));
  }));
  const address = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
  await assert.rejects(passiveSnapshot(address, {}, policy, 'wrong-account')); assert.equal(fieldReads, 0);
  const result = await passiveSnapshot(address, {}, policy, 'stable-account');
  assert.deepEqual(result.fields, [{ label: 'Filing deadline', value: '2026-09-18' }]); assert.equal(fieldReads, 1);
  duplicate = true; await assert.rejects(passiveSnapshot(address, {}, policy)); assert.equal(fieldReads, 1);
  assert.deepEqual([...new Set(methods)], ['Target.getTargets', 'Target.attachToTarget', 'Runtime.evaluate']);
});
