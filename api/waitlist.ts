import { addSignup, confirmationText, parseSignup } from '../src/integrations/waitlist.js';
import { createSmsSender, normalizeE164 } from '../src/integrations/sms.js';
import { recordPendingGreeting } from '../src/integrations/pending-greeting.js';

/**
 * Vercel serverless: POST /api/waitlist
 *
 * One endpoint for the three things the site collects, told apart by `kind`:
 *   { kind: 'family', phone }
 *   { kind: 'circle', phone, families, school? }
 *   { kind: 'school', name, role, school, email, message? }
 *
 * Validation and storage live in src/integrations/waitlist.ts, shared with the
 * long-lived host (src/integrations/web.ts), so the two cannot disagree about
 * what a valid signup is.
 *
 * Nothing is written to a local file: if the database is unavailable the caller
 * gets a 503 and the form shows its error state, because a signup that silently
 * went nowhere is worse than one that visibly failed.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parseSignup(body);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  const { row } = parsed;

  const error = await addSignup(row);
  if (error) {
    console.error('[signup] store failed:', error);
    return Response.json({ ok: false, error: 'Signups are temporarily unavailable' }, { status: 503 });
  }

  // Only the family and circle signups get a confirmation text. A school request
  // is answered by email, so it must not receive a "you're on the list" SMS.
  const message = confirmationText(row);
  if (!message || !row.phone) return Response.json({ ok: true }, { status: 201 });

  const to = normalizeE164(row.phone);
  const sender = createSmsSender();
  let smsStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  if (sender) {
    const result = await sender.send(to, message);
    smsStatus = result.ok ? 'sent' : 'failed';
    if (result.ok) console.log('[signup] SMS sent to', to, result.id ?? '');
    else console.error('[signup] SMS FAILED:', result.error);
  } else {
    console.error('[signup] SMS skipped — no SMS provider configured.');
  }

  // iMessage fallback: if the text did not go out, hold the confirmation (keyed by
  // phone) so the agent sends it over iMessage when the parent first texts.
  let fallback: 'imessage-on-contact' | undefined;
  if (smsStatus !== 'sent') {
    await recordPendingGreeting(to, message).catch((e) =>
      console.error('[signup] pending-greeting record failed:', e),
    );
    fallback = 'imessage-on-contact';
  }

  return Response.json({ ok: true, sms: smsStatus, fallback }, { status: 201 });
}
