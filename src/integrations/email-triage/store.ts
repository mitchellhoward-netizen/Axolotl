import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { getSupabase } from '../db.js';

/**
 * Email-triage persistence (Block 2). A parent forwards school mail to their per-family
 * address; we keep a SUMMARY + what needs doing — NEVER the raw body/html.
 *
 * `incoming_email.message_id` is UNIQUE: that IS the idempotency key (a webhook retry or
 * a duplicate forward is a no-op).
 */
export interface FamilyInboxRow {
  family_id: string;
  local_part: string;
  school_domains: string[];
  monitoring_consented_at?: string | null;
}

export interface IncomingEmailRow {
  id: string;
  family_id: string;
  message_id?: string | null;
  from_domain?: string | null;
  from_address?: string | null;
  received_at?: string;
  summary?: string | null;
  action_type?: string | null;
  urgency?: string | null;
  deadline?: string | null;
  status?: string | null;
}

/** A short, URL-safe local part derived from the child/family name + random suffix. */
export function makeLocalPart(seed?: string): string {
  const base = (seed ?? 'family')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'family';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

export async function getFamilyInbox(familyId: string): Promise<FamilyInboxRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('family_inbox').select('*').eq('family_id', familyId).maybeSingle();
  if (error || !data) return null;
  return data as FamilyInboxRow;
}

export async function getFamilyInboxByLocalPart(localPart: string): Promise<FamilyInboxRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('family_inbox').select('*').eq('local_part', localPart.toLowerCase()).maybeSingle();
  if (error || !data) return null;
  return data as FamilyInboxRow;
}

export async function upsertFamilyInbox(row: Partial<FamilyInboxRow> & { family_id: string; local_part: string }): Promise<FamilyInboxRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('family_inbox').upsert(row, { onConflict: 'family_id' }).select('*').single();
  if (error || !data) {
    console.warn('[email] family_inbox upsert failed:', error?.message);
    return null;
  }
  return data as FamilyInboxRow;
}

export async function updateFamilyInbox(familyId: string, patch: Partial<FamilyInboxRow>): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('family_inbox').update(patch).eq('family_id', familyId);
  if (error) console.warn('[email] family_inbox update failed:', error.message);
}

/**
 * Insert a triaged email. Returns the row, or null when it's a DUPLICATE (same
 * Message-ID) — the unique constraint is the dedupe.
 */
export async function insertIncomingEmail(row: Omit<IncomingEmailRow, 'id'>): Promise<IncomingEmailRow | null> {
  const c = getSupabase();
  if (!c) return null;
  const { data, error } = await c.from('incoming_email').insert(row).select('*').single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return null;
    console.warn('[email] incoming_email insert failed:', error.message);
    return null;
  }
  return data as IncomingEmailRow;
}

/** Cheap dedupe check before we spend an LLM call on classification. */
export async function emailExists(messageId: string): Promise<boolean> {
  const c = getSupabase();
  if (!c || !messageId) return false;
  const { data } = await c.from('incoming_email').select('id').eq('message_id', messageId).limit(1).maybeSingle();
  return Boolean(data);
}

export async function getEmailsByStatus(familyId: string, status: string, limit = 25): Promise<IncomingEmailRow[]> {  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('incoming_email')
    .select('*')
    .eq('family_id', familyId)
    .eq('status', status)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as IncomingEmailRow[];
}

export async function setEmailStatus(ids: string[], status: string): Promise<void> {
  if (!ids.length) return;
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('incoming_email').update({ status }).in('id', ids);
  if (error) console.warn('[email] status update failed:', error.message);
}

/** Revoke: purge every stored email for the family (raw bodies were never stored). */
export async function purgeEmails(familyId: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('incoming_email').delete().eq('family_id', familyId);
  if (error) console.warn('[email] purge failed:', error.message);
}
