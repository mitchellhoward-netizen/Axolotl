import 'dotenv/config';
import { getSupabase } from './db.js';
import { type FamilyMemory, type Initiative } from '../domain/memory.js';

let mem = new Map<string, FamilyMemory>();

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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

export async function saveFamilyMemory(guardianId: string, memory: FamilyMemory): Promise<void> {
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

const base = (m?: FamilyMemory): FamilyMemory => ({
  needs: m?.needs ?? [],
  getting: m?.getting ?? [],
  initiatives: m?.initiatives ?? [],
  issueSummary: m?.issueSummary ?? [],
  notes: m?.notes,
});

/** Record something the family now has (e.g. "free meals"). */
export async function addGetting(guardianId: string, item: string): Promise<FamilyMemory> {
  const cur = base(await loadFamilyMemory(guardianId));

  if (!cur.getting.includes(item)) cur.getting = [...cur.getting, item];
  await saveFamilyMemory(guardianId, cur);
  return cur;
}

/** Open a new initiative the advocate will drive. */
export async function startInitiative(guardianId: string, label: string): Promise<FamilyMemory> {
  const cur = base(await loadFamilyMemory(guardianId));
  const initiative: Initiative = { id: nowId('initiative'), label, since: new Date().toISOString(), status: 'active' };
  cur.initiatives = [...cur.initiatives.filter((i) => i.label !== label), initiative];
  await saveFamilyMemory(guardianId, cur);
  return cur;
}

/** Mark an initiative done or paused. */
export async function setInitiativeStatus(
  guardianId: string,
  id: string,
  status: Initiative['status'],
): Promise<FamilyMemory> {
  const cur = base(await loadFamilyMemory(guardianId));
  cur.initiatives = cur.initiatives.map((i) => (i.id === id ? { ...i, status } : i));
  await saveFamilyMemory(guardianId, cur);
  return cur;
}
