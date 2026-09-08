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

/** Load the FULL conversation history for a conversation (newest last). */
export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('message')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ role: r.role as ChatMessage['role'], content: (r.content ?? '') as string }));
}

/** Delete a conversation's persisted history (used by /reset for a truly fresh start). */
export async function clearMessages(conversationId: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  await c.from('message').delete().eq('conversation_id', conversationId);
}
