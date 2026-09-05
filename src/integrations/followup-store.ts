import 'dotenv/config';
import type { FollowUp, FollowUpKind, FollowUpStore } from '../agent/followup.js';
import { getSupabase } from './db.js';

/**
 * Durable follow-up queue in Supabase (`followup` table). Every mutation the
 * FollowUpEngine makes is mirrored here, and the queue is reloaded on boot so
 * the advocate keeps working across restarts. See db/followups.sql for the table.
 */
export class SupabaseFollowUpStore implements FollowUpStore {
  async load(): Promise<FollowUp[]> {
    const c = getSupabase();
    if (!c) return [];
    const { data, error } = await c
      .from('followup')
      .select('id, conversation_id, case_id, kind, due_at, body, created_at');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      caseId: r.case_id as string,
      kind: r.kind as FollowUpKind,
      dueAt: new Date(r.due_at as string),
      body: (r.body ?? '') as string,
      createdAt: (r.created_at as string) ? new Date(r.created_at as string) : new Date(),
    }));
  }

  async save(f: FollowUp): Promise<void> {
    const c = getSupabase();
    if (!c) return;
    const { error } = await c.from('followup').upsert(
      {
        id: f.id,
        conversation_id: f.conversationId,
        case_id: f.caseId,
        kind: f.kind,
        due_at: f.dueAt.toISOString(),
        body: f.body,
        created_at: f.createdAt.toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(error.message);
  }

  async remove(id: string): Promise<void> {
    const c = getSupabase();
    if (!c) return;
    await c.from('followup').delete().eq('id', id);
  }
}

/** Return a durable store when Supabase is configured, else null (in-memory fallback). */
export function createFollowUpStore(): FollowUpStore | null {
  return getSupabase() ? new SupabaseFollowUpStore() : null;
}
