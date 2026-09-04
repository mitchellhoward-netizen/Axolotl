import { BUS_PASSES, LIAISON, SOQUEL_ELEMENTARY } from './suesd.js';

/**
 * A resolved "blocker" to a student attending school (the root cause of an
 * absenteeism concern), with the grounded remedy, the right contact, and a
 * parent-authorized outreach draft + follow-up reminder.
 *
 * `draft` uses `{child}` as a placeholder the flow substitutes with the name.
 */
export interface Barrier {
  category: 'transportation' | 'meals' | 'bullying' | 'health' | 'attendance';
  title: string;
  law: string;
  explain: string;
  contact: string;
  /** Email of the best recipient, when we have a verified address (else ask). */
  email?: string;
  draft: string;
  reminder: string;
}

/** Map natural-language descriptions of "what's in the way" to remedies. */
export function detectBarriers(text: string): Barrier[] {
  const t = text.toLowerCase();
  const out: Barrier[] = [];
  if (
    /transport|bus|ride|get(ting)? to school|no car|can'?t get|too far|no ride|homeless|shelter|motel|hotel|transition|displac|doubled|couch|staying (with|at)|no address/.test(t)
  ) {
    out.push(transportBarrier());
  }
  if (/meal|lunch|food|breakfast|hungr|no money|lunch money|free and reduced|can'?t afford/.test(t)) {
    out.push(mealsBarrier());
  }
  if (/bull|harass|pick(ed)? on|mean|threaten|name[- ]call|exclud|kid(s)? keep(s)? (messing|picking)/.test(t)) {
    out.push(bullyingBarrier());
  }
  if (/sick|ill|health|doctor|hospital|chron|pain|anxiet|depress|refus|anxious|scared of/.test(t)) {
    out.push(healthBarrier());
  }
  if (out.length === 0) {
    out.push(attendanceBarrier());
  }
  return out;
}

/** Return a ready-made barrier by category (for tools/agent reuse). */
export function barrierByCategory(category: string): Barrier | undefined {
  switch (category.toLowerCase()) {
    case 'transportation':
      return transportBarrier();
    case 'meals':
      return mealsBarrier();
    case 'bullying':
      return bullyingBarrier();
    case 'health':
      return healthBarrier();
    case 'attendance':
      return attendanceBarrier();
    default:
      return undefined;
  }
}

function transportBarrier(): Barrier {
  return {
    category: 'transportation',
    title: 'Getting your child to school',
    law: 'McKinney-Vento, 42 U.S.C. §11432(g)(1)(J)',
    explain:
      'If getting to school is the issue — especially if your housing situation has changed — your child has a right to transportation to their school of origin at your request.',
    contact: `District homeless liaison ${LIAISON.name} (${LIAISON.phone}); free/subsidized bus passes — ${BUS_PASSES.name} (${BUS_PASSES.phone}).`,
    email: LIAISON.email,
    draft:
      `Hi ${LIAISON.name}, I'm the parent of {child} at ${SOQUEL_ELEMENTARY.name}. We're having trouble getting {child} to school because of our housing situation, and I'd like to request transportation to {child}'s school of origin under McKinney-Vento. Could you help set that up? Thank you.`,
    reminder: 'Follow up in 3 school days if you haven’t heard back.',
  };
}

function mealsBarrier(): Barrier {
  return {
    category: 'meals',
    title: 'Food / meal support',
    law: 'National School Lunch Program, 42 U.S.C. §1758',
    explain:
      'Your child can get free or reduced-price meals. If you’re experiencing homelessness, they’re automatically eligible for free meals — no application needed.',
    contact: `The ${SOQUEL_ELEMENTARY.name} office (${SOQUEL_ELEMENTARY.phone}) can take a meal application, or ask about the district homeless liaison ${LIAISON.name}.`,
    draft:
      `Hi, I'm the parent of {child} at ${SOQUEL_ELEMENTARY.name}. We're having a hard time with food right now, and I'd like to apply for free/reduced-price meals for {child}. Could you tell me what you need from me? Thank you.`,
    reminder: 'Follow up in 2 school days if you haven’t heard back.',
  };
}

function bullyingBarrier(): Barrier {
  return {
    category: 'bullying',
    title: 'Bullying / school safety',
    law: 'Title IX & the school’s anti-bullying plan (Ed Code §234)',
    explain:
      'Bullying is a barrier we can absolutely act on. You have the right to report it and request a safety plan, and the school must respond.',
    contact: `Principal of ${SOQUEL_ELEMENTARY.name}: ${SOQUEL_ELEMENTARY.principal} via the school office (${SOQUEL_ELEMENTARY.phone}).`,
    draft:
      `Hi, I'm the parent of {child} at ${SOQUEL_ELEMENTARY.name}. {child} is being bullied and it's affecting attendance. I'd like to report this and request a safety plan / follow-up. What's the process? Thank you.`,
    reminder: 'Follow up in 2 school days and keep a written record of incidents.',
  };
}

function healthBarrier(): Barrier {
  return {
    category: 'health',
    title: 'Health-related absences',
    law: 'State Ed Code (excused absences) & Section 504 for chronic conditions, 29 U.S.C. §794',
    explain:
      'Illness can be excused, and we can make sure the school has documentation. For a chronic condition, a 504 plan can provide accommodations (and excused absences).',
    contact: `The ${SOQUEL_ELEMENTARY.name} attendance office (${SOQUEL_ELEMENTARY.phone}).`,
    draft:
      `Hi, I'm the parent of {child} at ${SOQUEL_ELEMENTARY.name}. {child} has been absent due to health reasons. I'd like to make sure these are excused and to understand what documentation is needed. Thank you.`,
    reminder: 'Follow up in 3 school days.',
  };
}

function attendanceBarrier(): Barrier {
  return {
    category: 'attendance',
    title: 'Improving attendance',
    law: 'District attendance policy',
    explain:
      'We’ll get to the bottom of the absences and find the support the school can offer. There’s usually an attendance meeting and a plan.',
    contact: `The ${SOQUEL_ELEMENTARY.name} attendance office (${SOQUEL_ELEMENTARY.phone}); attendance form at ${SOQUEL_ELEMENTARY.name} attendance.`,
    draft:
      `Hi, I'm the parent of {child} at ${SOQUEL_ELEMENTARY.name}. We've been having attendance issues and I'd like help understanding what's required and what support is available. Can we set up a meeting? Thank you.`,
    reminder: 'Follow up in 2 school days to schedule the meeting.',
  };
}
