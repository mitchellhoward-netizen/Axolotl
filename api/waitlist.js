import { createClient } from '@supabase/supabase-js';

/**
 * Vercel serverless: POST /api/waitlist { phone } → inserts into the Supabase
 * `waitlist` table. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as Vercel env vars.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const { phone } = (await req.json()) as { phone?: string };
    if (!phone || String(phone).replace(/\D/g, '').length < 7) {
      return Response.json({ ok: false, error: 'phone required' }, { status: 400 });
    }
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await client.from('waitlist').insert({ phone: String(phone) });
    if (error) return Response.json({ ok: false, error }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 400 });
  }
}
