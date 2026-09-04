import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CaseRecord, FamilyProfile } from '../domain/types.js';

let sb: SupabaseClient | null = null;

/** Supabase client via the project URL + API keys (no DB password needed). */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!sb) sb = createClient(url, key, { auth: { persistSession: false } });
  return sb;
}

const ROOT_CAUSE: Record<string, string> = {
  transportation: 'TRANSPORTATION',
  homelessness: 'HOMELESSNESS',
  meals: 'MEALS',
  bullying: 'BULLYING',
  health: 'HEALTH',
  academic: 'ACADEMIC',
  attendance: 'ATTENDANCE',
  language: 'LANGUAGE',
  behavior: 'BEHAVIOR',
  general: 'OTHER',
  call: 'OTHER',
};

const INTERVENTION: Record<string, string> = {
  transportation: 'mckinney-vento-transport',
  homelessness: 'homeless-liaison-support',
  meals: 'free-reduced-meals',
  bullying: 'safety-plan',
  health: 'health-accommodation',
  attendance: 'tier-2-attendance-plan',
  academic: 'academic-support',
  language: 'language-support',
  behavior: 'behavior-plan',
  general: 'general-outreach',
  call: 'phone-follow-up',
};

/** Ensure a `guardian` row exists (FK for family_profile / case_record). */
export async function ensureGuardian(guardianId: string, name = 'Parent'): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  await c.from('guardian').upsert({ id: guardianId, name }, { onConflict: 'id' });
}

export async function saveFamilyProfile(guardianId: string, p: FamilyProfile): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  await ensureGuardian(guardianId);
  const base = {
    id: guardianId,
    guardian_id: guardianId,
    needs: p.needs ?? [],
    challenges: p.challenges ?? [],
    notes: p.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  // Prefer the `profile` jsonb column (full snapshot incl. children/school);
  // fall back to needs/challenges/notes if the column isn't added yet.
  let { error } = await c.from('family_profile').upsert({ ...base, profile: p }, { onConflict: 'guardian_id' });
  if (error) ({ error } = await c.from('family_profile').upsert(base, { onConflict: 'guardian_id' }));
  if (error) throw new Error(error.message);
}

/** Read a family's persisted profile (full snapshot, or minimal fallback). */
export async function getFamilyProfile(guardianId: string): Promise<FamilyProfile | undefined> {
  const c = getSupabase();
  if (!c) return undefined;
  // Prefer the full `profile` jsonb snapshot (children/school). If the column
  // isn't added yet, fall back to needs/challenges/notes.
  const { data, error } = await c.from('family_profile').select('profile').eq('guardian_id', guardianId).maybeSingle();
  if (!error && data?.profile) return data.profile as FamilyProfile;
  const { data: d2, error: e2 } = await c.from('family_profile').select('needs, challenges, notes').eq('guardian_id', guardianId).maybeSingle();
  if (e2 || !d2) return undefined;
  return { needs: d2.needs ?? [], challenges: d2.challenges ?? [], notes: d2.notes ?? null } as FamilyProfile;
}

/** Load everything we have on a family (profile + cases) to remember them across texts. */
export async function loadFamilySnapshot(guardianId: string): Promise<{ profile?: FamilyProfile; cases: CaseRecord[] }> {
  const profile = await getFamilyProfile(guardianId);
  const cases = await getCases(guardianId);
  return { profile, cases };
}

export async function ensureSeedDistrict(): Promise<string> {
  const c = getSupabase();
  if (!c) return 'district-suesd';
  await c.from('district').upsert({ id: 'district-suesd', name: 'Soquel Union Elementary School District', state: 'CA' }, { onConflict: 'id' });
  await c.from('school').upsert({ id: 'school-soquel', district_id: 'district-suesd', name: 'Soquel Elementary School' }, { onConflict: 'id' });
  return 'district-suesd';
}

export async function saveCaseRecord(guardianId: string, districtId: string, rec: CaseRecord): Promise<void> {
  const c = getSupabase();
  if (!c) return;
  await ensureGuardian(guardianId);
  const { error } = await c.from('case_record').upsert({
    id: rec.id,
    guardian_id: guardianId,
    district_id: districtId,
    root_cause: ROOT_CAUSE[rec.kind] ?? 'OTHER',
    intervention: INTERVENTION[rec.kind] ?? rec.kind,
    status: rec.status.toUpperCase(),
    summary: rec.summary,
    child_name: rec.child ?? null,
    contact_name: rec.contact ?? null,
    reminder: rec.reminder ?? null,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function getCases(guardianId: string): Promise<CaseRecord[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c
    .from('case_record')
    .select('id, root_cause, status, summary, child_name, contact_name, reminder, created_at')
    .eq('guardian_id', guardianId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: (row.root_cause as string).toLowerCase(),
    status: (row.status as string).toLowerCase() as CaseRecord['status'],
    summary: (row.summary as string) ?? '',
    child: row.child_name ?? undefined,
    contact: row.contact_name ?? undefined,
    reminder: row.reminder ?? undefined,
    createdAt: String(row.created_at ?? ''),
  }));
}
