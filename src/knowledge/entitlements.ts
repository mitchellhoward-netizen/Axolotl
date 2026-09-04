import type { FamilyProfile } from '../domain/types.js';

/**
 * The well-founded curiosity engine. Every entitlement a child may be owed is
 * paired with (a) the condition in the family profile that suggests eligibility,
 * (b) the ONE curiosity question that confirms/reveals it, (c) why it matters,
 * and (d) the action to pursue. The agent uses this to audit the family AND to
 * ask only the questions that help the student — never random.
 */

export interface Entitlement {
  id: string;
  title: string;
  law: string;
  domain: string;
  /** True if the family profile suggests this may apply (conservative). */
  matches: (profile: FamilyProfile) => boolean;
  /** Looser signal: worth ASKING the parent about (curiosity), even if not yet confirmed. */
  worthAsking?: (profile: FamilyProfile) => boolean;
  /** The focused question to confirm/reveal eligibility. */
  question: string;
  /** Why this question matters (what it unlocks for the student). */
  why: string;
  /** The concrete action to pursue if it applies. */
  action: string;
}

const text = (p: FamilyProfile, ...fields: Array<'needs' | 'challenges'>): string =>
  fields.flatMap((f) => p[f] ?? []).join(' ') + ' ' + (p.notes ?? '');

export const ENTITLEMENTS: Entitlement[] = [
  {
    id: 'mckinney-vento-transport',
    title: 'McKinney-Vento transportation to school of origin',
    law: '42 U.S.C. §11432(g)(1)(J)',
    domain: 'transport',
    matches: (p) => /homeless|doubled|temporary|transitional|shelter|motel|staying (with|at)|grandma|sister|aunt|family|not (my|our) own/i.test(text(p, 'challenges')),
    worthAsking: (p) => /bus|route|far|other home|mom|carpool|walk|transport|distance|ride/i.test(text(p, 'needs', 'challenges')),
    question: 'Are you staying with family, in temporary housing, or somewhere that isn\u2019t your own permanent home right now?',
    why: 'If so, your child is likely entitled to free transportation to their school of origin.',
    action: 'Request transportation to the school of origin via the district homeless liaison.',
  },
  {
    id: 'free-meals',
    title: 'Free & reduced-price meals (NSLP)',
    law: '42 U.S.C. §1758',
    domain: 'meals',
    matches: (p) => /low.?income|free|reduced|poverty|econom|meal|food|lunch|breakfast/i.test(text(p, 'needs', 'challenges')),
    question: 'Is your child\u2019s free/reduced-meal application current, or do they usually eat school lunch?',
    why: 'Low-income families qualify for free or reduced-price breakfast and lunch, and it can unlock other benefits.',
    action: 'Ensure the meal application is on file (or submit one).',
  },
  {
    id: 'iep-504',
    title: 'Special education / 504 evaluation',
    law: 'IDEA 20 U.S.C. §1414 / §504',
    domain: 'support',
    matches: (p) => /iep|504|special|disabilit|learning|adhd|speech|read|attention|evaluation/i.test(text(p, 'needs', 'challenges')),
    question: 'Has your child had an evaluation for learning, attention, speech, or any support need?',
    why: 'If there\u2019s a suspected disability or difficulty, they may be entitled to an IEP or 504 with supports.',
    action: 'Request a written evaluation, or review an existing plan.',
  },
  {
    id: 'title-iii',
    title: 'English learner / language support',
    law: 'Title III, 20 U.S.C. §6801',
    domain: 'language',
    matches: (p) => /english|language|ell|bilingual|second language/i.test(text(p, 'challenges')),
    question: 'Is another language spoken at home, or is English not your child\u2019s first language?',
    why: 'If they\u2019re an English learner, they\u2019re entitled to language support services.',
    action: 'Check English-learner identification + services.',
  },
  {
    id: 'summer-meals',
    title: 'Summer meals',
    law: 'Summer Food Service Program, 42 U.S.C. §1761',
    domain: 'meals',
    matches: (p) => /low|free|reduced|meal|food|lunch|breakfast|summer/i.test(text(p, 'needs', 'challenges')),
    question: 'Could your child get lunch through the summer meal program at a nearby community site?',
    why: 'Kids 18 and under get free summer meals at community sites with no application.',
    action: 'Find a summer meal site near you and share the schedule.',
  },
  {
    id: 'transport-support',
    title: 'Transportation assistance (distance / route barrier)',
    law: 'District policy / 20 U.S.C. §6311',
    domain: 'transport',
    matches: (p) => /transport|bus|ride|far|route|distance/i.test(text(p, 'needs', 'challenges')),
    question: 'How far is the school, and is there any bus or ride option at all?',
    why: 'If distance or the route is a barrier, the district may have to help with or provide transportation.',
    action: 'Request a transportation option or waiver from the school.',
  },
  {
    id: 'attendance-support',
    title: 'Attendance / truancy support',
    law: 'ESSA, 20 U.S.C. §6311',
    domain: 'attendance',
    matches: (p) => /attend|absent|truancy|miss.?ing school/i.test(text(p, 'needs', 'challenges')),
    question: 'Is your child missing school often for a reason we can help with?',
    why: 'If attendance is at risk, the district should offer supports — and we can help shape those.',
    action: 'Request attendance supports / a student-success plan.',
  },
];

export interface AuditItem {
  entitlement: Entitlement;
  status: 'likely' | 'accessed' | 'missing';
}

/** Map the family's situation to every entitlement they may be owed. */
export function auditEntitlements(profile: FamilyProfile, accessed: string[] = []): AuditItem[] {
  return ENTITLEMENTS.filter((e) => e.matches(profile)).map((e) => ({
    entitlement: e,
    status: accessed.includes(e.id) ? 'accessed' : 'likely',
  }));
}

export interface DiscoveryQuestion {
  id: string;
  question: string;
  why: string;
  action: string;
  /** The measurable, provable outcome for the student. */
  impact: string;
}

const IMPACT: Record<string, string> = {
  transport: 'gets to school reliably',
  meals: 'gets meals every day',
  support: 'gets a real assessment and a support plan',
  language: 'gets language support',
  attendance: 'attendance improves',
};

/** The well-founded, self-directed curiosity questions (only what could unlock help). */
export function discoveryQuestions(profile: FamilyProfile): DiscoveryQuestion[] {
  return ENTITLEMENTS.filter((e) => e.matches(profile) || (e.worthAsking ? e.worthAsking(profile) : false))
    .map((a) => ({
      id: a.id,
      question: a.question,
      why: a.why,
      action: a.action,
      impact: IMPACT[a.domain] ?? 'a measurable improvement',
    }));
}
