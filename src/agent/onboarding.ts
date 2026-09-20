import type { ChildProfile, FamilyProfile } from '../domain/types.js';
import type { DistrictProfile } from '../knowledge/districts.js';
import { resolveDistrict } from '../knowledge/districts.js';
import { assessRights } from '../knowledge/rights.js';

export type OnboardingStep = 'email' | 'kids' | 'school' | 'location' | 'needs' | 'challenges' | 'review';

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
 * Guided onboarding, in a deliberate ORDER OF OPERATIONS:
 *
 *  1. Say who Axolotl is, and what it does with their data — in BOTH languages, so the
 *     whole introduction works whichever one they read.
 *  2. Ask which language they prefer — also in both languages — as the LAST thing in the
 *     introduction, so it is the only thing they can answer yet. (Asked first, parents
 *     reply immediately and the rest of the introduction arrives after their answer, out
 *     of order, while the brain starts onboarding on top of it.)
 *  3. Nothing else. No email ask here: the language answer comes back, and THEN the
 *     onboarding asks for the email, in the language they chose. Asking for the email in
 *     the introduction is what made it get asked twice.
 *
 * The blank-line structure is deliberate: it renders as TWO iMessage bubbles — the
 * bilingual introduction (English, then Spanish, in one bubble), then the question on
 * its own. See src/agent/bubbles.ts.
 */
export function openOnboarding(): OnboardingTurn {
  return {
    text: [
      `Hi, I'm Axolotl — your school assistant. I email the school, fill out forms and make calls with you, always with your OK. I'm private by design: your family's information is yours, never sold, and never shared with your school or anyone else without your permission. The only system that reads your messages is the AI that writes my replies.`,
      `Hola, soy Axolotl, tu asistente escolar. Le escribo a la escuela, lleno formularios y hago llamadas contigo, siempre con tu permiso. Soy privado por diseño: la información de tu familia es tuya, nunca la vendemos ni la compartimos con la escuela ni con nadie sin tu permiso. El único sistema que lee tus mensajes es la IA que escribe mis respuestas.`,
      `Which language do you prefer, English or Spanish?\n¿Qué idioma prefieres, inglés o español?`,
    ].join('\n\n'),
    state: { step: 'email', profile: { children: [], needs: [], challenges: [] } },
    done: false,
  };
}

