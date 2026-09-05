import type { ID, MealStatus, Parent, School, Student, Teacher } from './domain/types.js';

/**
 * Demo/seed data. In production these records come from the SIS (via Edlink,
 * OneRoster, PowerSchool API, etc.). Keeping it in one place makes the v0 run
 * with zero external dependencies.
 */
export interface SeedDb {
  parents: Parent[];
  students: Student[];
  schools: School[];
  teachers: Teacher[];
}

export function createSeedDb(): SeedDb {
  const schools: School[] = [
    {
      id: 'school-soquel',
      name: 'Soquel Elementary School',
      district: 'Soquel Union Elementary School District',
      timezone: 'America/Los_Angeles',
    },
  ];

  const teachers: Teacher[] = [
    { id: 'teacher-rivera', schoolId: 'school-soquel', firstName: 'Ana', lastName: 'Rivera', subject: '3rd Grade' },
    { id: 'teacher-okafor', schoolId: 'school-soquel', firstName: 'Ben', lastName: 'Okafor', subject: '1st Grade' },
    { id: 'teacher-chen', schoolId: 'school-soquel', firstName: 'Lily', lastName: 'Chen', subject: 'Math' },
  ];

  // No pre-seeded parents/students: every number is a fresh family that gets
  // onboarded. (In a real deployment the SIS supplies these records; here the
  // agent creates them from onboarding — see provisionFamily below.)
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
 * start" materialization). Called when onboarding finishes; afterwards the
 * family is an established parent with children + a school.
 */
export function provisionFamily(db: SeedDb, parentId: string, profile: import('./domain/types.js').FamilyProfile): Parent | undefined {
  const parent = db.parents.find((p) => p.id === parentId);
  if (!parent) return undefined;
  if (profile.parentName) {
    const parts = profile.parentName.trim().split(/\s+/);
    parent.firstName = parts[0] ?? '';
    parent.lastName = parts.slice(1).join(' ');
  }
  const school = db.schools.find(
    (s) => profile.school && s.name.toLowerCase().includes(profile.school.toLowerCase()),
  ) ?? db.schools[0];
  const homeroom = db.teachers.find((t) => t.schoolId === school?.id) ?? db.teachers[0];

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
        homeroomTeacherId: homeroom?.id ?? '',
        mealStatus: 'unknown',
      };
      db.students.push(student);
    }
    ids.push(student.id);
  }
  parent.studentIds = ids;
  return parent;
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
