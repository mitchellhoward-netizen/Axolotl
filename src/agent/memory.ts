import { initialState, type ConversationState } from './state.js';
import { saveMessage, loadMessages, countMessages } from '../integrations/conversation-store.js';
import { harvestAliases } from './aliases.js';
import { saveAliases } from '../integrations/memory-alias-store.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Record {
  parentId: string;
  state: ConversationState;
  history: ChatMessage[];
  /** How many messages have been dropped off the front of the in-memory window. */
  trimmed: number;
}

/**
 * How many messages live in memory per conversation.
 *
 * This used to be unbounded: `rehydrate` loaded the entire thread and `recall_history`
 * scanned all of it, so RAM and scan time grew with the age of the account — a family a
 * year in paid for every recall. The window bounds that. Older messages are NOT lost (they
 * stay in Postgres and `recall` searches them there); they are simply not held in RAM.
 */
export const HISTORY_WINDOW = Math.max(40, Number(process.env.HISTORY_WINDOW_MESSAGES) || 200);

/**
 * In-memory conversation store (per conversation id): the agent state machine plus a
 * BOUNDED tail of the conversation history. History is persisted to Supabase (message
 * table) so it survives restarts, and anything outside the window stays reachable through
 * `recall_history` by a bounded database search rather than by loading it all.
 */
export class InMemoryStore {
  private readonly records = new Map<string, Record>();

  ensure(conversationId: string, parentId: string): Record {
    let record = this.records.get(conversationId);
    if (!record) {
      record = { parentId, state: initialState(), history: [], trimmed: 0 };
      this.records.set(conversationId, record);
    }
    return record;
  }

  getParentId(conversationId: string): string | undefined {
    return this.records.get(conversationId)?.parentId;
  }

  /** Every known conversation + its bound family (so a family can be reached by id). */
  conversations(): Array<{ conversationId: string; parentId: string }> {
    return [...this.records.entries()].map(([conversationId, r]) => ({ conversationId, parentId: r.parentId }));
  }

  /** The conversation bound to a family (first match), if any. */
  conversationForFamily(parentId: string): string | undefined {
    for (const [conversationId, r] of this.records) {
      if (r.parentId === parentId) return conversationId;
    }
    return undefined;
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
    else this.records.set(conversationId, { parentId, state: initialState(), history: [], trimmed: 0 });
  }

  /**
   * Append a message to the bounded window AND persist it (fire-and-forget).
   *
   * A parent's own message is also read for EXPLICIT aliases ("we call it the yellow card",
   * '"pasta", also called noodles'). That is deterministic pattern reading, never a model
   * call, so it costs nothing and cannot invent an equivalence the parent did not state.
   */
  appendHistory(conversationId: string, role: 'user' | 'assistant', content: string): void {
    const record = this.records.get(conversationId);
    if (!record) return;
    record.history = [...record.history, { role, content }];
    if (record.history.length > HISTORY_WINDOW) {
      const overflow = record.history.length - HISTORY_WINDOW;
      record.history = record.history.slice(overflow);
      record.trimmed += overflow;
    }
    void saveMessage(conversationId, role, content).catch((e) =>
      console.error('[history] persist failed:', (e as Error)?.message ?? e),
    );
    if (role === 'user' && record.parentId) {
      const pairs = harvestAliases(content);
      if (pairs.length) void saveAliases(record.parentId, pairs, 'parent').catch(() => {});
    }
  }

  /** The bounded window (newest last). */
  getHistory(conversationId: string): ChatMessage[] {
    return this.records.get(conversationId)?.history ?? [];
  }

  /**
   * What the window holds, and how much sits behind it. `recall` uses this to say what it
   * actually looked at instead of silently returning fewer results.
   */
  historyWindow(conversationId: string): { loaded: number; trimmed: number } {
    const r = this.records.get(conversationId);
    return { loaded: r?.history.length ?? 0, trimmed: r?.trimmed ?? 0 };
  }

  /** Seed the in-memory history for a conversation (used to rehydrate after restart). */
  setHistory(conversationId: string, messages: ChatMessage[], trimmed = 0): void {
    const record = this.records.get(conversationId);
    if (!record) return;
    record.history = messages.slice(-HISTORY_WINDOW);
    const overflow = messages.length - record.history.length;
    record.trimmed = trimmed + Math.max(0, overflow);
  }

  /**
   * Load the BOUNDED tail of the persisted history into memory. Anything older stays in the
   * database; `recall` reaches it with a bounded search rather than holding it in RAM.
   */
  async rehydrate(conversationId: string): Promise<void> {
    if ((this.records.get(conversationId)?.history.length ?? 0) > 0) return;
    const [msgs, total] = await Promise.all([
      loadMessages(conversationId, HISTORY_WINDOW).catch(() => [] as ChatMessage[]),
      countMessages(conversationId).catch(() => null),
    ]);
    if (!msgs.length) return;
    const behind = total === null ? 0 : Math.max(0, total - msgs.length);
    this.setHistory(conversationId, msgs, behind);
  }

  reset(conversationId: string): void {
    this.records.delete(conversationId);
  }
}
