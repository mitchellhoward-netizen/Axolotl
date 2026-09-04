export type ID = string;

/** Free/reduced eligibility as tracked by the school nutrition program. */
export type MealStatus = 'free' | 'reduced' | 'paid' | 'unknown';

export interface Student {
  id: ID;
  firstName: string;
  lastName: string;
  /** e.g. 3 for third grade. */
  grade: number;
  schoolId: ID;
  homeroomTeacherId: ID;
  mealStatus: MealStatus;
}

export interface Parent {
  id: ID;
  /** E.164, used to resolve identity from a messaging channel. */
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Students this parent is authorized to act on behalf of. */
  studentIds: ID[];
}

export interface School {
  id: ID;
  name: string;
  district: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
}

export interface Teacher {
  id: ID;
  schoolId: ID;
  firstName: string;
  lastName: string;
  /** e.g. "3rd Grade" or "Math". */
  subject: string;
}

/** Everything the agent needs to act on one family/school relationship. */
export interface FamilyContext {
  parent: Parent;
  students: Student[];
  school: School;
  teachers: Teacher[];
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

/** A child described during onboarding (not yet tied to the SIS). */
export interface ChildProfile {
  name: string;
  /** e.g. "3rd", "1", "K". */
  grade?: string;
}

/** The family profile gathered during onboarding. */
export interface FamilyProfile {
  parentName?: string;
  children: ChildProfile[];
  /** e.g. "Soquel Elementary School". */
  school?: string;
  /** e.g. "Soquel Union Elementary School District". */
  district?: string;
  /** Areas they want help with: transportation, meals, attendance, conferences, enrollment, special education, … */
  needs: string[];
  /** Challenges: homeless/transitional housing, IEP/504, health, language, recently moved, … */
  challenges: string[];
  notes?: string;
}

/** An open case the agent is working on for the family (the "remember" layer). */
export interface CaseRecord {
  id: string;
  kind: string; // transportation | meals | bullying | health | attendance | evaluation
  status: 'open' | 'awaiting' | 'resolved';
  summary: string;
  child?: string;
  contact?: string;
  reminder?: string;
  createdAt: string;
}

/** The brief handed to the voice agent for an outbound call. */
export interface CallContext {
  parent_name: string;
  student: string;
  grade: string;
  school: string;
  district: string;
  issue: string;
  goal: string;
  what_we_know: string;
}
