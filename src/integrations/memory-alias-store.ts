import 'dotenv/config';
import { getSupabase } from './db.js';
import { rankAliases, type AliasPair, type AliasSource } from '../agent/aliases.js';

/**
 * Persistence for aliases — other names a family uses for the same thing.
 *
 * Keyed by `family_id` on purpose: aliases belong to the family, so `deleteFamilyData`
 * reaches them by the same path as everything else, and one family's words can never
 * surface in another's recall.
 *
 * `source` is stored, not just used at write time, because it has to survive: a
 * parent-sourced alias must keep outranking a model-generated one on every read, not only
 * on the turn it was written.
 */
export interface StoredAlias extends AliasPair {
  source: AliasSource;
}

/**
 * Save aliases the parent stated. Idempotent: the same pair from the same family is a
 * no-op, so re-reading a message cannot inflate anything.
 */
export async function saveAliases(
  familyId: string,
  pairs: AliasPair[],
  source: AliasSource = 'parent',
): Promise<void> {
  const c = getSupabase();
  if (!c || !familyId || !pairs.length) return;
  const rows = pairs
    .filter((p) => p.a && p.b && p.a !== p.b)
    .map((p) => ({ family_id: familyId, alias: p.a, canonical: p.b, source }));
  if (!rows.length) return;
  const { error } = await c
    .from('memory_alias')
    .upsert(rows, { onConflict: 'family_id,alias,canonical', ignoreDuplicates: true });
  if (error) {
    // Say what the failure COSTS, not just that it happened. If the table is missing (the
    // live database did not have it at the time of writing — see db/APPLY-NOW.sql BLOCK 5),
    // every harvested alias is dropped here, and the only symptom is a parent's own word
    // not finding their own message later.
    console.warn(
      `[aliases] save failed (${error.code ?? 'unknown'}): ${error.message} — aliases will not persist; has db/memory-alias.sql been applied?`,
    );
  }
}

/**
 * A family's aliases, parent-sourced first. Bounded, because recall must not grow with the
 * number of things a family has ever called something.
 */
export async function listAliases(familyId: string, limit = 200): Promise<AliasPair[]> {
  const c = getSupabase();
  if (!c || !familyId) return [];
  const { data, error } = await c
    .from('memory_alias')
    .select('alias, canonical, source')
    .eq('family_id', familyId)
    .limit(limit);
  if (error || !data) {
    // Recall still works without aliases — it just cannot match the family's other word for
    // something — so this is a warning, not a failure. It must not be silent: the missing
    // table is indistinguishable from "this family has never used an alias".
    console.warn(
      `[aliases] load failed (${error?.code ?? 'unknown'}): ${error?.message ?? 'no data'} — recall will not expand the family's own words`,
    );
    return [];
  }
  const pairs: AliasPair[] = data.map((r) => ({
    a: String(r.alias ?? ''),
    b: String(r.canonical ?? ''),
    source: (r.source === 'model' ? 'model' : 'parent') as AliasSource,
  }));
  return rankAliases(pairs.filter((p) => p.a && p.b));
}
