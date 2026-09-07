import type { ID, Parent, School, Student, Teacher } from '../domain/types.js';
import type { SeedDb } from '../seed.js';

export interface AbsenceSubmission {
  studentId: ID;
  /** ISO yyyy-mm-dd. */
  date: string;
  reason: string;
  fullDay: boolean;
  /** True for planned absences (travel, appointments) vs. sick. */
  planned: boolean;
}

export interface AbsenceReceipt {
  referenceId: string;
  submittedAt: string;
}

/**
 * Minimal Student Information System contract. Real implementations would wrap
 * PowerSchool / Infinite Campus APIs directly, OneRoster, or an aggregator such
 * as Edlink (which also models parent/guardian authorization).
 */
export interface Sis {
  listStudents(parentId: ID): Promise<Student[]>;
  getStudent(studentId: ID): Promise<Student | undefined>;
  listTeachers(schoolId: ID): Promise<Teacher[]>;
  submitAbsence(input: AbsenceSubmission): Promise<AbsenceReceipt>;
}

export class MockSis implements Sis {
  private readonly submittedAbsences: AbsenceSubmission[] = [];

  constructor(private readonly db: SeedDb) {}

  async listStudents(parentId: ID): Promise<Student[]> {
    const parent = this.db.parents.find((p: Parent) => p.id === parentId);
    if (!parent) return [];
    return this.db.students.filter((s) => parent.studentIds.includes(s.id));
  }

  async getStudent(studentId: ID): Promise<Student | undefined> {
    return this.db.students.find((s) => s.id === studentId);
  }

  async listTeachers(schoolId: ID): Promise<Teacher[]> {
    return this.db.teachers.filter((t) => t.schoolId === schoolId);
  }

  async submitAbsence(input: AbsenceSubmission): Promise<AbsenceReceipt> {
    this.submittedAbsences.push(input);
    return {
      referenceId: `ABS-${Date.now().toString(36).toUpperCase()}`,
      submittedAt: new Date().toISOString(),
    };
  }

  /** Exposed so tests can assert what was actually submitted. */
  get recordedAbsences(): readonly AbsenceSubmission[] {
    return this.submittedAbsences;
  }
}

/** Resolve the SIS. Default is the parent-provided-children-backed `MockSis` (which
 * serves the students + school created from onboarding). To wire a REAL SIS per
 * district, point `SIS_PROVIDER` at a client for OneRoster / Edlink / PowerSchool
 * and return it here — the agent already talks to the `Sis` interface, so it's a
 * drop-in swap with no agent-code change. */
export function createSis(db: SeedDb): Sis {
  // eslint-disable-next-line no-console
  if (process.env.SIS_PROVIDER) console.log(`[sis] using remote SIS provider: ${process.env.SIS_PROVIDER}`);
  // TODO: return a real SIS client (OneRoster/Edlink/PowerSchool) when configured.
  return new MockSis(db);
}

export function schoolById(db: SeedDb, id: ID): School | undefined {
  return db.schools.find((s) => s.id === id);
}
