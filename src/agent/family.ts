import type { CaseRecord } from '../domain/types.js';

/** Create a case record with a stable id + timestamp. */
export function makeCase(rec: Omit<CaseRecord, 'id' | 'createdAt'>): CaseRecord {
  return {
    ...rec,
    id: `case-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };
}

/** Append a case (no duplicates / newest last). */
export function addCase(cases: CaseRecord[] | undefined, rec: CaseRecord): CaseRecord[] {
  // If a case of the same kind+child is already open, update it rather than duplicate.
  const existing = (cases ?? []).findIndex(
    (c) => c.kind === rec.kind && c.child === rec.child && c.status !== 'resolved',
  );
  if (existing >= 0) {
    const next = [...(cases ?? [])];
    next[existing] = { ...next[existing]!, status: rec.status, summary: rec.summary, reminder: rec.reminder };
    return next;
  }
  return [...(cases ?? []), rec];
}

/** A short human-readable status line for the open/awaiting cases. */
export function openCaseSummary(cases: CaseRecord[] | undefined): string {
  const open = (cases ?? []).filter((c) => c.status !== 'resolved');
  if (open.length === 0) return "No open cases right now.";
  return [
    `Here's what I'm tracking for you (${open.length}):`,
    ...open.map(
      (c) =>
        `• ${c.kind} — ${c.summary}${c.child ? ` (${c.child})` : ''}${c.status === 'awaiting' ? ' [awaiting the school]' : ''}`,
    ),
  ].join('\n');
}
