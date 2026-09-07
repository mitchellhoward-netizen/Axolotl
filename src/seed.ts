import type { ID, MealStatus, Parent, School, Student, Teacher } from './domain/types.js';
import { schoolIdFromName } from './knowledge/districts.js';

/**
 * Demo/seed data. There is NO hardcoded district/school/teacher here: the seed
 * starts empty, and each family's students + school are created from what the
 * parent tells us during onboarding (their children + school). In production the
 * same records come from a real SIS (via Edlink, OneRoster, PowerSchool API, …)
 * — swap the `Sis` implementation for it; the agent code is agnostic.
 */
export interface SeedDb {
  parents: Parent[];
  students: Student[];
  schools: School[];
  teachers: Teacher[];
}

export function createSeedDb(): SeedDb {
  const schools: School[] = [];
  const teachers: Teacher[] = [];
  // No pre-seeded parents/students: every number is a fresh family that gets
  // onboarded, and their students are materialized from the profile.
  const students: Student[] = [];
  const parents: Parent[] = [];

  return { parents, students, schools, teachers };
}

/**
 * Resolve (or create) a parent for a sender's phone. This is the "phone = parent
 * ID" identity: an unknown number gets a stable provisional parent so the agent
 * can onboard them instead of bouncing them.
 */
export function provisionalParent(db: SeedDb, phone: string): Parent | undefined {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return undefined;
  const existing = db.parents.find((p) => p.phone === phone || p.phone?.replace(/\D/g, '') === digits);
  if (existing) return existing;
  const parent: Parent = {
    id: 'parent-' + digits.slice(-10),
    phone,
    email: '',
    firstName: '',
    lastName: '',
    studentIds: [],
  };
  db.parents.push(parent);
  return parent;
}

/**
 * Turn a completed onboarding profile into parent + student records (the "fresh
 * start" materialization). Called when onboarding finishes. Students are created
 * from the PARENT-PROVIDED children, and the school is resolved from the
 * profile's school name (+ city/state) — never a hardcoded default. No teacher is
 * invented: a real SIS supplies homeroom teachers, so we leave it unset.
 */
export function provisionFamily(db: SeedDb, parentId: string, profile: import('./domain/types.js').FamilyProfile): Parent | undefined {
  const parent = db.parents.find((p) => p.id === parentId);
  if (!parent) return undefined;
  if (profile.parentName) {
    const parts = profile.parentName.trim().split(/\s+/);
    parent.firstName = parts[0] ?? '';
    parent.lastName = parts.slice(1).join(' ');
  }
  const school = ensureSchool(db, profile);

  const ids: string[] = [];
  for (const child of profile.children) {
    const slug = (child.name || 'child').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sid = `student-${parent.id}-${slug}`;
    let student = db.students.find((s) => s.id === sid);
    if (!student) {
      student = {
        id: sid,
        firstName: child.name,
        lastName: '',
        grade: gradeNumber(child.grade),
        schoolId: school?.id ?? '',
        homeroomTeacherId: '',
        mealStatus: 'unknown',
      };
      db.students.push(student);
    }
    ids.push(student.id);
  }
  parent.studentIds = ids;
  return parent;
}

/** Find or create the family's School record from the profile (never a hardcoded default). */
function ensureSchool(db: SeedDb, profile: import('./domain/types.js').FamilyProfile): School | undefined {
  const name = profile.school?.trim();
  if (!name) return undefined;
  const id = schoolIdFromName(`${name} ${profile.location ?? ''}`.trim());
  const existing = db.schools.find((s) => s.id === id) ?? db.schools.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const school: School = {
    id,
    name,
    district: profile.district?.trim() || name,
    timezone: 'America/Los_Angeles',
  };
  db.schools.push(school);
  return school;
}

/** "K"/"pre-k" → 0, "3" → 3, else 0. */
export function gradeNumber(grade?: string): number {
  if (!grade) return 0;
  const g = grade.trim().toLowerCase();
  if (/^(pre[- ]?k|k|tk)$/.test(g)) return 0;
  const n = parseInt(g, 10);
  return Number.isFinite(n) ? n : 0;
}

export function mealStatusLabel(status: MealStatus): string {
  switch (status) {
    case 'free':
      return 'free meals';
    case 'reduced':
      return 'reduced-price meals';
    case 'paid':
      return 'full-price meals';
    case 'unknown':
      return 'no meal benefit on file';
  }
}

export function findStudent(db: SeedDb, id: ID): Student | undefined {
  return db.students.find((s) => s.id === id);
}
