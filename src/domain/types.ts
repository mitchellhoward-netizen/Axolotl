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
  school?: School;
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
  /** Only when it differs from the parent's, or the parent gave it. */
  lastName?: string;
  /** As the parent gave it; forms want different formats, so it is kept as text. */
  dateOfBirth?: string;
  gender?: string;
  previousSchool?: string;
  /** "none" is a real answer and is kept. */
  allergies?: string;
  /** What the parent chose to share for forms (conditions, medications). Never asked for unprompted. */
  medicalNotes?: string;
}

/** Someone a form asks about: a guardian, an emergency contact, an authorized pickup. */
export interface FamilyContact {
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
}

export interface HomeAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/** The family profile gathered during onboarding. */
export interface FamilyProfile {
  parentName?: string;
  children: ChildProfile[];
  /** e.g. "Soquel Elementary School". */
  school?: string;
  /** City/state to disambiguate a school, e.g. "Seattle, WA". */
  location?: string;
  /** e.g. "Soquel Union Elementary School District". */
  district?: string;
  /** Stable district key (set once the district is researched). */
  districtId?: string;
  /** Areas they want help with: transportation, meals, attendance, conferences, enrollment, special education, … */
  needs: string[];
  /** Challenges: homeless/transitional housing, IEP/504, health, language, recently moved, … */
  challenges: string[];
  /** Preferred message language. Defaults to English; Spanish is first-class. */
  locale?: 'en' | 'es';
  /** A parent-provided email (used to send the welcome/proof email, even without Gmail). */
  email?: string;
  /** public | private | charter | unknown — set at onboarding; gates public-school entitlements. */
  schoolType?: 'public' | 'private' | 'charter' | 'unknown';
  /** What the family has already secured (free meals, a 504 plan, a bus pass). */
  getting?: string[];
  notes?: string;
  // ── Family info store: what enrollment and sign-up forms ask for, gathered once ──
  parentLastName?: string;
  /** The parent's own phone, as they want it on forms. */
  phone?: string;
  address?: HomeAddress;
  /** Other parents/guardians (the texting parent is parentName). */
  guardians?: FamilyContact[];
  emergencyContacts?: FamilyContact[];
  authorizedPickups?: FamilyContact[];
  /** The language spoken at home, which enrollment forms ask (separate from `locale`). */
  homeLanguage?: string;
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