export function advanceOnboarding(state: OnboardingState, text: string): OnboardingTurn {
  const t = text.trim();

  switch (state.step) {
    case 'email': {
      const email = t.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
      if (!email) {
        return {
          text: `I didn't catch an email. Send me the address you'd like me to use (e.g. you@email.com), or text /connect to link your Gmail.`,
          state,
          done: false,
        };
      }
      const profile = { ...state.profile, email };
      return {
        text: `Got it — ${email}. Now let's get set up.\n\nWhat are your children's names? (e.g. "Emma and Liam", or just "Emma")`,
        state: { step: 'kids', profile },
        done: false,
      };
    }

    case 'kids': {
      const kids = parseKids(t);
      if (kids.length === 0) {
        return { text: "I didn't catch any names. Could you tell me your children's names?", state, done: false };
      }
      const profile = { ...state.profile, children: kids };
      return {
        text: `Got it — ${kids.map((k) => k.name).join(' and ')}.\n\nWhich school do they go to? (e.g. "Lincoln Elementary")`,
        state: { step: 'school', profile },
        done: false,
      };
    }

    case 'school': {
      const profile = { ...state.profile, school: t, district: t };
      // Ask for the city/state when the school isn't one we have on file, so we
      // research the right one (there are many common/duplicate school names).
      if (!resolveDistrict(t).known) {
        return {
          text: `Got it — ${t}. Which city and state is that in? (e.g. "Seattle, WA") I want to make sure I look up the right one.`,
          state: { step: 'location', profile },
          done: false,
        };
      }
      return {
        text: "What would you like help with? I can help with things like transportation, meals, attendance, conferences, enrollment, or special education. (You can list a few, or say \"not sure\".)",
        state: { step: 'needs', profile },
        done: false,
      };
    }

    case 'location': {
      const profile = { ...state.profile, location: t };
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
  const kidLine = profile.children.map((c) => `${c.name}${c.grade ? `, grade ${c.grade}` : ''}`).join(' and ');
  const school = profile.school ?? district.name;
  const city = profile.location ?? '';
  const email = profile.email ?? '';

  const lines: string[] = [];
  lines.push(`You're all set — here's what I've got:`);
  lines.push(`• ${kidLine}`);
  lines.push(`• ${school}${city ? ` — ${city}` : ''}`);
  if (email) lines.push(`• Your email: ${email}`);
  lines.push('');
  lines.push("All saved — you won't have to repeat it.");
  lines.push('');
  lines.push("Here's what I can do for you (always with your OK first):");
  lines.push('📄 Fill out a form or sign-up — I fill it with your child\u2019s info, show you, and only submit when you say go.');
  lines.push('✉️ Email the school or district for you — I draft it, you approve it, then it sends (from your Gmail if you connect it, otherwise from your Axolotl address).');
  lines.push('📞 Call the office and handle it live with you. Want to hear it? Just say "call me."');
  lines.push('⏰ Set a reminder to follow up on something, so nothing slips.');
  lines.push('🔑 Connect your school portal (Aeries/PowerSchool) so I can READ what your child is actually getting — you sign in yourself, I never see your password.');

  // The district homeless liaison is a McKinney-Vento (homeless/displaced) contact —
  // only surface it when the family actually flagged housing instability, not a generic family.
  const housingAffected = /homeless|transition|shelter|motel|hotel|car|displac|couch|doubled|camp|no address/i.test(
    (profile.challenges ?? []).join(' '),
  );
  const l = district.liaison;
  if (housingAffected && district.known && district.type === 'public' && l?.name && l.phone) {
    lines.push('');
    lines.push(`📞 If you're staying somewhere temporary, McKinney-Vento covers you — your child stays at their school with a ride, no paperwork. Key contact: ${l.name}, ${l.phone}${l.email ? `, ${l.email}` : ''}.`);
  }

  if (district.type !== 'public') {
    lines.push('');
    lines.push(`${district.name} isn't a public district, so the public-school programs I usually check may not apply — I'll look up its actual programs instead.`);
  }

  lines.push('');
  // Two things we cannot invent later and cannot fix after an incident:
  //  - the school's sending domain, which is what lets us accept their mail (the sender
  //    guard is strict, so an empty allowlist means nothing gets through);
  //  - a mailing address, because the health-breach rule requires a postal path and
  //    iMessage notice does not satisfy it.
  lines.push('Two things that make the rest work:');
  lines.push('1. What email address does your school send from? (like office@yourschool.org) — I use it to accept their mail and ignore everything else.');
  lines.push('2. A mailing address for my records. If anything ever went wrong with your data I am required to be able to reach you by post, not just by text.');
  lines.push('');
  lines.push('What would you like help with first? Tell me what\u2019s going on, or just pick one of the above.');
  return lines.join('\n');
}

function suggestedActions(profile: FamilyProfile, districtKnown: boolean, isPublic: boolean): string {
  const n = profile.needs.map((s) => s.toLowerCase()).join(' ');
  const c = profile.challenges.map((s) => s.toLowerCase()).join(' ');
  const items: string[] = [];

  if (/transport|bus|ride/.test(n) || /homeless|transition|shelter|motel|car/.test(c)) {
    items.push(
      isPublic
        ? '• Walk you through the McKinney-Vento school-bus request'
        : '• Help with transportation to school (and financial aid if it applies)',
    );
  }
  if (/meal|lunch|food|breakfast/.test(n)) {
    items.push(
      isPublic
        ? '• Help you apply for free & reduced meals'
        : '• Help with meals / food support at the school',
    );
  }
  if (/absent|attendance|sick/.test(n)) {
    items.push('• Report an absence');
  }
  if (/conference|meet|teacher/.test(n)) {
    items.push('• Book a parent-teacher conference');
  }
  if (/enroll|register|new/.test(n)) {
    items.push(isPublic ? '• Walk you through enrollment' : '• Help with admissions / enrollment');
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
  if (/^(none|no|n\/a|nothing|not sure|not really sure|not totally sure|no idea|idk|dont know|don't know|i don'?t know|not sure yet)\b/i.test(text)) return [];
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
