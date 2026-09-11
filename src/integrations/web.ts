import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addWaitlist } from './waitlist.js';
import { WAITLIST_MESSAGE, createSmsSender, normalizeE164 } from './sms.js';
import { recordPendingGreeting } from './pending-greeting.js';
import { attachVoiceWebSocket } from '../voice/server.js';
import { buildGmailAuthUrl, exchangeGmailCode, fetchGmailAddress, saveGmailToken } from './gmail.js';
import { handleFillComplete } from './skyvern.js';
import { attachConnectWebSocket } from './connect-stream.js';
import { getConnectionByToken } from './connections/store.js';
import { connectorFor } from './connections/index.js';
import './connections/parentPortal.js'; // registers the parent_portal connector
import { handleInboundEmail } from './email-triage/triage.js';
import type { LlmClient } from '../agent/llm.js';

const WEB_DIR = path.resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const WAITLIST_FILE = path.join(WEB_DIR, 'waitlist.json');

export interface PlaceCallResult {
  ok: boolean;
  error?: string;
}

export interface PlaceCallInfo {
  /** The child's school, so the agent can do a little research. */
  school?: string;
  /** The child's first name, for a tiny bit of personalization. */
  student?: string;
}

/**
 * Skyvern signs every webhook with the API key (HMAC-SHA256 over the RAW body,
 * hex-encoded in `x-skyvern-signature`). Reject a missing/invalid signature so a
 * forged `run_id` can't trigger completion. Act ON the comparison result.
 */
