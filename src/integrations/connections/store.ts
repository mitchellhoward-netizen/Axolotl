import 'dotenv/config';
import { getSupabase } from '../db.js';

/**
 * Persistence for connector `connection` rows (Block 3). The agent talks to Supabase
 * with the service_role key and scopes every query by `family_id` in code (RLS in
 * db/rls-family.sql is the defense-in-depth for direct/anon access).
 *
 * We store NO passwords and NO portal HTML — only the Skyvern `bp_...` handle.
 */
export interface ConnectionRow {
  id: string;
  family_id: string;
  kind: string;
  method: string;
  label?: string | null;
  portal_type?: string | null;
  login_url?: string | null;
  read_url?: string | null;
  extract_schema?: unknown;
  skyvern_browser_profile_id?: string | null;
  skyvern_session_id?: string | null;
  status: string; // pending|awaiting_login|connected|expired|revoked
  connect_token?: string | null;
  consented_at?: string | null;
  last_verified?: string | null;
  created_at?: string;
}

export async function getConnection(familyId: string, kind: string): Promise<ConnectionRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c
    .from('connection')
    .select('*')
    .eq('family_id', familyId)
    .eq('kind', kind)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ConnectionRow;
}

/** The family's connection currently waiting for the parent to finish signing in. */
export async function getAwaitingConnection(familyId: string): Promise<ConnectionRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c
    .from('connection')
    .select('*')
    .eq('family_id', familyId)
    .eq('status', 'awaiting_login')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ConnectionRow;
}

export async function getConnectionById(id: string): Promise<ConnectionRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('connection').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data as ConnectionRow;
}

export async function getConnectionByToken(token: string): Promise<ConnectionRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('connection').select('*').eq('connect_token', token).maybeSingle();
  if (error || !data) return null;
  return data as ConnectionRow;
}

export async function insertConnection(row: Partial<ConnectionRow> & { family_id: string; kind: string }): Promise<ConnectionRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('connection').insert(row).select('*').single();
  if (error || !data) {
    console.warn('[connections] insert failed:', error?.message);
    return null;
  }
  return data as ConnectionRow;
}

export async function updateConnection(id: string, patch: Partial<ConnectionRow>): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('connection').update(patch).eq('id', id);
  if (error) console.warn('[connections] update failed:', error.message);
}

/** Revoke: mark revoked and drop the handle. The profile is deleted separately in the connector. */
export async function markRevoked(id: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { error } = await c
    .from('connection')
    .update({ status: 'revoked', skyvern_browser_profile_id: null, skyvern_session_id: null, connect_token: null })
    .eq('id', id);
  if (error) console.warn('[connections] revoke failed:', error.message);
}
