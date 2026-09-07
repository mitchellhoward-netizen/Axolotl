import type { DistrictProfile } from './districts.js';

/**
 * A resolved "blocker" to a student attending school (the root cause of an
 * absenteeism concern), with the grounded remedy, the right contact, and a
 * parent-authorized outreach draft + follow-up reminder.
 *
 * Contacts come from the family's RESEARCHED district profile (never hardcoded
 * to one district). `draft` uses `{child}` as a placeholder the flow substitutes
 * with the child's name.
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

/** The family's school/district facts a barrier resolves against. */
export interface BarrierContext {
  school: string;
  district: string;
  liaison?: { name: string; phone: string; email?: string };
  busPasses?: { name: string; phone: string };
}

/** Build a barrier context from a (possibly unresearched) district profile. */
export function contextFromProfile(profile?: DistrictProfile): BarrierContext {
  const school = profile?.elementary ?? 'your child\u2019s school';
  return {
    school,
    district: profile?.name ?? 'the district',
    liaison: profile?.liaison,
    busPasses: profile?.busPasses,
  };
}

/** Map natural-language descriptions of "what's in the way" to remedies. */
export function detectBarriers(text: string, ctx?: BarrierContext): Barrier[] {
  const t = text.toLowerCase();
  const out: Barrier[] = [];
  if (
    /transport|bus|ride|get(ting)? to school|no car|can'?t get|too far|no ride|homeless|shelter|motel|hotel|transition|displac|doubled|couch|staying (with|at)|no address/.test(t)
  ) {
    out.push(transportBarrier(ctx));
  }
  if (/meal|lunch|food|breakfast|hungr|no money|lunch money|free and reduced|can'?t afford/.test(t)) {
    out.push(mealsBarrier(ctx));
  }
  if (/bull|harass|pick(ed)? on|mean|threaten|name[- ]call|exclud|kid(s)? keep(s)? (messing|picking)/.test(t)) {
    out.push(bullyingBarrier(ctx));
  }
  if (/sick|ill|health|doctor|hospital|chron|pain|anxiet|depress|refus|anxious|scared of/.test(t)) {
    out.push(healthBarrier(ctx));
  }
  if (out.length === 0) {
    out.push(attendanceBarrier(ctx));
  }
  return out;
}

/** Return a ready-made barrier by category (for tools/agent reuse). */
export function barrierByCategory(category: string, ctx?: BarrierContext): Barrier | undefined {
  switch (category.toLowerCase()) {
    case 'transportation':
      return transportBarrier(ctx);
    case 'meals':
      return mealsBarrier(ctx);
    case 'bullying':
      return bullyingBarrier(ctx);
    case 'health':
      return healthBarrier(ctx);
    case 'attendance':
      return attendanceBarrier(ctx);
    default:
      return undefined;
  }
}

function liaisonName(ctx?: BarrierContext): string {
  return ctx?.liaison?.name ?? `the ${ctx?.district ?? 'district'} homeless liaison`;
}
function liaisonPhone(ctx?: BarrierContext): string {
  return ctx?.liaison?.phone ?? 'the school office number';
}

function transportBarrier(ctx?: BarrierContext): Barrier {
  return {
    category: 'transportation',
    title: 'Getting your child to school',
    law: 'McKinney-Vento, 42 U.S.C. §11432(g)(1)(J)',
    explain:
      'If getting to school is the issue — especially if your housing situation has changed — your child has a right to transportation to their school of origin at your request.',
    contact: `District homeless liaison ${liaisonName(ctx)} (${liaisonPhone(ctx)})${ctx?.busPasses ? `; free/subsidized bus passes — ${ctx.busPasses.name} (${ctx.busPasses.phone})` : ''}.`,
    email: ctx?.liaison?.email,
    draft:
      `Hi ${liaisonName(ctx)}, I'm the parent of {child} at ${ctx?.school ?? 'our school'}. We're having trouble getting {child} to school because of our housing situation, and I'd like to request transportation to {child}'s school of origin under McKinney-Vento. Could you help set that up? Thank you.`,
    reminder: 'Follow up in 3 school days if you haven’t heard back.',
  };
}

function mealsBarrier(ctx?: BarrierContext): Barrier {
  return {
    category: 'meals',
    title: 'Food / meal support',
    law: 'National School Lunch Program, 42 U.S.C. §1758',
    explain:
      'Your child can get free or reduced-price meals. If you’re experiencing homelessness, they’re automatically eligible for free meals — no application needed.',
    contact: `The ${ctx?.school ?? 'school'} office can take a meal application, or ask about the district homeless liaison ${liaisonName(ctx)}.`,
    draft:
      `Hi, I'm the parent of {child} at ${ctx?.school ?? 'our school'}. We're having a hard time with food right now, and I'd like to apply for free/reduced-price meals for {child}. Could you tell me what you need from me? Thank you.`,
    reminder: 'Follow up in 2 school days if you haven’t heard back.',
  };
}

function bullyingBarrier(ctx?: BarrierContext): Barrier {
  return {
    category: 'bullying',
    title: 'Bullying / school safety',
    law: 'Title IX & the school’s anti-bullying plan (Ed Code §234)',
    explain:
      'Bullying is a barrier we can absolutely act on. You have the right to report it and request a safety plan, and the school must respond.',
    contact: `The ${ctx?.school ?? 'school'} principal via the school office.`,
    draft:
      `Hi, I'm the parent of {child} at ${ctx?.school ?? 'our school'}. {child} is being bullied and it's affecting attendance. I'd like to report this and request a safety plan / follow-up. What's the process? Thank you.`,
    reminder: 'Follow up in 2 school days and keep a written record of incidents.',
  };
}

function healthBarrier(ctx?: BarrierContext): Barrier {
  return {
    category: 'health',
    title: 'Health-related absences',
    law: 'State Ed Code (excused absences) & Section 504 for chronic conditions, 29 U.S.C. §794',
    explain:
      'Illness can be excused, and we can make sure the school has documentation. For a chronic condition, a 504 plan can provide accommodations (and excused absences).',
    contact: `The ${ctx?.school ?? 'school'} school office.`,
    draft:
      `Hi, I'm the parent of {child} at ${ctx?.school ?? 'our school'}. {child} has been absent due to health reasons. I'd like to make sure these are excused and to understand what documentation is needed. Thank you.`,
    reminder: 'Follow up in 3 school days.',
  };
}

function attendanceBarrier(ctx?: BarrierContext): Barrier {
  return {
    category: 'attendance',
    title: 'Improving attendance',
    law: 'District attendance policy',
    explain:
      'We’ll get to the bottom of the absences and find the support the school can offer. There’s usually an attendance meeting and a plan.',
    contact: `The ${ctx?.school ?? 'school'} attendance office.`,
    draft:
      `Hi, I'm the parent of {child} at ${ctx?.school ?? 'our school'}. We've been having attendance issues and I'd like help understanding what's required and what support is available. Can we set up a meeting? Thank you.`,
    reminder: 'Follow up in 2 school days to schedule the meeting.',
  };
}
