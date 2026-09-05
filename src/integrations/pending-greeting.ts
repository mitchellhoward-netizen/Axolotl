import 'dotenv/config';
import { getSupabase } from './db.js';

/**
 * "Pending first-contact iMessage greeting" store.
 *
 * When the waitlist confirmation can't be sent as SMS (no provider / failed /
 * free tier disabled), we record it here keyed by phone. The agent then sends
 * it as an iMessage the moment that parent first texts (which creates a real
 * iMessage chat — no SDK gap, no business profile). Durable in Supabase when
 * configured, in-memory otherwise. See db/pending_greeting.sql.
 */
let mem = new Map<string, string>();

/** Record a greeting to send on this phone's first iMessage (dedupes by phone). */
export async function recordPendingGreeting(phone: string, message: string): Promise<void> {
  if (!phone) return;
  mem.set(phone, message); // always available in-process; Supabase is best-effort
  const c = getSupabase();
  if (!c) return;
  try {
    const { error } = await c
      .from('pending_greeting')
      .upsert({ phone, message, created_at: new Date().toISOString() }, { onConflict: 'phone' });
    if (error) throw new Error(error.message);
  } catch (e) {
    // Table may not exist yet (run db/pending_greeting.sql) — keep in-memory.
    console.error('[greeting] record to Supabase failed (memory only):', (e as Error)?.message ?? e);
  }
}

/**
 * Return (and clear) the pending greeting for this phone. Supabase is
 * authoritative when configured (so the agent — possibly a different process —
 * sees greetings recorded by the Vercel waitlist handler); falls back to memory.
 */
export async function takePendingGreeting(phone: string): Promise<string | undefined> {
  if (!phone) return undefined;
  const c = getSupabase();
  if (c) {
    try {
      const { data, error } = await c.from('pending_greeting').select('message').eq('phone', phone).maybeSingle();
      if (!error) await c.from('pending_greeting').delete().eq('phone', phone);
      if (data?.message) return data.message as string;
    } catch (e) {
      console.error('[greeting] take from Supabase failed:', (e as Error)?.message ?? e);
    }
  }
  const message = mem.get(phone);
  mem.delete(phone);
  return message;
}

/** List pending greetings (diagnostics). */
export async function listPendingGreetings(): Promise<Array<{ phone: string; message: string }>> {
  const c = getSupabase();
  if (c) {
    const { data, error } = await c.from('pending_greeting').select('phone, message');
    if (!error && data) return (data ?? []) as Array<{ phone: string; message: string }>;
  }
  return [...mem.entries()].map(([phone, message]) => ({ phone, message }));
}