function verifySkyvernSignature(rawBody: Buffer, signature: unknown): boolean {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const apiKey = process.env.SKYVERN_API_KEY;
  if (!apiKey) return false;
  const expected = createHmac('sha256', apiKey).update(rawBody).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The parent-takeover page (Block 3d). A noVNC client connects to our server-side VNC
 * proxy (`/connect/<token>/stream`) so the parent drives the live browser and signs in
 * themselves — our Skyvern key never reaches the page, and we never see the password.
 */
function connectPage(token: string, label: string): string {
  const safeLabel = escapeHtml(label);
  const safeToken = escapeHtml(token);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in to your school portal</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
  header { padding: 14px 18px; }
  h1 { font-size: 17px; margin: 0 0 6px; }
  p.note { font-size: 13px; color: #94a3b8; margin: 0 0 10px; line-height: 1.4; }
  #screen { background: #000; min-height: 320px; height: 62vh; display: flex; align-items: center; justify-content: center; }
  footer { padding: 14px 18px; }
  button { background: #22c55e; color: #052e16; border: 0; border-radius: 10px; padding: 12px 18px; font-size: 15px; font-weight: 600; width: 100%; }
  #status { font-size: 13px; color: #cbd5e1; margin: 0 0 12px; min-height: 18px; }
</style>
</head>
<body>
<header>
  <h1>Sign in to ${safeLabel}</h1>
  <p class="note">This is your own private browser window. Axolotl never sees your password — when you're signed in and tap Done, we save only the signed-in session so we can read your child's info for you (never change anything).</p>
</header>
<div id="screen"></div>
<footer>
  <p id="status">Loading the secure browser…</p>
  <button id="done">I'm signed in — Done</button>
</footer>
<script type="module">
  const token = ${JSON.stringify(safeToken)};
  const statusEl = document.getElementById('status');
  const setStatus = (t) => { statusEl.textContent = t; };
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@novnc/novnc@1.5.0/core/rfb.js');
    const RFB = mod.default;
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/connect/' + token + '/stream';
    const rfb = new RFB(document.getElementById('screen'), wsUrl, { credentials: { password: '' } });
    rfb.scaleViewport = true;
    rfb.addEventListener('connect', () => setStatus('Connected. Sign in below, then tap Done.'));
    rfb.addEventListener('disconnect', () => setStatus('Disconnected. Reload this page to reconnect.'));
  } catch (e) {
    setStatus('Could not load the live view: ' + (e && e.message ? e.message : e) + '. Reload to retry.');
  }
  document.getElementById('done').addEventListener('click', async () => {
    setStatus('Checking your sign-in…');
    try {
      const r = await fetch('/connect/' + token + '/done', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      setStatus(j.ok ? '✅ Connected — you can close this and go back to iMessage.' : (j.detail || 'Not signed in yet — finish signing in, then tap Done again.'));
    } catch (e) {
      setStatus('Could not reach the server. Try again.');
    }
  });
</script>
</body>
</html>`;
}

/**
 * Serves the Axolotl landing page + captures waitlist signups.
 *   GET  /               → web/index.html
 *   GET  /ollie.png      → the axolotl logo
 *   POST /api/waitlist   → { phone } appended to web/waitlist.json (and logged)
 *   POST /api/call-me    → { phone } places a demo voice call to that number
 */
export function startWebServer(
  opts: {
    placeCall?: (phone: string, info?: PlaceCallInfo) => Promise<PlaceCallResult>;
    /** Small model for email classification (temperature 0). Falls back to no-LLM. */
    emailLlm?: LlmClient;
  } = {},
  port: number = Number(process.env.WEB_PORT) || 3000,
): void {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      // OAuth: connect the parent's Gmail so the agent can send as them (the gate).
      //   GET /oauth/gmail?state=<guardianId> -> bounce to Google consent
      //   GET /oauth/gmail/callback?state=<guardianId>&code=<code> -> store the token
      if (req.method === 'GET' && url.pathname === '/oauth/gmail') {
        const state = url.searchParams.get('state') ?? '';
        res.writeHead(302, { Location: buildGmailAuthUrl(state) });
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/oauth/gmail/callback') {
        const code = url.searchParams.get('code') ?? '';
        const guardianId = url.searchParams.get('state') ?? '';
        if (!code || !guardianId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code or state.');
          return;
        }
        try {
          const tok = await exchangeGmailCode(code);
          const email = await fetchGmailAddress(tok.accessToken);
          await saveGmailToken(guardianId, {
            guardianId,
            email,
            refreshToken: tok.refreshToken,
            accessToken: tok.accessToken,
            expiresAt: Date.now() + tok.expiresIn * 1000,
          });
          console.log(`[oauth/gmail] connected guardian ${guardianId}${email ? ` (${email})` : ''}`);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<html><body style="font-family:sans-serif"><h2>✅ Email connected</h2>' +
              `<p>${email ?? 'Your Gmail'} is now linked to Axolotl. The agent can send to the school as you (you always approve each message). ` +
              'You can close this tab and go back to iMessage.</p></body></html>',
          );
        } catch (e) {
          console.error('[oauth/gmail] exchange failed:', (e as Error)?.message ?? e);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Could not connect your Google account. Please try again.');
        }
        return;
      }

      // ── Portal takeover (Block 3d) ─────────────────────────────────────────
      // GET  /connect/:token      → the live-view page (noVNC → our VNC proxy)
      // POST /connect/:token/done → verify the parent's sign-in and save the profile
      const connectMatch = url.pathname.match(/^\/connect\/([A-Za-z0-9_-]+)(\/done)?$/);
      if (connectMatch) {
        const token = connectMatch[1]!;
        const row = await getConnectionByToken(token).catch(() => null);
        if (!row) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>This link is no longer active.</h1><p>Ask Axolotl to send you a fresh sign-in link.</p>');
          return;
        }
        if (req.method === 'GET' && !connectMatch[2]) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(connectPage(token, row.label ?? row.portal_type ?? 'your school portal'));
          return;
        }
        if (req.method === 'POST' && connectMatch[2]) {
          const connector = connectorFor(row.kind);
          const result = connector
            ? await connector.finalizeConnect(row.id).catch((e) => ({ ok: false, detail: (e as Error)?.message ?? 'failed' }))
            : { ok: false, detail: 'no connector for this connection' };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method not allowed');
        return;
      }

      // Inbound email (Block 2c): a Cloudflare Email Worker posts a forwarded school
      // email here with `x-inbound-secret`. Verify, ACK fast, triage in the background
      // (never leak whether an address exists; the raw body is never stored or logged).
      if (req.method === 'POST' && url.pathname === '/webhooks/inbound-email') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const raw = Buffer.concat(chunks);
        const secret = process.env.INBOUND_WEBHOOK_SECRET ?? '';
        const got = req.headers['x-inbound-secret'];
        const ok =
          secret.length > 0 &&
          typeof got === 'string' &&
          got.length === secret.length &&
          timingSafeEqual(Buffer.from(got), Buffer.from(secret));
        if (!ok) {
          console.warn('[webhooks/inbound-email] rejected: bad secret');
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('unauthorized');
          return;
        }
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>;
        } catch {
          /* malformed — still ACK so the worker doesn't retry-storm */
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        void handleInboundEmail(payload, opts.emailLlm)
          .then((r) => {
            if (r.status !== 'ok') console.log(`[email] ${r.status}${r.detail ? ` — ${r.detail}` : ''}`);
            else console.log(`[email] triaged ${r.emailId} (${r.urgency})`);
          })
          .catch((e) => console.error('[webhooks/inbound-email] triage error:', (e as Error)?.message ?? e));
        return;
      }

      // Skyvern async-fill webhook: the fill task finished (info: run_id + status).
      // Verify the signature, then ACK 200 IMMEDIATELY and complete the run in the
      // background — Skyvern only waits ~10s for a response, so we must not block.
      if (req.method === 'POST' && url.pathname === '/webhooks/skyvern') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const raw = Buffer.concat(chunks);
        if (!verifySkyvernSignature(raw, req.headers['x-skyvern-signature'])) {
          console.warn('[webhooks/skyvern] rejected bad signature');
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Invalid signature');
          return;
        }
        let runId = '';
        try {
          const payload = JSON.parse(raw.toString('utf8') || '{}') as { run_id?: string; status?: string };
          runId = payload.run_id ?? '';
          console.log(`[webhooks/skyvern] run ${runId} status=${payload.status ?? '?'}`);
        } catch {
          /* malformed body — still ACK, nothing to do */
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        if (runId) void handleFillComplete(runId).catch((e) => console.error('[webhooks/skyvern] handle error:', (e as Error)?.message ?? e));
        return;
      }

      // Waitlist submit
      if (req.method === 'POST' && url.pathname === '/api/waitlist') {
        let body = '';
        for await (const chunk of req) body += String(chunk);
        const { phone } = JSON.parse(body || '{}') as { phone?: string };
        if (!phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'phone required' }));
          return;
        }
        // Supabase if configured (prod), else fall back to a local JSON file (dev).
        const err = await addWaitlist(phone);
        let captured = false;
        if (!err) {
          console.log('[waitlist] (supabase)', phone);
          captured = true;
        } else {
          const entries: Array<{ phone: string; createdAt: string }> = existsSync(WAITLIST_FILE)
            ? (JSON.parse(readFileSync(WAITLIST_FILE, 'utf8')) as Array<{ phone: string; createdAt: string }>)
            : [];
          entries.push({ phone, createdAt: new Date().toISOString() });
          mkdirSync(WEB_DIR, { recursive: true });
          writeFileSync(WAITLIST_FILE, JSON.stringify(entries, null, 2));
          console.log('[waitlist] (file)', phone);
          captured = true;
        }

        // Send the confirmation text the moment they're on the list. Non-blocking
        // for the signup: a failed SMS never loses the signup, but is logged loudly.
        const sms = createSmsSender();
        let smsStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
        if (captured && sms) {
          const r = await sms.send(normalizeE164(phone), WAITLIST_MESSAGE);
          smsStatus = r.ok ? 'sent' : 'failed';
          if (r.ok) console.log('[waitlist] SMS sent to', normalizeE164(phone), r.id ?? '');
          else console.error('[waitlist] SMS FAILED:', r.error);
        } else if (captured) {
          console.error('[waitlist] SMS skipped — no SMS provider configured.');
        }

        // iMessage fallback: if the text didn't actually go out, hold the
        // confirmation and the agent will send it over iMessage on first contact.
        let fallbackChannel: 'imessage-on-contact' | undefined;
        if (captured && smsStatus !== 'sent') {
          await recordPendingGreeting(normalizeE164(phone), WAITLIST_MESSAGE).catch((e) =>
            console.error('[waitlist] pending-greeting record failed:', e),
          );
          fallbackChannel = 'imessage-on-contact';
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sms: smsStatus, fallback: fallbackChannel }));
        return;
      }

      // "Talk to your assistant" — place a demo voice call to the visitor's number.
      if (req.method === 'POST' && url.pathname === '/api/call-me') {
        let body = '';
        for await (const chunk of req) body += String(chunk);
        const { phone, school, student } = JSON.parse(body || '{}') as { phone?: string; school?: string; student?: string };
        const normalized = normalizeE164(phone ?? '');
        if (!normalized) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'A valid phone number is required.' }));
          return;
        }
        if (!opts.placeCall) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Voice is not configured.' }));
          return;
        }
        const result = await opts.placeCall(normalized, { school: (school ?? '').trim(), student: (student ?? '').trim() });
        res.writeHead(result.ok ? 200 : 502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // Static files (landing page). Skipped in RUN_AGENT_ONLY mode — Vercel
      // serves the site; this host only runs the agent + waitlist + voice LLM.
      if (process.env.RUN_AGENT_ONLY === 'true') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
      const fp = path.join(WEB_DIR, file);
      if (!existsSync(fp)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const content = readFileSync(fp);
      const type = fp.endsWith('.html') ? 'text/html; charset=utf-8' : fp.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(content);
    } catch (e) {
      console.error('[web] error:', e);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('error');
    }
  });

  // Live voice (Retell custom LLM) — the assistant drives outbound calls to parents.
  attachVoiceWebSocket(server);
  // Portal-takeover live view: proxy noVNC → Skyvern's authenticated VNC stream.
  attachConnectWebSocket(server);

  const host = process.env.RAILWAY_PUBLIC_DOMAIN ?? `localhost:${port}`;
  server.listen(port, () => {
    console.log(`🌐 Axolotl site → http://${host}`);
    console.log(`🎙️  Voice LLM → wss://${host}/voice-llm`);
  });
}
