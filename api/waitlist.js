import { createClient } from '@supabase/supabase-js';

/**
 * Vercel serverless: POST /api/waitlist { phone } → inserts into the Supabase
 * `waitlist` table. Plain JS (no type annotations) — Vercel runs .js as-is.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as Vercel env vars.
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
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 400 });
  }
}
