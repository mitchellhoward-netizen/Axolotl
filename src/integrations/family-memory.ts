import 'dotenv/config';
import { getSupabase } from './db.js';
import { type FamilyMemory } from '../domain/memory.js';

/**
 * Family memory — persistence only.
 *
 * This module used to expose `addGetting` / `startInitiative` / `setInitiativeStatus`
 * directly, so any caller (including a model-authored tool path) could rewrite a family's
 * memory without validation. Every semantic mutator now lives in
 * `src/agent/memory-writer.ts`, which validates before it persists; the only way to write
 * from here is `persistFamilyMemory`, which requires a proof token minted by that writer.
 *
 * Read freely, write through the writer. `scripts/test-memory-writer.ts` fails if any other
 * module imports the write path.
 */

let mem = new Map<string, FamilyMemory>();

/**
 * A token that only the memory writer can obtain. The brand member is a module-private symbol,
 * so outside code cannot even name the key — a hand-built object literal cannot satisfy the type
 * without an explicit cast. (It must be a real runtime symbol, not `declare const`, or the
 * branded literal is erased and fails at runtime.)
 */
const memoryWriteBrand: unique symbol = Symbol('family-memory.write');
export interface MemoryWriteProof {
  readonly [memoryWriteBrand]: 'memory-writer';
}

/** Mint the proof token. **Only `memory-writer.ts` may call this.** */
export function mintMemoryWriteProof(): MemoryWriteProof {
  return { [memoryWriteBrand]: 'memory-writer' } as MemoryWriteProof;
}

/** Test-only seam: forget the in-process cache so a test can prove what was persisted. */
export function resetFamilyMemoryCache(): void {
  mem = new Map<string, FamilyMemory>();
}

/** Load a family's memory. Returns undefined if none recorded yet. */
export async function loadFamilyMemory(guardianId: string): Promise<FamilyMemory | undefined> {
  if (!guardianId) return undefined;
  const c = getSupabase();
  if (c) {
    try {
      const { data, error } = await c.from('family_memory').select('memory').eq('guardian_id', guardianId).maybeSingle();
      if (!error && data?.memory) return data.memory as FamilyMemory;
    } catch (e) {
      console.error('[family-memory] load failed (using memory):', (e as Error)?.message ?? e);
    }
  }
  return mem.get(guardianId);
}

/**
 * Persist a validated memory object. Requires the writer's proof token; reachable only
 * through `applyMemoryWrites`, so validation cannot be skipped by calling this directly.
 *
 * Deletion: this writes a single `family_memory` row keyed by guardian id, which
 * `deleteFamilyData` already removes. The consolidation pass deliberately adds no new table,
 * so deletion coverage is inherited rather than re-established.
 */
export async function persistFamilyMemory(
  guardianId: string,
  memory: FamilyMemory,
  proof: MemoryWriteProof,
): Promise<void> {
  if (proof[memoryWriteBrand] !== 'memory-writer') throw new Error('Unvalidated family memory write');
  if (!guardianId) return;
  mem.set(guardianId, memory);
  const c = getSupabase();
  if (!c) return;
  try {
    const { error } = await c
      .from('family_memory')
      .upsert({ guardian_id: guardianId, memory, updated_at: new Date().toISOString() }, { onConflict: 'guardian_id' });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('[family-memory] save failed (memory only):', (e as Error)?.message ?? e);
  }
}

/**
 * The empty shape, so readers and writers agree on what a partial row means.
 *
 * Every field of `FamilyMemory` is named here deliberately. A newly *required* field is then a
 * typecheck error rather than a silently dropped value — though a newly *optional* one would
 * still need adding by hand, since `undefined` satisfies it.
 */
export function baseFamilyMemory(m?: FamilyMemory): FamilyMemory {
  return {
    needs: m?.needs ?? [],
    getting: m?.getting ?? [],
    initiatives: m?.initiatives ?? [],
    issueSummary: m?.issueSummary ?? [],
    notes: m?.notes,
    // Carried through, not reconstructed: dropping these on a read-modify-write would erase
    // the consolidation pass's output every time an unrelated memory write happened.
    consolidatedAt: m?.consolidatedAt,
    contradictions: m?.contradictions ?? [],
  };
}
