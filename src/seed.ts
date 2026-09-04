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

  const students: Student[] = [
    {
      id: 'student-emma',
      firstName: 'Emma',
      lastName: 'Rodriguez',
      grade: 3,
      schoolId: 'school-soquel',
      homeroomTeacherId: 'teacher-rivera',
      mealStatus: 'unknown',
    },
    {
      id: 'student-liam',
      firstName: 'Liam',
      lastName: 'Rodriguez',
      grade: 1,
      schoolId: 'school-soquel',
      homeroomTeacherId: 'teacher-okafor',
      mealStatus: 'reduced',
    },
    {
      id: 'student-patrick',
      firstName: 'Patrick',
      lastName: 'Howard',
      grade: 1,
      schoolId: 'school-soquel',
      homeroomTeacherId: 'teacher-okafor',
      mealStatus: 'free',
    },
  ];

  const parents: Parent[] = [
    {
      id: 'parent-maya',
      phone: '+15550001111',
      email: 'maya.rodriguez@example.com',
      firstName: 'Maya',
      lastName: 'Rodriguez',
      studentIds: ['student-emma', 'student-liam'],
    },
    {
      id: 'parent-mitch',
      phone: '+18313459066',
      email: 'mitch.howard@example.com',
      firstName: 'Mitch',
      lastName: 'Howard',
      studentIds: ['student-patrick'],
    },
  ];

  return { parents, students, schools, teachers };
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
