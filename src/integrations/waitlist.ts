import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let sb: SupabaseClient | null = null;
function getSb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!sb) sb = createClient(url, key, { auth: { persistSession: false } });
  return sb;
}

/** Record a waitlist signup (phone). Returns an error message, or null on success. */
export async function addWaitlist(phone: string): Promise<string | null> {
  const c = getSb();
  if (!c) return 'Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).';
  const { error } = await c.from('waitlist').insert({ phone });
  if (error) return error.message;
  return null;
}
