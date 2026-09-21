import 'dotenv/config';
import { getSupabase } from './db.js';

/** A chat message in the conversation thread. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Persist one message to the conversation history (Supabase `message` table). */
export async function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  await c.from('message').insert({ conversation_id: conversationId, role, content });
}

/**
 * Load conversation history (oldest first).
 *
 * `limit` bounds it to the most recent N messages — pass it whenever the caller is filling
 * an in-memory window, because an unbounded load is how the agent used to pull an entire
 * year of a family's thread into RAM on every restart.
 */
export async function loadMessages(conversationId: string, limit?: number): Promise<ChatMessage[]> {
  const c = getSupabase();
  if (!c) return [];
  if (limit && limit > 0) {
    const { data, error } = await c
      .from('message')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    // Fetched newest-first so LIMIT means "the most recent N"; hand back oldest-first.
    return data.reverse().map((r) => ({ role: r.role as ChatMessage['role'], content: (r.content ?? '') as string }));
  }
  const { data, error } = await c
    .from('message')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ role: r.role as ChatMessage['role'], content: (r.content ?? '') as string }));
}

/** How many messages are persisted for this conversation. Null when there is no database. */
export async function countMessages(conversationId: string): Promise<number | null> {
  const c = getSupabase();
  if (!c) return null;
  const { count, error } = await c
    .from('message')
    .select('conversation_id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  if (error) return null;
  return count ?? null;
}

export interface MessageSearch {
  hits: ChatMessage[];
  /** Total matches in the database, so a capped result can be reported honestly. */
  totalMatches: number | null;
  /** True when more matches exist than were returned. */
  truncated: boolean;
}

/**
 * Search the PERSISTED history, newest matches first, with a hard cap on returned rows.
 *
 * This is what lets `recall_history` cover messages older than the in-memory window without
 * loading them: Postgres does the scanning and we take back only the matches. The cap is on
 * the result, not on the scan, so nothing is silently unsearched — and a caller that hits the
 * cap is told so via `truncated`/`totalMatches`, so it can say so rather than imply it saw
 * everything.
 */
export async function searchMessages(conversationId: string, needle: string, limit = 100): Promise<MessageSearch> {
  const c = getSupabase();
  if (!c) return { hits: [], totalMatches: null, truncated: false };
  const q = needle.trim();
  if (!q) return { hits: [], totalMatches: null, truncated: false };
  // Escape LIKE wildcards so a query containing % or _ matches literally.
  const pattern = `%${q.replace(/([%_\\])/g, '\\$1')}%`;
  const { data, count, error } = await c
    .from('message')
    .select('role, content', { count: 'exact' })
    .eq('conversation_id', conversationId)
    .ilike('content', pattern)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return { hits: [], totalMatches: null, truncated: false };
  const total = count ?? null;
  return {
    hits: data.reverse().map((r) => ({ role: r.role as ChatMessage['role'], content: (r.content ?? '') as string })),
    totalMatches: total,
    truncated: total !== null && total > data.length,
  };
}

/** Delete a conversation's persisted history (used by /reset for a truly fresh start). */
export async function clearMessages(conversationId: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  await c.from('message').delete().eq('conversation_id', conversationId);
}
