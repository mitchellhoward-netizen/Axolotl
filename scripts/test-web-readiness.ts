import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

// web.ts has transitive dotenv imports. Tests must never inspect the real .env.
process.env.DOTENV_CONFIG_PATH = '/dev/null';
const { startWebServer } = await import('../src/integrations/web.js');

type Options = NonNullable<Parameters<typeof startWebServer>[0]>;

async function fixture(options: Options) {
  const server: Server = startWebServer(options, 0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test('readiness follows an unready to ready to unready transition', async (t) => {
  let ready = false;
  const app = await fixture({ ready: async () => ready });
  t.after(app.close);

  assert.equal((await fetch(`${app.origin}/health/ready`)).status, 503);
  ready = true;
  assert.equal((await fetch(`${app.origin}/health/ready`)).status, 200);
  ready = false;
  assert.equal((await fetch(`${app.origin}/health/ready`)).status, 503);
});

test('missing and failing readiness callbacks are unavailable without leaking errors', async (t) => {
  const absent = await fixture({});
  t.after(absent.close);
  const missingResponse = await fetch(`${absent.origin}/health/ready`);
  assert.equal(missingResponse.status, 503);
  assert.equal(missingResponse.headers.get('cache-control'), 'no-store');

  const failed = await fixture({ ready: async () => { throw new Error('credential-secret'); } });
  t.after(failed.close);
  const failedResponse = await fetch(`${failed.origin}/health/ready`);
  assert.equal(failedResponse.status, 503);
  assert.doesNotMatch(await failedResponse.text(), /credential-secret/);
});

test('HEAD and unsupported methods have safe readiness semantics', async (t) => {
  let calls = 0;
  const app = await fixture({ ready: async () => { calls++; return true; } });
  t.after(app.close);

  const head = await fetch(`${app.origin}/health/ready`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(await head.text(), '');
  assert.equal(calls, 1);

  const post = await fetch(`${app.origin}/health/ready`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  assert.equal(post.headers.get('cache-control'), 'no-store');
  assert.equal(calls, 1);
});

test('readiness is available before the Benny callback-only 404 gate', async (t) => {
  let bennyCalls = 0;
  const benny = { runtime: {}, http: async () => { bennyCalls++; return false; } } as unknown as NonNullable<Options['benny']>;
  const app = await fixture({ ready: async () => true, benny });
  t.after(app.close);

  assert.equal((await fetch(`${app.origin}/health/ready`)).status, 200);
  assert.equal(bennyCalls, 0);
  assert.equal((await fetch(`${app.origin}/not-a-callback`)).status, 404);
  assert.equal(bennyCalls, 1);
});
