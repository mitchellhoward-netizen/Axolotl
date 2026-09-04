import type { ChildProfile, FamilyProfile } from '../domain/types.js';
import type { DistrictProfile } from '../knowledge/districts.js';
import { assessRights } from '../knowledge/rights.js';

export type OnboardingStep = 'kids' | 'school' | 'needs' | 'challenges' | 'review';

export interface OnboardingState {
  step: OnboardingStep;
  profile: FamilyProfile;
}

export interface OnboardingTurn {
  text: string;
  state: OnboardingState;
  done: boolean;
}

/**
 * Guided onboarding. A parent texts in, tells us about their kids and school,
 * and we learn that district + reconcile it with law + propose how we can help.
 */
export function openOnboarding(): OnboardingTurn {
  return {
    text: [
      "Let's get you set up — a minute of info and I can actually help.",
      '',
      "First: what are your children's names? (e.g. \"Emma and Liam\", or just \"Emma\")",
    ].join('\n'),
    state: { step: 'kids', profile: { children: [], needs: [], challenges: [] } },
    done: false,
  };
}

export function advanceOnboarding(state: OnboardingState, text: string): OnboardingTurn {
  const t = text.trim();

  switch (state.step) {
    case 'kids': {
      const kids = parseKids(t);
      if (kids.length === 0) {
        return { text: "I didn't catch any names. Could you tell me your children's names?", state, done: false };
      }
      const profile = { ...state.profile, children: kids };
      return {
        text: `Got it — ${kids.map((k) => k.name).join(' and ')}.\n\nWhich school do they go to? (e.g. "Soquel Elementary School")`,
        state: { step: 'school', profile },
        done: false,
      };
    }

    case 'school': {
      const profile = { ...state.profile, school: t, district: t };
      return {
        text: "What would you like help with? I can help with things like transportation, meals, attendance, conferences, enrollment, or special education. (You can list a few, or say \"not sure\".)",
        state: { step: 'needs', profile },
        done: false,
      };
    }

    case 'needs': {
      const needs = parseList(t);
      const profile = { ...state.profile, needs: needs.length ? needs : ['general help'] };
      return {
        text: "Is there anything else going on I should know so I can help best? For example: staying somewhere temporary, an IEP or 504, a health issue, or a language need. (You can say \"none\", or tell me anything.)",
        state: { step: 'challenges', profile },
        done: false,
      };
    }

    case 'challenges': {
      const challenges = parseChallenges(t);
      const profile = { ...state.profile, challenges };
      return {
        text: "Anything else you'd like to tell me? (Optional — or just say \"no\".)",
        state: { step: 'review', profile },
        done: false,
      };
    }

    case 'review': {
      const profile = { ...state.profile, notes: isNo(t) ? undefined : t };
      return { text: '', state: { step: 'review', profile }, done: true };
    }
  }
}

export function finalizeOnboarding(profile: FamilyProfile, district: DistrictProfile): string {
  const rights = assessRights(profile);

  const lines: string[] = [];
  lines.push("Perfect — here's what I've learned and what I can help with:");
  lines.push('');
  const kids = profile.children.map((c) => `${c.name}${c.grade ? ` (${c.grade})` : ''}`).join(', ');
  lines.push(`Your family: ${kids} — ${district.name}.`);
  if (profile.needs.length && profile.needs[0] !== 'general help') {
    lines.push(`You're looking for help with: ${profile.needs.join(', ')}.`);
  }
  if (profile.challenges.length) {
    lines.push(`I'm keeping in mind: ${profile.challenges.join(', ')}.`);
  }

  if (!district.known) {
    lines.push('');
    lines.push(`I don't have ${district.name} researched yet. In a live version I'd look up their site, McKinney-Vento liaison, enrollment, and transportation pages now. For now I can still walk you through the general rights below.`);
  }

  if (rights.length) {
    lines.push('');
    lines.push('Based on what you told me, your children may be entitled to:');
    for (const r of rights) lines.push(`• ${r.title} — ${r.law}`);
  }

  lines.push('');
  lines.push("Here's how I can help right now:");
  lines.push(suggestedActions(profile, district.known));

  if (district.known && district.liaison) {
    lines.push('');
    lines.push(`Key contact: district homeless liaison ${district.liaison.name}, ${district.liaison.phone}, ${district.liaison.email}.`);
  }

  lines.push('');
  lines.push('Reply "help" anytime, or just ask me to do one of those. (Demo: nothing is actually sent to the school.)');
  return lines.join('\n');
}

