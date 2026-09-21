import 'dotenv/config';
import { deleteBrowserProfile } from './skyvern.js';
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
export async function loadIdentityIntoSeed(db: SeedDb): Promise<void> {  const c = getSupabase();
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

/**
 * Wipe a family's persisted identity so the agent treats them as brand new on the
 * next message (a truly fresh re-onboard). Clears guardian, profile, cases,
 * students, links, and the memory graph. Keeps the Gmail connection (a capability,
 * not identity) so reconnnect isn't needed.
 */
export async function clearFamilyIdentity(guardianId: string): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  try {
    await c.from('family_profile').delete().eq('guardian_id', guardianId);
    await c.from('case_record').delete().eq('guardian_id', guardianId);
    await c.from('family_memory').delete().eq('guardian_id', guardianId);
    // A fresh re-onboard starts with no memory, which has to include the words the family
    // used to describe things — otherwise a brand-new identity inherits the old vocabulary.
    await c.from('memory_alias').delete().eq('family_id', guardianId);
    const studentIds = (await c.from('child_link').select('student_id').eq('guardian_id', guardianId)).data?.map((r) => r.student_id as string) ?? [];
    await c.from('child_link').delete().eq('guardian_id', guardianId);
    if (studentIds.length) await c.from('student').delete().in('id', studentIds);
    await c.from('guardian').delete().eq('id', guardianId);
    console.log(`[identity] cleared family ${guardianId}`);
  } catch (e) {
    console.error('[identity] clear failed:', (e as Error)?.message ?? e);
  }
}

/**
 * Delete everything we hold about a family — the promised, provable version.
 *
 * `/reset` used to clear the core rows and stop there, leaving triaged school email, the
 * inbox address, the connected mailbox token and the vendor-side portal session behind.
 * A deletion request has to be true end to end, so this:
 *
 *  1. revokes vendor-side credentials FIRST (a saved portal session is a live credential we
 *     cannot rotate ourselves — it must not outlive the account),
 *  2. removes every table that references the family,
 *  3. writes one audit row recording that the deletion happened (the CCPA
 *     §1798.105(c)(2) suppression record, and what stops a re-import resurrecting them).
 *     It keeps the family id and counts — never the family's content.
 *
 * Rolls back nothing and swallows per-table errors into the receipt, because a partial
 * deletion that reports success is worse than one that reports exactly what survived.
 */
export async function deleteFamilyData(
  guardianId: string,
  opts: { conversationId?: string } = {},
): Promise<{ deleted: Record<string, number>; vendorProfilesRevoked: number; retained: string }> {
  const c = getSupabase();
  const deleted: Record<string, number> = {};
  let vendorProfilesRevoked = 0;
  const retained = 'encrypted backups until their cycle rolls; provider safety/abuse logs; consent + deletion audit rows';
  if (!c) return { deleted, vendorProfilesRevoked, retained: 'nothing was stored (no database configured)' };

  // Identifiers needed before the guardian row goes away.
  const phone = ((await c.from('guardian').select('phone').eq('id', guardianId).maybeSingle()).data?.phone ?? '') as string;
  const conns = ((await c.from('connection').select('id, skyvern_browser_profile_id').eq('family_id', guardianId)).data ?? []) as Array<{ skyvern_browser_profile_id?: string | null }>;
  const convIds = opts.conversationId
    ? [opts.conversationId]
    : (((await c.from('conversation').select('id').eq('guardian_id', guardianId)).data ?? []) as Array<{ id: string }>).map((r) => r.id);

  // 1. Vendor side first.
  for (const row of conns) {
    if (row.skyvern_browser_profile_id) {
      if (await deleteBrowserProfile(row.skyvern_browser_profile_id).catch(() => false)) vendorProfilesRevoked += 1;
    }
  }

  const count = async (table: string, column: string, value: string): Promise<void> => {
    if (!value) return;
    try {
      const { count: n, error } = await c.from(table).delete({ count: 'exact' }).eq(column, value);
      if (error) { console.warn(`[identity] delete ${table} failed:`, error.message); return; }
      deleted[table] = n ?? 0;
    } catch (e) { console.warn(`[identity] delete ${table} threw:`, (e as Error).message); }
  };

  await count('connection', 'family_id', guardianId);
  await count('incoming_email', 'family_id', guardianId);
  await count('family_inbox', 'family_id', guardianId);
  await count('gmail_token', 'guardian_id', guardianId);
  await count('family_memory', 'guardian_id', guardianId);
  // The family's own vocabulary (memory_alias) is family data like any other: it is keyed by
  // family_id, and it must go with them rather than leaving "we call it the noodle place"
  // behind to be matched against a future family's recall.
  await count('memory_alias', 'family_id', guardianId);
  await count('case_record', 'guardian_id', guardianId);
  await count('family_profile', 'guardian_id', guardianId);
  for (const id of convIds) await count('message', 'conversation_id', id);
  await count('verification', 'phone', phone);
  await count('child_link', 'guardian_id', guardianId);

  // Students are only ours if no other guardian still links to them.
  const studentIds = ((await c.from('child_link').select('student_id').eq('guardian_id', guardianId)).data ?? []) as Array<{ student_id: string }>;
  for (const { student_id } of studentIds) {
    const { count: others } = await c.from('child_link').select('guardian_id', { count: 'exact', head: true }).eq('student_id', student_id);
    if (!others) await count('student', 'id', student_id);
  }
  await count('guardian', 'id', guardianId);

  // 2. The audit / suppression record.
  try {
    await c.from('consent_event').insert({
      family_id: guardianId,
      kind: 'deletion',
      detail: { at: new Date().toISOString(), deleted, vendorProfilesRevoked, retained },
    });
  } catch (e) { console.warn('[identity] deletion receipt failed:', (e as Error).message); }

  console.log(`[identity] deleted family ${guardianId}:`, JSON.stringify(deleted), `vendor profiles revoked: ${vendorProfilesRevoked}`);
  return { deleted, vendorProfilesRevoked, retained };
}
