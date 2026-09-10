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

/**
 * Serves the Axolotl landing page + captures waitlist signups.
 *   GET  /               → web/index.html
 *   GET  /ollie.png      → the axolotl logo
 *   POST /api/waitlist   → { phone } appended to web/waitlist.json (and logged)
 *   POST /api/call-me    → { phone } places a demo voice call to that number
 */
export function startWebServer(opts: { placeCall?: (phone: string, info?: PlaceCallInfo) => Promise<PlaceCallResult> } = {}, port: number = Number(process.env.WEB_PORT) || 3000): void {
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

  const host = process.env.RAILWAY_PUBLIC_DOMAIN ?? `localhost:${port}`;
  server.listen(port, () => {
    console.log(`🌐 Axolotl site → http://${host}`);
    console.log(`🎙️  Voice LLM → wss://${host}/voice-llm`);
  });
}
