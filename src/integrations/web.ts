import { createServer, type Server } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveWorld } from '../testworld/world.js';
import { resolveReviewToken } from './review-links.js';
import { verifyState } from '../lib/signed-state.js';
import { addSignup, confirmationText, parseSignup } from './waitlist.js';
import { handleInquiry } from './inquiry.js';
import { createSmsSender, normalizeE164 } from './sms.js';
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
import type { BennyMessaging } from '../benefits/messaging.js';
import { attachPortalWebSocket } from '../benefits/portal-http.js';

const WEB_DIR = path.resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

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
function verifySkyvernSignature(rawBody: Buffer, signature: unknown, timestamp?: unknown): boolean {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const apiKey = process.env.SKYVERN_API_KEY;
  if (!apiKey) return false;
  const expected = createHmac('sha256', apiKey).update(rawBody).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (!(a.length === b.length && timingSafeEqual(a, b))) return false;

  // Freshness. A valid signature with no time bound is a permanent replay key: anyone who
  // captures one webhook body can re-post it forever. Skyvern sends x-skyvern-timestamp
  // (seconds); we reject anything outside a 5-minute window. If the header is absent we
  // warn once and allow it (so a vendor change cannot silently break fills), unless
  // SKYVERN_WEBHOOK_REQUIRE_TS=true makes absence fatal.
  const MAX_SKEW_S = Number(process.env.SKYVERN_WEBHOOK_MAX_SKEW_S ?? 300);
  const ts = typeof timestamp === 'string' ? Number(timestamp) : NaN;
  if (!Number.isFinite(ts)) {
    if (process.env.SKYVERN_WEBHOOK_REQUIRE_TS === 'true') return false;
    if (!warnedMissingTs) { warnedMissingTs = true; console.warn('[webhooks/skyvern] no x-skyvern-timestamp — replay window is unbounded'); }
    return true;
  }
  const seconds = ts > 1e12 ? ts / 1000 : ts; // tolerate ms
  return Math.abs(Date.now() / 1000 - seconds) <= MAX_SKEW_S;
}
let warnedMissingTs = false;

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
 * Serves the Axolotl landing page + captures signups.
 *   GET  /               → public/index.html
 *   POST /api/waitlist   → a family, circle or school signup (see waitlist.ts)
 *   POST /api/inquiry    → a question from the contact form
 *   POST /api/call-me    → { phone } places a demo voice call to that number
 */
