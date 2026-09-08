import { initialState, type ConversationState } from './state.js';
import { saveMessage, loadMessages } from '../integrations/conversation-store.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Record {
  parentId: string;
  state: ConversationState;
  history: ChatMessage[];
}

/**
 * In-memory conversation store (per conversation id): the agent state machine
 * plus the FULL conversation history so the LLM brain can remember the thread and
 * recall any past turn. History is persisted to Supabase (message table) so it
 * survives restarts and scales; append writes through, and the thread is rehydrated
 * from the DB the first time a conversation is touched.
 */
export class InMemoryStore {
  private readonly records = new Map<string, Record>();

  ensure(conversationId: string, parentId: string): Record {
    let record = this.records.get(conversationId);
    if (!record) {
      record = { parentId, state: initialState(), history: [] };
      this.records.set(conversationId, record);
    }
    return record;
  }

  getParentId(conversationId: string): string | undefined {
    return this.records.get(conversationId)?.parentId;
  }

  getState(conversationId: string): ConversationState | undefined {
    return this.records.get(conversationId)?.state;
  }

  setState(conversationId: string, state: ConversationState): void {
    const record = this.records.get(conversationId);
    if (record) record.state = state;
  }

  bindParent(conversationId: string, parentId: string): void {
    const record = this.records.get(conversationId);
    if (record) record.parentId = parentId;
    else this.records.set(conversationId, { parentId, state: initialState(), history: [] });
  }

  /** Append a message to the full history AND persist it (fire-and-forget). */
  appendHistory(conversationId: string, role: 'user' | 'assistant', content: string): void {
    const record = this.records.get(conversationId);
    if (!record) return;
    record.history = [...record.history, { role, content }];
    void saveMessage(conversationId, role, content).catch((e) =>
      console.error('[history] persist failed:', (e as Error)?.message ?? e),
    );
  }

  getHistory(conversationId: string): ChatMessage[] {
    return this.records.get(conversationId)?.history ?? [];
  }

  /** Seed the in-memory history for a conversation (used to rehydrate after restart). */
  setHistory(conversationId: string, messages: ChatMessage[]): void {
    const record = this.records.get(conversationId);
    if (record) record.history = messages;
  }

  /** Load the full persisted history for a conversation into memory (if not already). */
  async rehydrate(conversationId: string): Promise<void> {
    if ((this.records.get(conversationId)?.history.length ?? 0) > 0) return;
    const msgs = await loadMessages(conversationId).catch(() => [] as ChatMessage[]);
    if (msgs.length) this.setHistory(conversationId, msgs);
  }

  reset(conversationId: string): void {
    this.records.delete(conversationId);
  }
}
