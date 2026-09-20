/**
 * Inbound abuse controls for the iMessage line.
 *
 * The line has no invite gate by default: any number that texts it gets an agent, and each
 * message can trigger paid model calls and (on a form) a paid browser session. Two controls:
 *
 *  - **An optional allowlist** (`AGENT_ALLOWLIST`, comma-separated handles). Unset means
 *    open — the current public behaviour. Setting it turns the line into an invited pilot,
 *    which is what you want while a handful of people are testing it.
 *  - **Per-sender rate limit + daily cap**, plus a global daily ceiling so one abusive
 *    number cannot run up the bill for everyone.
 *
 * In-memory and per-process on purpose: this bounds abuse and cost, and it is honest about
 * being a first line rather than a distributed limiter (documented as such). Being wrong
 * here is a cost problem, not a data problem.
 */

const WINDOW_MS = 60_000;
/** Read at call time, not import time, so configuration (and tests) always win. */
const limits = () => ({
  perMinute: Number(process.env.INBOUND_PER_MINUTE ?? 8),
  perDay: Number(process.env.INBOUND_PER_DAY ?? 200),
  globalPerDay: Number(process.env.INBOUND_GLOBAL_PER_DAY ?? 2_000),
});

interface Bucket { minuteStart: number; minuteCount: number; dayStart: number; dayCount: number }
const buckets = new Map<string, Bucket>();
let globalDayStart = 0;
let globalDayCount = 0;

export type InboundDenial = 'not_invited' | 'rate' | 'cap' | 'global_cap';

/** The allowlist, or null when the line is open. */
export function inboundAllowlist(): Set<string> | null {
  const raw = (process.env.AGENT_ALLOWLIST ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return raw.length ? new Set(raw) : null;
}

/** Normalise a sender handle so `+1 (831) 555-0100` and `+18315550100` match. */
export function normalizeHandle(id: string): string {
  const t = String(id ?? '').trim().toLowerCase();
  const digits = t.replace(/[^\d]/g, '');
  return /^\+?\d{7,}$/.test(t.replace(/[\s()-]/g, '')) ? `+${digits}` : t;
}

/**
 * Decide whether to process an inbound message. Pure-ish (a clock plus module state), so it
 * is unit-testable with a fixed `now`.
 */
export function allowInbound(senderId: string, now = Date.now()): { ok: true } | { ok: false; reason: InboundDenial } {
  const sender = normalizeHandle(senderId);
  const list = inboundAllowlist();
  if (list && !list.has(sender)) return { ok: false, reason: 'not_invited' };

  if (now - globalDayStart >= 86_400_000) { globalDayStart = now; globalDayCount = 0; }
  if (globalDayCount >= limits().globalPerDay) return { ok: false, reason: 'global_cap' };

  let b = buckets.get(sender);
  if (!b) { b = { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 }; buckets.set(sender, b); }
  if (now - b.minuteStart >= WINDOW_MS) { b.minuteStart = now; b.minuteCount = 0; }
  if (now - b.dayStart >= 86_400_000) { b.dayStart = now; b.dayCount = 0; }

  if (b.minuteCount >= limits().perMinute) return { ok: false, reason: 'rate' };
  if (b.dayCount >= limits().perDay) return { ok: false, reason: 'cap' };

  b.minuteCount += 1;
  b.dayCount += 1;
  globalDayCount += 1;
  return { ok: true };
}

/** What to text back, once. Deliberately plain and non-accusatory. */
export function denialMessage(reason: InboundDenial): string {
  switch (reason) {
    case 'not_invited':
      return "I'm not open to new numbers yet — I'm running with a small group of families. Reply STOP and I won't message you again.";
    case 'rate':
      return "I'm getting your messages faster than I can work. Give me a moment and send that again.";
    case 'cap':
    case 'global_cap':
      return "That's all I can take on today — I'll pick this back up tomorrow. If it's urgent, call the school office directly.";
  }
}

/** Test seam. */
export function resetInboundGuardForTest(): void {
  buckets.clear();
  globalDayStart = 0;
  globalDayCount = 0;
}