export function startWebServer(
  opts: {
    placeCall?: (phone: string, info?: PlaceCallInfo) => Promise<PlaceCallResult>;
    /** Small model for email classification (temperature 0). Falls back to no-LLM. */
    emailLlm?: LlmClient;
    benny?: BennyMessaging;
    ready?: () => Promise<boolean>;
  } = {},
  port: number = Number(process.env.WEB_PORT) || 3000,
): Server {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      // ── Test world (Tier B only) ─────────────────────────────────────────────
      // The fake district, mounted so a REMOTE browser vendor can reach it — Skyvern's
      // egress guard refuses localhost/private addresses, so Tier A's loopback server is
      // invisible to it. Off unless TESTWORLD_ENABLED=true, and even then only under an
      // unguessable token prefix: this must never be a browsable surface on a live host.
      if (process.env.TESTWORLD_ENABLED === 'true') {
        const token = process.env.TESTWORLD_TOKEN ?? '';
        const prefix = `/world/${token}`;
        if (token && url.pathname.startsWith(prefix + '/')) {
          const hit = serveWorld(url.pathname.slice(prefix.length), req.method);
          if (hit) {
            res.writeHead(hit.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(hit.html);
            return;
          }
        }
      }

      // ── Review images (/review/<token>) ─────────────────────────────────────
      // The parent gets OUR url, never a vendor's signed artifact URL. We resolve the opaque
      // token here and fetch the artifact server-side with our Skyvern key, so the key and the
      // signed URL stay out of the thread. The mapping is never logged.
      if (req.method === 'GET' && url.pathname.startsWith('/review/')) {
        const token = url.pathname.slice('/review/'.length);
        const artifactUrl = resolveReviewToken(token);
        if (!artifactUrl) {
          res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end('<h1>This preview has expired.</h1><p>Ask Axolotl to show the form again.</p>');
          return;
        }
        try {
          const upstream = await fetch(artifactUrl, {
            headers: process.env.SKYVERN_API_KEY ? { 'x-api-key': process.env.SKYVERN_API_KEY } : {},
          });
          if (!upstream.ok || !upstream.body) {
            // Honest failure: say what happened rather than rendering a broken image.
            res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end('<h1>I could not load that preview.</h1><p>Ask Axolotl to show the form again.</p>');
            return;
          }
          res.writeHead(200, {
            'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
            'Cache-Control': 'private, max-age=300',
          });
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
        } catch {
          res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end('<h1>I could not load that preview.</h1><p>Ask Axolotl to show the form again.</p>');
        }
        return;
      }

      if (url.pathname === '/health/ready') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
          res.end();
          return;
        }
        let ready = false;
        try {
          ready = await opts.ready?.() === true;
        } catch {
          // Readiness failures are intentionally represented only by the status.
        }
        res.writeHead(ready ? 200 : 503, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : ready ? 'ready' : 'unready');
        return;
      }
      // Additive routes: enabling life tools does not remove school/voice APIs.
      if (opts.benny && await opts.benny.http(req, res)) return;

      if (url.pathname === '/api/inquiry') {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
        }
        const response = await handleInquiry(req.iterator({ destroyOnReturn: false }));
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(await response.text());
        req.resume();
        return;
      }

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
        // Only a link we issued, still in date, can say which family this account joins.
        const guardianId = verifyState(url.searchParams.get('state') ?? '') ?? '';
        if (!code || !guardianId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('This connect link is invalid or has expired. Ask Axolotl for a fresh one.');
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
              `<p>${email ?? 'Your Gmail'} is now linked to Axolotl. If you turned on school-email monitoring, Axolotl checks for new mail from your school every few minutes and texts you only what needs doing. It can also send to the school as you — you approve every message. ` +
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
        if (!verifySkyvernSignature(raw, req.headers['x-skyvern-signature'], req.headers['x-skyvern-timestamp'])) {
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

      // Signups: the family pilot, a parent circle, and school pilot requests.
      // One route, told apart by `kind`. Validation and storage are shared with
      // the Vercel function (src/integrations/waitlist.ts).
      if (req.method === 'POST' && url.pathname === '/api/waitlist') {
        let body = '';
        for await (const chunk of req) body += String(chunk);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
          return;
        }
        const signup = parseSignup(parsed);
        if (!signup.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: signup.error }));
          return;
        }

        // No local-file fallback: a signup that only reached a file on an
        // ephemeral host is a signup that was lost, and reporting it as saved
        // would be a lie to the parent. Fail visibly instead.
        const err = await addSignup(signup.row);
        if (err) {
          console.error('[signup] store failed:', err);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Signups are temporarily unavailable' }));
          return;
        }
        console.log('[signup]', signup.row.kind);

        // Only the family and circle signups get a confirmation text; a school
        // request is answered by email.
        const message = confirmationText(signup.row);
        let smsStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
        let fallbackChannel: 'imessage-on-contact' | undefined;
        if (message && signup.row.phone) {
          const to = normalizeE164(signup.row.phone);
          const sms = createSmsSender();
          if (sms) {
            const r = await sms.send(to, message);
            smsStatus = r.ok ? 'sent' : 'failed';
            if (r.ok) console.log('[signup] SMS sent to', to, r.id ?? '');
            else console.error('[signup] SMS FAILED:', r.error);
          } else {
            console.error('[signup] SMS skipped — no SMS provider configured.');
          }

          // iMessage fallback: if the text didn't actually go out, hold the
          // confirmation and the agent will send it over iMessage on first contact.
          if (smsStatus !== 'sent') {
            await recordPendingGreeting(to, message).catch((e) =>
              console.error('[signup] pending-greeting record failed:', e),
            );
            fallbackChannel = 'imessage-on-contact';
          }
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
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
      const type = CONTENT_TYPES[path.extname(fp)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(content);
    } catch (e) {
      if (opts.benny) console.error('[benny] callback request unavailable');
      else console.error('[web] error:', e);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('error');
    }
  });

  // Each handler owns distinct paths; keep school/voice alongside life portals.
  attachVoiceWebSocket(server);
  attachConnectWebSocket(server);
  if (opts.benny?.runtime.portalAccess) attachPortalWebSocket(server, opts.benny.runtime.portalAccess);

  const host = process.env.RAILWAY_PUBLIC_DOMAIN ?? `localhost:${port}`;
  server.listen(port, () => {
    console.log(`🌐 Axolotl site → http://${host}`);
    console.log(`🎙️  Voice LLM → wss://${host}/voice-llm`);
  });
  return server;
}