function suggestedActions(profile: FamilyProfile, districtKnown: boolean): string {
  const n = profile.needs.map((s) => s.toLowerCase()).join(' ');
  const c = profile.challenges.map((s) => s.toLowerCase()).join(' ');
  const items: string[] = [];

  if (/transport|bus|ride/.test(n) || /homeless|transition|shelter|motel|car/.test(c)) {
    items.push('• Walk you through the McKinney-Vento school-bus request');
  }
  if (/meal|lunch|food|breakfast/.test(n)) {
    items.push('• Help you apply for free & reduced meals');
  }
  if (/absent|attendance|sick/.test(n)) {
    items.push('• Report an absence');
  }
  if (/conference|meet|teacher/.test(n)) {
    items.push('• Book a parent-teacher conference');
  }
  if (/enroll|register|new/.test(n)) {
    items.push('• Walk you through enrollment');
  }
  if (districtKnown) {
    items.push('• Answer questions about the school and point you to the right contact');
  }
  if (items.length === 0) {
    items.push('• Answer your questions and connect you with the right person at the district');
  }
  return items.join('\n');
}

function parseKids(text: string): ChildProfile[] {
  const segments = text.split(/\s+(?:and|&)\s+|,\s*|\/\s*/).map((s) => s.trim()).filter(Boolean);
  const kids: ChildProfile[] = [];
  for (const seg of segments) {
    const m = seg.match(/^([A-Za-z][A-Za-z' .-]*?)\s+(?:in\s+)?(pre[- ]?k|k|tk|\d{1,2})(?:st|nd|rd|th)?\.?\s*$/i);
    if (m) {
      kids.push({ name: m[1]!.trim(), grade: m[2]!.toLowerCase() });
    } else {
      const name = seg.replace(/\b(?:grade\s*)?(?:pre[- ]?k|k|tk|\d{1,2})(?:st|nd|rd|th)?\b/gi, '').trim();
      if (name) kids.push({ name });
    }
  }
  return kids;
}

function parseList(text: string): string[] {
  if (/^(none|no|n\/a|nothing|not sure|idk|dont know|don't know|i don'?t know)\b/i.test(text)) return [];
  return text
    .split(/\s*(?:,|;|\/|&|\band\b)\s*/)
    .map((s) => s.trim().replace(/[.!?]+$/, ''))
    .filter((s) => s.length > 1);
}

function parseChallenges(text: string): string[] {
  if (/^(none|no|n\/a|nothing|not really|no challenges|nothing else)\b/i.test(text)) return [];
  const t = text.toLowerCase();
  const out: string[] = [];
  if (/homeless|transition|shelter|motel|hotel|car|displac|doubled|couch|camp|no address/.test(t)) out.push('homeless/transitional housing');
  if (/\biep\b|special ?ed|disab|adhd|autism/.test(t)) out.push('IEP / special education');
  if (/504/.test(t)) out.push('504 plan');
  if (/health|medical|chron|allerg|asthma|epilep/.test(t)) out.push('health');
  if (/english|language|spanish|esl|transl/.test(t)) out.push('language');
  if (/moved|just moved|new to/.test(t)) out.push('recently moved');
  if (out.length === 0) out.push(text.trim());
  return out;
}

function isNo(text: string): boolean {
  return /^(no|nope|nothing|none|that's it|thats it|n\/a)\b/i.test(text.trim());
}
