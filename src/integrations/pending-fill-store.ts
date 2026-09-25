/**
 * Durable record of Skyvern fills that are still running.
 *
 * The fill is fire-and-forget: the parent is told "On it" and the webhook (or the fallback
 * poller) finishes the job minutes later. That bookkeeping used to live only in a Map, and
 * Railway redeploys on every push to main — so a deploy mid-fill meant the webhook arrived at
 * a process that had never heard of the run, found no conversation to reply to, and dropped
 * it. The parent never heard back. This table is what lets a new process pick the fill up.
 *
 * Same contract as the other stores: the in-process Map stays the fast path, Supabase is the
 * durable copy, and a missing database degrades to the old in-memory behaviour, not a crash.
 * Rows hold the values typed into the form (the family's own details), so they are deleted
 * the moment the fill resolves and are service-role only (db/pending-fill.sql).
 */
import { getSupabase } from './db.js';

export interface StoredPendingFill {
  runId: string;
  formUrl: string;
  values: Record<string, string>;
  browserSessionId: string;
  startedAt: number;
  progressNoticeAt?: number;
  meta?: Record<string, unknown>;
}

export async function savePendingFill(p: StoredPendingFill): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { error } = await c
    .from('pending_fill')
    .upsert({ run_id: p.runId, fill: p, updated_at: new Date().toISOString() }, { onConflict: 'run_id' });
  if (error) console.warn('[pending-fill] save failed:', error.message);
}

export async function deletePendingFill(runId: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('pending_fill').delete().eq('run_id', runId);
  if (error) console.warn('[pending-fill] delete failed:', error.message);
}

export async function loadPendingFill(runId: string): Promise<StoredPendingFill | undefined> {
  const c = getSupabase();
  if (!c) return undefined;
  const { data, error } = await c.from('pending_fill').select('fill').eq('run_id', runId).maybeSingle();
  if (error) {
    console.warn('[pending-fill] load failed:', error.message);
    return undefined;
  }
  return (data?.fill as StoredPendingFill | undefined) ?? undefined;
}

export async function loadAllPendingFills(): Promise<StoredPendingFill[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.from('pending_fill').select('fill').limit(500);
  if (error) {
    console.warn('[pending-fill] load-all failed:', error.message);
    return [];
  }
  return (data ?? []).map((r) => r.fill as StoredPendingFill).filter((f) => f?.runId);
}
