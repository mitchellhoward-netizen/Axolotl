import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { PortalAccess } from './portal-access.js';

const COOKIE = '__Host-benny_portal';
const viewToken = (req: IncomingMessage) => req.headers.cookie?.split(';').map(s => s.trim())
  .find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'x-amp-review-widget': 'off' };

export async function handlePortalHttp(access: PortalAccess, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = new URL(req.url ?? '/', access.origin).pathname;
  if (!path.startsWith('/benny/portal') && !path.startsWith('/benny/novnc/')) return false;
  const json = (status: number, body: object) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  try {
    if (req.method === 'GET') {
      const files: Record<string, [string, string]> = {
        '/benny/portal': ['portal.html', 'text/html; charset=utf-8'],
        '/benny/portal.js': ['portal.js', 'text/javascript; charset=utf-8'],
        '/benny/portal.css': ['portal.css', 'text/css; charset=utf-8'],
      };
      if (files[path]) {
        const [file, mime] = files[path]!;
        res.writeHead(200, { ...headers, 'Content-Type': mime });
        res.end(await readFile(new URL(`../../public/benny/${file}`, import.meta.url))); return true;
      }
      if (/^\/benny\/novnc\/(core|vendor)\/[A-Za-z0-9_./-]+\.js$/.test(path) && !path.split('/').includes('..')) {
        const root = resolve(dirname(fileURLToPath(import.meta.resolve('@novnc/novnc'))), '..');
        const file = resolve(root, path.slice('/benny/novnc/'.length));
        if (!file.startsWith(root + sep)) { json(404, { error: 'Not found' }); return true; }
        const body = await readFile(file);
        res.writeHead(200, { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(body); return true;
      }
      if (path === '/benny/portal/status') {
        const grant = await access.view(viewToken(req));
        if (!grant) json(401, { error: 'Connection link expired, paused or revoked. Request a fresh link in iMessage.' });
        else json(200, { provider: grant.provider, phase: grant.connection.status === 'awaiting_verification' ? 'setup_saved' : grant.connection.status === 'awaiting_confirmation' ? 'confirm' : grant.connection.browser?.phase ?? 'unavailable' });
        return true;
      }
    }
    if (path === '/benny/portal/open' || path === '/benny/portal/done') {
      if (req.method !== 'POST') { json(405, { error: 'POST required' }); return true; }
      if (req.headers.origin !== access.origin || req.headers['content-type']?.split(';')[0] !== 'application/json') {
        json(403, { error: 'Same-origin JSON request required' }); return true;
      }
      if (path.endsWith('/done')) {
        const ok = await access.done(viewToken(req));
        json(ok ? 200 : 409, { ok }); return true;
      }
      let body = '';
      for await (const part of req.iterator({ destroyOnReturn: false })) {
        body += part.toString();
        if (Buffer.byteLength(body) > 512) { json(413, { error: 'Request too large' }); req.resume(); return true; }
      }
      let ticket: unknown;
      try { ticket = JSON.parse(body).ticket; } catch { json(400, { error: 'Invalid request' }); return true; }
      const view = typeof ticket === 'string' && await access.open(ticket);
      if (!view) { json(401, { error: 'This link is unavailable. Request a fresh connection link in iMessage.' }); return true; }
      res.setHeader('Set-Cookie', `${COOKIE}=${view}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600`);
      json(200, { ok: true }); return true;
    }
    json(404, { error: 'Not found' });
  } catch {
    if (!res.headersSent) json(503, { error: 'Connection temporarily unavailable. Return to iMessage.' });
    else res.end();
  }
  return true;
}

/** The upstream key/URL never reaches the client. Expiry, STOP, Done and revocation
 * remove viewer authority; an open connection is rechecked at least every second. */
export function attachPortalWebSocket(server: Server, access: PortalAccess): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  const viewers = new Map<string, WebSocket>();
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/benny/portal/stream') return;
    if (req.headers.origin !== access.origin) { socket.destroy(); return; }
    const ticket = viewToken(req);
    void (async () => {
      const grant = await access.view(ticket);
      const b = grant?.connection.browser;
      if (!grant || b?.phase !== 'login' || !b.session) { socket.destroy(); return; }
      const key = `${grant.owner}:${grant.connection.generation}`;
      wss.handleUpgrade(req, socket, head, client => {
        viewers.get(key)?.close(); viewers.set(key, client);
        const upstream = new WebSocket(access.browser.viewer(b.session!), { handshakeTimeout: 5000, maxPayload: 8 * 1024 * 1024 });
        const close = () => { clearInterval(timer); client.close(); upstream.close(); if (viewers.get(key) === client) viewers.delete(key); };
        let checking = false;
        const timer = setInterval(() => {
          if (checking) return;
          checking = true;
          void access.view(ticket).then(g => { if (g?.connection.browser?.phase !== 'login' || g.connection.browser.session !== b.session) close(); })
            .catch(close).finally(() => { checking = false; });
        }, 1000);
        timer.unref();
        client.on('message', (data, binary) => { if (upstream.bufferedAmount > 1024 * 1024) close(); else if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary }); });
        upstream.on('message', (data, binary) => { if (client.bufferedAmount > 8 * 1024 * 1024) close(); else if (client.readyState === WebSocket.OPEN) client.send(data, { binary }); });
        client.on('close', close); upstream.on('close', close);
        client.on('error', close); upstream.on('error', close);
      });
    })().catch(() => socket.destroy());
  });
  server.once('close', () => { for (const client of viewers.values()) client.terminate(); wss.close(); });
}
