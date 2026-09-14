import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { startWebServer } from '../src/integrations/web.js';

test('app server serves the marketing assets with browser-compatible content types', async (t) => {
  // Exercise the real server on a disposable loopback port, without starting
  // the messaging app or invoking any integration endpoints.
  const listen = Server.prototype.listen;
  let server!: Server;
  t.mock.method(Server.prototype, 'listen', function (this: Server) {
    server = this;
    return listen.call(this, { port: 0, host: '127.0.0.1' });
  });
  startWebServer({}, 0);
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const [path, type, content] of [
    ['/', 'text/html; charset=utf-8', '<title>Benny'],
    ['/site.css', 'text/css; charset=utf-8', '--ink:'],
    ['/site.js', 'text/javascript; charset=utf-8', 'mountWake'],
    ['/animation/wake.js', 'text/javascript; charset=utf-8', 'lottie'],
    ['/animation/benny-mark.svg', 'image/svg+xml', '<svg'],
    ['/animation/wake.json', 'application/json', 'Benny wakes up'],
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), type, path);
    assert.ok((await response.text()).includes(content!), path);
  }
});
