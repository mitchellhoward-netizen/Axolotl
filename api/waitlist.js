import { createClient } from '@supabase/supabase-js';

// ── SMS confirmation (Textbelt by default — free/cheap, no business profile) ──
// Textbelt POST https://textbelt.com/text { phone, message, key }. Free key
// "textbelt" = 1 text/day; create your own key for more volume. No A2P/brand
// registration. Set SMS_PROVIDER=retell to use Retell instead.
const TEXTBELT_ENDPOINT = 'https://textbelt.com/text';
const WAITLIST_MESSAGE =
  "Hey — you're on the waitlist. We'll text you when it's your turn to use Axolotl.";

/** The form sends digits only (e.g. "18313459066"); assume NANP (+1) when bare. */
function normalizeE164(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const hadPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits.length) return '';
  if (hadPlus) return '+' + digits;
  if (digits.length === 10) digits = '1' + digits;
  else if (digits.length === 11 && digits[0] !== '1') digits = '1' + digits;
  return '+' + digits;
}

async function sendViaTextbelt(to) {
  const key = process.env.TEXTBELT_KEY || 'textbelt';
  const res = await fetch(TEXTBELT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: to, message: WAITLIST_MESSAGE, key }),
  });
  const text = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
  if (!res.ok || !parsed.success) {
    const err = parsed.error || `Textbelt ${res.status}: ${text.slice(0, 200)}`;
    console.error('[waitlist] SMS FAILED:', err);
    return { ok: false, error: err };
  }
  console.log('[waitlist] SMS sent to', to);
  return { ok: true, id: parsed.textId != null ? String(parsed.textId) : undefined };
}

async function sendWaitlistSms(phone) {
  const to = normalizeE164(phone);
  if (!to) return { ok: false, skipped: true, error: 'invalid phone' };
  if ((process.env.SMS_PROVIDER || 'textbelt').toLowerCase() === 'textbelt') {
    try {
      return await sendViaTextbelt(to);
    } catch (e) {
      console.error('[waitlist] SMS error:', e);
      return { ok: false, error: String(e) };
    }
  }
  // Retell (opt-in)
  const agentId = process.env.RETELL_SMS_AGENT_ID ?? process.env.RETELL_AGENT_ID;
  if (!process.env.RETELL_API_KEY || !process.env.RETELL_FROM_NUMBER || !agentId) {
    console.error('[waitlist] SMS skipped — missing RETELL_API_KEY / RETELL_FROM_NUMBER / RETELL_SMS_AGENT_ID.');
    return { ok: false, skipped: true, error: 'not configured' };
  }
  const base = process.env.RETELL_API_BASE ?? 'https://api.retellai.com';
  try {
    const res = await fetch(`${base}/create-sms-chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: process.env.RETELL_FROM_NUMBER,
        to_number: to,
        override_agent_id: agentId,
        override_agent_version: 'latest_published',
        metadata: { kind: 'waitlist_confirm' },
        retell_llm_dynamic_variables: { waitlist_message: WAITLIST_MESSAGE },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[waitlist] SMS FAILED:', res.status, text.slice(0, 300));
      return { ok: false, error: `Retell SMS ${res.status}: ${text.slice(0, 200)}` };
    }
    console.log('[waitlist] SMS sent to', to);
    try { return { ok: true, id: JSON.parse(text).agent_id }; } catch { return { ok: true }; }
  } catch (e) {
    console.error('[waitlist] SMS error:', e);
    return { ok: false, error: String(e) };
  }
}

/**
 * Vercel serverless: POST /api/waitlist { phone } → inserts into the Supabase
 * `waitlist` table, then sends the "you're on the waitlist" text. Plain JS
 * (no type annotations) — Vercel runs .js as-is.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and RETELL_* keys as Vercel env vars.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const phone = body && body.phone;
    if (!phone || String(phone).replace(/\D/g, '').length < 7) {
      return Response.json({ ok: false, error: 'phone required' }, { status: 400 });
    }
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await client.from('waitlist').insert({ phone: String(phone) });
    if (error) return Response.json({ ok: false, error }, { status: 500 });

    const sms = await sendWaitlistSms(phone);
    const smsStatus = sms.ok ? 'sent' : sms.skipped ? 'skipped' : 'failed';

    // iMessage fallback: if the text didn't go out, hold the confirmation (keyed
    // by phone) so the agent sends it over iMessage when the parent first texts.
    let fallbackChannel;
    if (smsStatus !== 'sent') {
      await client.from('pending_greeting').upsert(
        { phone: normalizeE164(phone), message: WAITLIST_MESSAGE, created_at: new Date().toISOString() },
        { onConflict: 'phone' },
      );
      fallbackChannel = 'imessage-on-contact';
    }

    return Response.json({ ok: true, sms: smsStatus, fallback: fallbackChannel });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 400 });
  }
}
