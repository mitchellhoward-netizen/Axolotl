import 'dotenv/config';
import { getSupabase } from './db.js';
import type { Parent, Student } from '../domain/types.js';
import type { SeedDb } from '../seed.js';

/**
 * Durable, SIS-free identity. The agent creates a parent + their children purely
 * from onboarding (no school SIS), then persists them to Supabase
 * (`guardian`, `student`, `child_link`). On startup the running seed is rehydrated
 * from Supabase, so self-onboarded families survive container restarts.
 */

function toGradeNum(g: string | null | undefined): number {
  if (!g) return 0;
  if (/^(pre[- ]?k|k|tk)$/i.test(g)) return 0;
  const n = parseInt(g, 10);
  return Number.isFinite(n) ? n : 0;
}

function studentFromRow(r: { id: string; school_id?: string | null; first_name?: string | null; last_name?: string | null; grade?: string | null }): Student {
  return {
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    grade: toGradeNum(r.grade),
    schoolId: r.school_id ?? '',
    homeroomTeacherId: '',
    mealStatus: 'unknown',
  };
}

function parentFromRow(r: { id: string; name?: string | null; phone?: string | null; email?: string | null }, studentIds: string[]): Parent {
  const parts = (r.name ?? '').trim().split(/\s+/);
  return {
    id: r.id,
    phone: r.phone ?? '',
    email: r.email ?? '',
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
    studentIds,
  };
}

/** Rehydrate the in-memory seed from Supabase (guardians + students + links). */
export async function loadIdentityIntoSeed(db: SeedDb): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  try {
    const [g, s, l] = await Promise.all([
      c.from('guardian').select('id, name, phone, email'),
      c.from('student').select('id, school_id, first_name, last_name, grade'),
      c.from('child_link').select('guardian_id, student_id'),
    ]);
    if (g.error || s.error || l.error) return;
    const guardians = (g.data ?? []) as Array<{ id: string; name?: string | null; phone?: string | null; email?: string | null }>;
    const students = (s.data ?? []) as Array<{ id: string; school_id?: string | null; first_name?: string | null; last_name?: string | null; grade?: string | null }>;
    const links = (l.data ?? []) as Array<{ guardian_id: string; student_id: string }>;
    if (!students.length && !guardians.length) return; // nothing durable yet
    db.students = students.map(studentFromRow);
    db.parents = guardians.map((gu) => {
      const ids = links.filter((lk) => lk.guardian_id === gu.id).map((lk) => lk.student_id);
      return parentFromRow(gu, ids);
    });
  } catch (e) {
    console.error('[identity] rehydrate failed (in-memory only):', (e as Error)?.message ?? e);
  }
}

/** Persist the provisioned family (guardian + students + child_links) to Supabase. */
export async function persistProvisionedFamily(db: SeedDb, parentId: string): Promise<void> {
  const c = getSupabase();
  const parent = db.parents.find((p) => p.id === parentId);
  if (!c || !parent) return;
  try {
    const name = [parent.firstName, parent.lastName].filter(Boolean).join(' ') || parent.id;
    await c.from('guardian').upsert({ id: parent.id, name, phone: parent.phone, email: parent.email }, { onConflict: 'id' });
    for (const sid of parent.studentIds) {
      const st = db.students.find((x) => x.id === sid);
      if (!st) continue;
      await c.from('student').upsert(
        { id: st.id, school_id: st.schoolId || null, first_name: st.firstName, last_name: st.lastName, grade: String(st.grade) },
        { onConflict: 'id' },
      );
      await c
        .from('child_link')
        .upsert({ guardian_id: parent.id, student_id: st.id, relationship: 'PARENT' }, { onConflict: 'guardian_id,student_id' });
    }
  } catch (e) {
    console.error('[identity] persist failed (in-memory only):', (e as Error)?.message ?? e);
  }
}
