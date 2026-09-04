import { initialState, type ConversationState } from './state.js';

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
 * plus a short rolling history so the LLM brain can remember the conversation.
 * Production: swap for Redis/Postgres with the same contract.
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

  /** Append a message to the rolling history (cap at 8). */
  appendHistory(conversationId: string, role: 'user' | 'assistant', content: string): void {
    const record = this.records.get(conversationId);
    if (!record) return;
    record.history = [...record.history, { role, content }].slice(-8);
  }

  getHistory(conversationId: string): ChatMessage[] {
    return this.records.get(conversationId)?.history ?? [];
  }

  reset(conversationId: string): void {
    this.records.delete(conversationId);
  }
}
