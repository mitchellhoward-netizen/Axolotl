#!/usr/bin/env tsx
/**
 * Retention made true.
 *
 * docs/PRIVACY-AND-COMPLIANCE.md publishes a retention schedule (messages 90 days, triaged
 * school email 60 days) and, until this script existed, NOTHING enforced it — so the published
 * policy was a false claim. A published retention window with no job behind it is worse than no
 * policy at all: it is a promise a regulator, a district, or a parent can check.
 *
 * What this deletes, exactly:
 *   - `message`       older than 90 days (the conversation history, which is the family's own words)
 *   - `incoming_email` older than 60 days (triaged school mail: a summary + what needs doing)
 *
 * What it deliberately NEVER deletes:
 *   - `consent_event` — the audit trail of what a parent approved, and the deletion receipts.
 *     Keeping it is the point; it holds no family content (ids, counts, dates, actions).
 *   - `guardian` / `student` / `family_profile` / `case_record` / `family_memory` — those leave
 *     through deletion (the `/reset` path), not through ageing out. A retention sweep must never
 *     be the thing that half-deletes a family.
 *   - `family_inbox` — the forwarding address and its consent, which live as long as the account.
 *
 * Safe to run repeatedly (deleting by age is idempotent) and **dry-run by default**: it prints
 * what it WOULD delete and changes nothing until you pass --apply. Retention deletes real data,
 * so the destructive mode is opt-in and explicit. See docs/RETENTION.md for the cron line.
 *
 *   npm run prune:retention              # report only
 *   npm run prune:retention -- --apply   # actually delete
 *   npm run prune:retention -- --apply --json
 */
import 'dotenv/config';
import { getSupabase } from '../src/integrations/db.js';

export interface RetentionRule {
  /** Table to prune. */
  table: string;
  /** Timestamp column the window applies to. */
  column: string;
  /** Published window, in days. Do NOT change without changing the published policy. */
  days: number;
  /** What it holds, for the log line. */
  label: string;
}

/** The published schedule, verbatim from docs/PRIVACY-AND-COMPLIANCE.md. */
export const RETENTION_RULES: RetentionRule[] = [
  { table: 'message', column: 'created_at', days: 90, label: 'conversation messages' },
  { table: 'incoming_email', column: 'received_at', days: 60, label: 'triaged school email' },
];

/** The instant before which rows are expired. */
export function cutoffIso(days: number, now = Date.now()): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The selection predicate, pure so it can be tested without a database. A row is expired when
 * its timestamp is strictly older than the window. Exactly at the boundary (90 days to the
 * millisecond) it is KEPT: rounding in favour of keeping data is the safe direction, and it
 * makes the behaviour easy to reason about.
 */
export function isExpired(value: string | null | undefined, days: number, now = Date.now()): boolean {
  if (!value) return false; // a row with no timestamp is not ours to guess about
  const t = Date.parse(value);
  if (Number.isNaN(t)) return false;
  return t < Date.parse(cutoffIso(days, now));
}

export interface PruneResult { table: string; label: string; days: number; deleted: number }

/** Count (dry run) or delete (apply) the expired rows for every rule. */
export async function pruneRetention(opts: { now?: number; apply?: boolean } = {}): Promise<PruneResult[]> {
  const now = opts.now ?? Date.now();
  const apply = opts.apply === true;
  const c = getSupabase();
  if (!c) throw new Error('no database configured (SUPABASE_URL + a service key are required)');

  const out: PruneResult[] = [];
  for (const rule of RETENTION_RULES) {
    const cutoff = cutoffIso(rule.days, now);
    if (apply) {
      const { count, error } = await c.from(rule.table).delete({ count: 'exact' }).lt(rule.column, cutoff);
      if (error) throw new Error(`prune ${rule.table} failed: ${error.message}`);
      out.push({ table: rule.table, label: rule.label, days: rule.days, deleted: count ?? 0 });
    } else {
      const { count, error } = await c.from(rule.table).select('*', { count: 'exact', head: true }).lt(rule.column, cutoff);
      if (error) throw new Error(`count ${rule.table} failed: ${error.message}`);
      out.push({ table: rule.table, label: rule.label, days: rule.days, deleted: count ?? 0 });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');
  const now = Date.now();

  const results = await pruneRetention({ now, apply });
  if (json) {
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', at: new Date(now).toISOString(), results }, null, 2));
  } else {
    console.log(`retention: ${apply ? 'APPLY' : 'DRY RUN (nothing deleted — pass --apply to delete)'}`);
    for (const r of results) {
      const cutoff = cutoffIso(r.days, now).slice(0, 10);
      console.log(
        `  ${r.table.padEnd(15)} older than ${String(r.days).padStart(3)}d (before ${cutoff}): ` +
          `${apply ? 'deleted' : 'would delete'} ${r.deleted} row(s)  [${r.label}]`,
      );
    }
    console.log('  kept: consent_event (audit + deletion receipts), family_inbox, family/student records');
    if (!apply) console.log('\nRe-run with --apply to enforce the schedule.');
  }
}

// Only run when invoked directly (not when a test imports the predicate).
if (process.argv[1] && /prune-retention/.test(process.argv[1])) {
  main().catch((e) => {
    console.error('prune-retention failed:', (e as Error)?.message ?? e);
    process.exit(1);
  });
}
