import type { CaseRecord } from '../domain/types.js';

export type FollowUpKind = 'verify' | 'chase' | 'update';

/** A planned proactive touch with a family. */
export interface FollowUp {
  id: string;
  /** Which family/conversation this belongs to (so we message the right space). */
  conversationId: string;
  caseId: string;
  kind: FollowUpKind;
  dueAt: Date;
  /** Grounded, already-localized message body to send for verify/update. */
  body: string;
  createdAt: Date;
}

/**
 * Durable backend for the follow-up queue. Swap in Postgres/Supabase so the
 * advocate survives restarts; fall back to in-memory when absent.
 */
export interface FollowUpStore {
  load(): Promise<FollowUp[]>;
  save(f: FollowUp): Promise<void>;
  remove(id: string): Promise<void>;
}

/** The "don't inundate" guardrails. All are per-family. */
export interface FollowUpPolicy {
  /** Max proactive messages sent to one family per calendar day. */
  maxPerFamilyPerDay: number;
  /** Don't ping a family within this window of their last message (they may be mid-conversation). */
  cooldownMs: number;
  /** Local quiet hours (start inclusive, end exclusive). No proactive ping outside this window. */
  quietHours: { start: number; end: number };
  /** Drop an unfired follow-up once it has been due longer than this. */
  maxDueDays: number;
}

export const DEFAULT_FOLLOWUP_POLICY: FollowUpPolicy = {
  maxPerFamilyPerDay: 1,
  cooldownMs: 6 * 60 * 60 * 1000, // 6h
  quietHours: { start: 22, end: 8 }, // 10pm–8am
  maxDueDays: 14,
};

export interface FollowUpRunDeps {
  now: Date;
  policy?: FollowUpPolicy;
  /** True when the case is resolved/completed — the follow-up is moot. */
  isCaseResolved: (conversationId: string, caseId: string) => boolean;
  /** Last time the parent sent us a message (per conversation); undefined = never. */
  lastMessageAt: (conversationId: string) => Date | undefined;
  /** Proactive messages already sent to this family today. */
  sentToday: (conversationId: string) => number;
  /** Send a message to the family. */
  messenger: (conversationId: string, text: string) => Promise<void>;
  /** Record that a proactive ping went out (for the daily cap). */
  recordSent: (conversationId: string) => void;
}

export interface FollowUpRunResult {
  fired: number;
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * The "always-on advocate, but not a nag" loop. Decides WHEN to proactively
 * reach out and WHAT reaches the parent. Persists every change to `store` so it
 * survives restarts (no store → in-memory only).
 *
 *  - `verify`/`update` → message the parent, but only through the throttle.
 *  - `chase`           → NEVER message the parent. Chasing the school is the
 *                        agent's job; pestering the parent is the nagging we
 *                        removed. A chase is drained (and removed) silently.
 *
 * Gate order (safety before reach): case-resolved → chase-is-silent → expired →
 * quiet hours → cooldown → daily cap → fire. Quiet/cooldown/cap DEFER (re-fire
 * later) rather than drop; resolved/expired/chase drop for good.
 */
export class FollowUpEngine {
  private readonly byId = new Map<string, FollowUp>();
  private readonly store?: FollowUpStore;
  private readonly ready: Promise<void>;

  /** If the durable load fails (e.g. table not yet created), keep going in memory. */
  constructor(store?: FollowUpStore) {
    this.store = store;
    this.ready = store
      ? store
          .load()
          .then((items) => {
            for (const it of items) this.byId.set(it.id, it);
          })
          .catch((e) => {
            console.error('[followup] load failed (continuing in-memory):', e);
          })
      : Promise.resolve();
  }

  private async save(f: FollowUp): Promise<void> {
    if (this.store) await this.store.save(f);
  }

  private async remove(id: string): Promise<void> {
    if (this.store) await this.store.remove(id);
  }

