import type { FamilyProfile } from '../domain/types.js';

export interface Right {
  title: string;
  law: string;
  summary: string;
}

/**
 * Reconcile a family's needs & challenges with federal/state law to surface
 * what their children may be entitled to. Keep this grounded and cite the law;
 * the agent should phrase these as "may be entitled to" — the district/state
 * ultimately determines eligibility.
 */
export function assessRights(profile: FamilyProfile): Right[] {
  const needs = profile.needs.map((s) => s.toLowerCase()).join(' ');
  const chal = profile.challenges.map((s) => s.toLowerCase()).join(' ');
  const rights: Right[] = [];

  const homeless = /homeless|transition|shelter|motel|hotel|car|displac|couch|doubled|camp|no address/.test(chal);
  const transport = /transport|bus|ride|school bus/.test(needs);

  if (homeless || transport) {
    rights.push({
      title: 'Transportation to school of origin',
      law: 'McKinney-Vento, 42 U.S.C. §11432(g)(1)(J)',
      summary:
        'A student experiencing homelessness has the right to transportation to their school of origin at the parent/guardian request, even across district lines.',
    });
  }
  if (homeless) {
    rights.push({
      title: 'Immediate enrollment without documents',
      law: 'McKinney-Vento, 42 U.S.C. §11432(g)(1)(H)',
      summary:
        'Your child can enroll and stay at their school of origin right away — no proof of residency, birth certificate, or records required.',
    });
    rights.push({
      title: 'Free school meals',
      law: 'McKinney-Vento & NSLP, 42 U.S.C. §1758',
      summary: 'Students experiencing homelessness are automatically eligible for free meals.',
    });
  }
  if (/iep|504|disab|special ?ed|adhd|autism/.test(chal)) {
    rights.push({
      title: 'FAPE, IEP, and accommodations',
      law: 'IDEA, 20 U.S.C. §1400 & Section 504, 29 U.S.C. §794',
      summary:
        'Eligible students get an IEP or 504 plan with accommodations and related services — and the plan transfers if they change schools.',
    });
  }
  if (/meal|food|lunch|breakfast/.test(needs)) {
    rights.push({
      title: 'Free & reduced-price meals',
      law: 'National School Lunch Program, 42 U.S.C. §1758',
      summary: 'You can apply for free or reduced-price meals; income and most benefit programs qualify.',
    });
  }
  if (/english|language|esl|spanish|transl/.test(chal) || /language|english/.test(needs)) {
    rights.push({
      title: 'Language support & translated communication',
      law: 'Title III, 20 U.S.C. §6811 & EEOA §1703',
      summary:
        'Students learning English get language instruction, and the school must communicate with you in a language you understand.',
    });
  }
  if (/enroll|register|new|moved|transfer/.test(needs) || /moved|just moved|new to/.test(chal)) {
    rights.push({
      title: 'Enrollment rights',
      law: 'State Education Code & Title VI',
      summary:
        'Your child has the right to enroll in the attendance-area school (or stay at their school of origin).',
    });
  }

  return rights;
}
