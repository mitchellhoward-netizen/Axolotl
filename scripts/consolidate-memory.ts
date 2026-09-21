#!/usr/bin/env tsx
/**
 * The background consolidation pass (MEMORY-COMPARISON §4.2), as a job.
 *
 * Why: the conversational agent decides what to remember *mid-turn*, which is how memory
 * buckets accumulate duplicates and drift. This pass is out of band — it reads the stored
 * buckets and rewrites them coherently. It is the counterpart to the single validating writer
 * (§4.4): the writer stops new noise, this removes the noise already there.
 *
 * What it rewrites, exactly:
 *   - `getting`       exact duplicates (case/whitespace-insensitive) collapse to one
 *   - `initiatives`   duplicate labels collapse to the newest, staying `active` if any was
 *   - `contradictions` disagreements are FLAGGED for a human — never resolved
 *   - `consolidatedAt` stamped so a reader can tell whether the pass has run
 *
 * What it deliberately NEVER does:
 *   - **Delete.** Forgetting must carry an audit receipt (§5.5), so superseded and expired
 *     facts are *reported*, not removed. Real erasure is `deleteFamilyData` (with its receipt
 *     row) or the retention sweep. A cleanup job must never be the thing that drops data.
 *   - **Pick a winner.** Two contradictory statements about a child are surfaced with both
 *     sides intact; silently choosing one is a failure a parent cannot see or correct.
 *   - **Touch facts.** `PersonalContext` belongs to the parked benefits runtime; it is read for
 *     contradiction input only and never written here.
 *   - **Create consent-relevant state, stage an action, or mark anything `completed`.** The
 *     pass only rewrites memory. That is §4.2's hard requirement and the reason it can run
 *     unattended.
 *
 * Deletion coverage is inherited, not re-earned: everything written here lands inside the
 * existing `family_memory` row that `deleteFamilyData` already removes. No new table exists.
 *
 * **Dry-run by default.** It prints what it would change and writes nothing until `--apply`.
 *
 *   npm run consolidate:memory              # report only
 *   npm run consolidate:memory -- --apply   # rewrite the buckets
 *   npm run consolidate:memory -- --json    # machine-readable
 */
import 'dotenv/config';
import { getSupabase } from '../src/integrations/db.js';
import { baseFamilyMemory } from '../src/integrations/family-memory.js';
import { planConsolidation, type ConsolidationReport } from '../src/agent/memory-consolidate.js';
import { persistDerivedMemory } from '../src/agent/memory-writer.js';
import type { FamilyMemory } from '../src/domain/memory.js';

export interface FamilyConsolidation {
  guardianId: string;
  report: ConsolidationReport;
  memory: FamilyMemory;
}

/**
 * Plan (and optionally apply) consolidation for every family.
 *
 * Pure planning is delegated to `planConsolidation`; this function only does I/O. Facts are
 * not read here — there is no shipping fact store outside the parked benefits runtime, so
 * contradiction detection runs on the buckets themselves (`needs` vs `getting` drift), which
 * is real data the shipping product actually has.
 */
export async function consolidateMemory(opts: { now?: number; apply?: boolean; limit?: number } = {}): Promise<FamilyConsolidation[]> {
  const now = opts.now ?? Date.now();
  const apply = opts.apply === true;
  const c = getSupabase();
  if (!c) throw new Error('no database configured (SUPABASE_URL + a service key are required)');

  let query = c.from('family_memory').select('guardian_id, memory');
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw new Error(`read family_memory failed: ${error.message}`);

  const out: FamilyConsolidation[] = [];
  for (const row of data ?? []) {
    const guardianId = String((row as { guardian_id: string }).guardian_id);
    const memory = baseFamilyMemory((row as { memory?: FamilyMemory }).memory);
    const { memory: next, report } = planConsolidation({ memory, now });
    if (apply && report.changed) {
      await persistDerivedMemory(guardianId, next);
    }
    out.push({ guardianId, report, memory: next });
  }
  return out;
}

/** Short, non-identifying label for a log line. Never prints family content. */
function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');
  const now = Date.now();

  const results = await consolidateMemory({ now, apply });
  const changed = results.filter((r) => r.report.changed);

  if (json) {
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      at: new Date(now).toISOString(),
      families: results.length,
      familiesChanged: changed.length,
      reports: changed.map((r) => ({ family: shortId(r.guardianId), ...r.report })),
    }, null, 2));
  } else {
    console.log(
      `memory consolidation: ${apply ? 'APPLY' : 'DRY RUN (nothing written — pass --apply to rewrite)'}  ` +
        `(${results.length} family row(s))`,
    );
    if (!changed.length) {
      console.log('  nothing to consolidate: every bucket is already coherent.');
    }
    for (const r of changed) {
      const p = r.report;
      console.log(
        `  ${shortId(r.guardianId).padEnd(10)} ` +
          `${apply ? 'rewrote' : 'would rewrite'}: ` +
          `${p.gettingMerged} duplicate getting, ${p.initiativesDeduped} duplicate initiative(s), ` +
          `${p.contradictionsFlagged} new contradiction(s)`,
      );
    }
    const totals = results.reduce(
      (acc, r) => ({
        superseded: acc.superseded + r.report.supersededFacts,
        expired: acc.expired + r.report.expiredFacts,
        repeated: acc.repeated + r.report.repeatedFacts,
        contradictions: acc.contradictions + (r.memory.contradictions?.length ?? 0),
      }),
      { superseded: 0, expired: 0, repeated: 0, contradictions: 0 },
    );
    if (totals.contradictions) {
      console.log(`  ${totals.contradictions} open contradiction(s) held for a human — never auto-resolved.`);
    }
    console.log('  never touched: facts (parked runtime), deletions (that is deleteFamilyData + retention)');
    if (!apply && changed.length) console.log('\nRe-run with --apply to rewrite the buckets.');
  }
}

// Only run when invoked directly (not when a test imports the planner wrapper).
if (process.argv[1] && /consolidate-memory/.test(process.argv[1])) {
  main().catch((e) => {
    console.error('consolidate-memory failed:', (e as Error)?.message ?? e);
    process.exit(1);
  });
}