  schedule(fu: Omit<FollowUp, 'id' | 'createdAt'>): void {
    // Dedupe: at most one outstanding follow-up per (conversation, case, kind).
    for (const existing of this.byId.values()) {
      if (
        existing.conversationId === fu.conversationId &&
        existing.caseId === fu.caseId &&
        existing.kind === fu.kind
      ) {
        this.byId.delete(existing.id);
        void this.remove(existing.id);
        break;
      }
    }
    const full: FollowUp = {
      ...fu,
      id: `fu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(),
    };
    this.byId.set(full.id, full);
    void this.save(full);
  }

  due(now: Date): FollowUp[] {
    return [...this.byId.values()].filter((f) => f.dueAt <= now);
  }

  async run(deps: FollowUpRunDeps): Promise<FollowUpRunResult> {
    await this.ready;
    const policy = deps.policy ?? DEFAULT_FOLLOWUP_POLICY;
    const now = deps.now;
    const result: FollowUpRunResult = { fired: 0, skipped: [] };

    for (const f of this.due(now)) {
      this.byId.delete(f.id); // drain; re-insert below when we defer it

      // 1. Moot — the case got resolved.
      if (deps.isCaseResolved(f.conversationId, f.caseId)) {
        await this.remove(f.id);
        result.skipped.push({ id: f.id, reason: 'case-resolved' });
        continue;
      }

      // 2. Agent-side chase: never pester the parent.
      if (f.kind === 'chase') {
        await this.remove(f.id);
        result.skipped.push({ id: f.id, reason: 'agent-handled' });
        continue;
      }

      // 3. Stale — it's been due too long.
      if (now.getTime() - f.dueAt.getTime() > policy.maxDueDays * 86_400_000) {
        await this.remove(f.id);
        result.skipped.push({ id: f.id, reason: 'expired' });
        continue;
      }

      // 4. Quiet hours — defer to the next allowed window.
      if (inQuietHours(now, policy.quietHours)) {
        await this.reschedule(f, nextWindow(now, policy.quietHours));
        result.skipped.push({ id: f.id, reason: 'quiet-hours' });
        continue;
      }

      // 5. Cooldown — the parent just messaged us; re-fire after the cooldown ends.
      const last = deps.lastMessageAt(f.conversationId);
      if (last && now.getTime() - last.getTime() < policy.cooldownMs) {
        const resume = new Date(last.getTime() + policy.cooldownMs);
        await this.reschedule(f, resume);
        result.skipped.push({ id: f.id, reason: 'cooldown' });
        continue;
      }

      // 6. Daily cap — don't inundate; defer to tomorrow.
      if (deps.sentToday(f.conversationId) >= policy.maxPerFamilyPerDay) {
        await this.reschedule(f, nextWindow(now, policy.quietHours));
        result.skipped.push({ id: f.id, reason: 'daily-cap' });
        continue;
      }

      // 7. Fire.
      try {
        await deps.messenger(f.conversationId, f.body);
        deps.recordSent(f.conversationId);
        await this.remove(f.id);
        result.fired++;
      } catch (e) {
        // Send failed — keep it to retry later, but back off a bit.
        await this.reschedule(f, new Date(now.getTime() + policy.cooldownMs));
        result.skipped.push({ id: f.id, reason: `send-error: ${(e as Error)?.message ?? String(e)}` });
      }
    }
    return result;
  }

  private async reschedule(f: FollowUp, dueAt: Date): Promise<void> {
    const updated: FollowUp = { ...f, dueAt };
    this.byId.set(f.id, updated);
    await this.save(updated);
  }

  pending(): number {
    return this.byId.size;
  }

  list(): FollowUp[] {
    return [...this.byId.values()].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  }

  /** True when the given case is no longer open (used as an injected resolver). */
  isResolved(cases: CaseRecord[] | undefined, caseId: string): boolean {
    const c = (cases ?? []).find((x) => x.id === caseId);
    return c ? c.status === 'resolved' : false;
  }
}

function inQuietHours(now: Date, qh: { start: number; end: number }): boolean {
  const h = now.getHours();
  if (qh.start <= qh.end) return h >= qh.start && h < qh.end;
  // wraps midnight (e.g. 22 → 8)
  return h >= qh.start || h < qh.end;
}

/** Public quiet-hours check (reused by the advocate gap pass). */
export function isQuietHours(now: Date, qh: { start: number; end: number }): boolean {
  return inQuietHours(now, qh);
}

/** The next allowed hour after `now`, given a quiet-hours window. */
function nextWindow(now: Date, qh: { start: number; end: number }): Date {
  const d = new Date(now);
  d.setHours(qh.end, 5, 0, 0); // just past the end of quiet hours
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}
