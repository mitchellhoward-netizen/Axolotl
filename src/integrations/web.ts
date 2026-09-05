import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addWaitlist } from './waitlist.js';
import { WAITLIST_MESSAGE, createSmsSender, normalizeE164 } from './sms.js';
import { recordPendingGreeting } from './pending-greeting.js';

const WEB_DIR = path.resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const WAITLIST_FILE = path.join(WEB_DIR, 'waitlist.json');

/**
 * Serves the Axolotl landing page + captures waitlist signups.
 *   GET  /               → web/index.html
 *   GET  /ollie.png      → the axolotl logo
 *   POST /api/waitlist   → { phone } appended to web/waitlist.json (and logged)
 */
export function startWebServer(port: number = Number(process.env.WEB_PORT) || 3000): void {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

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

      // Static files
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

  server.listen(port, () => console.log(`🌐 Axolotl site → http://localhost:${port}`));
}
