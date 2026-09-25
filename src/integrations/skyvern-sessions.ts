/**
 * Every Skyvern browser session we open for a form, and the deadline it closes by.
 *
 * A session bills for every minute it is open, idle or not. The fill leaves its session open
 * on purpose — the post-YES submit wants the page the parent reviewed — but that is a reason
 * to keep it for the review, not until Skyvern's own timeout. So each session carries a
 * `closeBy`, and one sweep closes whatever has passed it:
 *
 *   opened for a fill      → closeBy = the fill's budget
 *   fill finished, review  → closeBy = now + the review window
 *   submitted / declined / replaced / failed → closed on the spot
 *
 * A late YES after the review window still works: the submit sees the session is no longer
 * open and re-fills at the URL instead of trying a page that is gone.
 *
 * Rows live in Supabase (db/skyvern-session.sql) so a redeploy does not forget what it opened;
 * Skyvern's own session `timeout` is the backstop for everything else.
 */
import { getSupabase } from './db.js';

const BASE = () => process.env.SKYVERN_BASE_URL ?? 'https://api.skyvern.com';
const KEY = () => process.env.SKYVERN_API_KEY ?? '';

/** How long a filled form waits for the parent's YES before its browser is closed. */
export const REVIEW_WINDOW_MS = (Number(process.env.SKYVERN_REVIEW_WINDOW_MIN) || 30) * 60_000;

export interface TrackedSession {
  id: string;
  purpose: 'fill' | 'review' | 'submit';
  openedAt: number;
  closeBy: number;
}

const open = new Map<string, TrackedSession>();
/** Closed in this process — a late YES must not try to submit on one of these. */
const closed = new Set<string>();

export async function trackSession(id: string, purpose: TrackedSession['purpose'], closeInMs: number): Promise<void> {
  if (!id) return;
  const prev = open.get(id);
  const s: TrackedSession = { id, purpose, openedAt: prev?.openedAt ?? Date.now(), closeBy: Date.now() + closeInMs };
  open.set(id, s);
  closed.delete(id);
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('skyvern_session').upsert(
    { id, purpose, opened_at: new Date(s.openedAt).toISOString(), close_by: new Date(s.closeBy).toISOString() },
    { onConflict: 'id' },
  );
  if (error) console.warn('[skyvern-session] track failed:', error.message);
}

/** Is this session one we opened and have not closed? Unknown means no. */
export function isSessionOpen(id: string | undefined): boolean {
  return Boolean(id && open.has(id) && !closed.has(id));
}

/**
 * Close a session and forget it. Idempotent, bounded (10s per try), one retry. A session
 * Skyvern no longer knows (404/409/410) counts as closed. If both tries fail the row is kept,
 * so the next sweep tries again rather than losing track of something still billing.
 */
export async function closeSession(id: string, reason = 'done'): Promise<boolean> {
  if (!id || !KEY()) return false;
  if (closed.has(id) && !open.has(id)) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetchWithTimeout(`${BASE()}/v1/browser_sessions/${id}/close`, { method: 'POST', headers: { 'x-api-key': KEY() } }, 10_000);
    if (r && (r.ok || r.status === 404 || r.status === 409 || r.status === 410)) {
      await forget(id);
      console.log(`[skyvern-session] closed ${id} (${reason})`);
      return true;
    }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 1000));
  }
  console.warn(`[skyvern-session] could not close ${id} (${reason}) — the next sweep will retry`);
  return false;
}

async function forget(id: string): Promise<void> {
  open.delete(id);
  closed.add(id);
  const c = getSupabase();
  if (!c) return;
  const { error } = await c.from('skyvern_session').delete().eq('id', id);
  if (error) console.warn('[skyvern-session] forget failed:', error.message);
}

/** Close every session whose deadline has passed. Runs on the fill poller's tick. */
export async function sweepSessions(now = Date.now()): Promise<number> {
  let n = 0;
  for (const s of [...open.values()]) {
    if (s.closeBy <= now && (await closeSession(s.id, `${s.purpose} deadline passed`))) n++;
  }
  return n;
}

/** Reload what a previous process opened, so its deadlines still get enforced. */
export async function rehydrateSessions(): Promise<number> {
  const c = getSupabase();
  if (!c) return 0;
  const { data, error } = await c.from('skyvern_session').select('id, purpose, opened_at, close_by').limit(500);
  if (error) {
    console.warn('[skyvern-session] rehydrate failed:', error.message);
    return 0;
  }
  for (const r of data ?? []) {
    const id = String(r.id);
    if (!open.has(id) && !closed.has(id)) {
      open.set(id, {
        id,
        purpose: (r.purpose as TrackedSession['purpose']) ?? 'fill',
        openedAt: Date.parse(String(r.opened_at)) || Date.now(),
        closeBy: Date.parse(String(r.close_by)) || Date.now(),
      });
    }
  }
  return data?.length ?? 0;
}

/** Test seam. */
export function trackedSessions(): TrackedSession[] {
  return [...open.values()];
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
