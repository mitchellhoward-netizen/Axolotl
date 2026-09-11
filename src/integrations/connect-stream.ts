import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { skyvernVncUrl } from './skyvern.js';
import { getConnectionByToken } from './connections/store.js';

/**
 * Portal-takeover live view (Block 3d). The parent's browser runs a noVNC client that
 * connects here; we proxy the raw RFB bytes to Skyvern's authenticated VNC socket.
 *
 * WHY A PROXY: Skyvern's VNC stream authenticates with OUR API key (there is no scoped
 * per-session viewer token), so the parent must never connect to Skyvern directly. The
 * key stays server-side; the parent only ever holds an opaque, single-use connect_token.
 *
 *   [parent's noVNC]  <--ws-->  [this proxy]  <--wss + api key-->  [Skyvern VNC] --> browser
 */
export function attachConnectWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const m = path.match(/^\/connect\/([A-Za-z0-9_-]+)\/stream$/);
    if (!m) return; // not ours — leave the socket for another handler
    const token = m[1]!;

    void (async () => {
      let sessionId = '';
      try {
        const row = await getConnectionByToken(token);
        if (row && row.skyvern_session_id && (row.status === 'awaiting_login' || row.status === 'pending')) {
          sessionId = row.skyvern_session_id;
        }
      } catch (e) {
        console.error('[connect-stream] lookup failed:', (e as Error)?.message ?? e);
      }
      const target = sessionId ? skyvernVncUrl(sessionId) : null;
      if (!target) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (client) => bridge(client, target.url));
    })();
  });
}

/** Pipe raw bytes both ways between the parent's noVNC socket and Skyvern's VNC socket. */
function bridge(client: WebSocket, upstreamUrl: string): void {
  const upstream = new WebSocket(upstreamUrl);
  const closeBoth = (why: string) => {
    try {
      client.close();
    } catch {
      /* ignore */
    }
    try {
      upstream.close();
    } catch {
      /* ignore */
    }
    console.log('[connect-stream] closed:', why);
  };

  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
  });
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  client.on('close', () => closeBoth('client closed'));
  upstream.on('close', () => closeBoth('upstream closed'));
  client.on('error', (e) => {
    console.warn('[connect-stream] client error:', (e as Error).message);
    closeBoth('client error');
  });
  upstream.on('error', (e) => {
    console.warn('[connect-stream] upstream error:', (e as Error).message);
    closeBoth('upstream error');
  });
}
