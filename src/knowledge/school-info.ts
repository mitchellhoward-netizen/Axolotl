import type { DistrictProfile } from './districts.js';

/**
 * School/district facts answered from the RESEARCHED district profile — never a
 * hardcoded district. The agent must ONLY state facts present in the researched
 * profile; anything it doesn't have it says so ("I don't have that yet") and
 * offers to look it up or points to the school office. Never invent a principal,
 * phone number, or address.
 */

/** Plain-language definition of "homeless" under McKinney-Vento (education). */
export const HOMELESS_DEFINITION =
  'Under McKinney-Vento, "homeless" means not having a fixed, regular, and adequate place to sleep at night — for example: staying with others because you lost housing or money is tight, or living in a shelter, motel, car, park, campground, or a place not meant for sleeping.';

/**
 * Answer a common factual question about the school/district from the researched
 * profile. Returns `undefined` when the profile doesn't carry it (so the caller
 * can fall back to web research rather than inventing an answer). `schoolName`
 * is the family's school, to disambiguate the primary contact.
 */
export function answerSchoolInfo(profile: DistrictProfile, text: string): string | undefined {
  const t = text.toLowerCase();
  const org = profile.name || 'the district';
  const elementary = profile.elementary;

  // Liaison / student-services contact (specific first — "homeless" also appears
  // in "what does homeless mean", handled below with a tighter regex).
  if (/liaison|student services|mckinney.?vento.*(contact|person|help)|homeless (contact|person|help|liaison)/.test(t)) {
    return profile.liaison
      ? `The district homeless liaison for ${org} is ${profile.liaison.name} (${profile.liaison.phone}, ${profile.liaison.email}).`
      : `I don't have the district homeless liaison for ${org} on file yet. Let me research it — or the school office can point you right.`;
  }

  if (/bus|transport|pass|ride/.test(t) && profile.busPasses) {
    return `For free or subsidized school bus passes, contact ${profile.busPasses.name} at ${profile.busPasses.phone}.`;
  }

  if (/schools|which school|district (has|is)|list.*school/.test(t) && profile.schools) {
    return `${org} schools:\n${profile.schools}`;
  }

  if (/what (district|district.*is)|which district|district name/.test(t)) {
    return `${elementary ?? org} is in the ${org}.`;
  }

  // Definition of "homeless" / McKinney-Vento (tight, so it doesn't shadow a liaison ask).
  if (/what (does|is) (a )?(homeless|mckinney|mv).*?mean|definition of (homeless|mckinney)|mckinney.?vento.*definition/.test(t)) {
    return HOMELESS_DEFINITION;
  }

  // Principal / phone / address / bell schedule are not structured in the profile.
  // Return undefined so the caller does real research rather than guessing.
  return undefined;
}

/**
 * The exact process for requesting transportation for a student experiencing
 * homelessness/displacement, using the district's researched liaison + bus-pass
 * contacts when we have them, and honest generic language when we don't.
 */
export function busProcessSummary(profile: DistrictProfile, schoolOfOrigin?: string, childNames?: string): string {
  const org = profile.name || 'your school district';
  const school = schoolOfOrigin
    ? `"${schoolOfOrigin}"`
    : 'their "school of origin" (the school they attended before this)';
  const scope = childNames ? ` for ${childNames}` : '';
  const scopeNote = childNames ? `\n\nThis covers ${childNames}.` : '';
  const liaisonLine = profile.liaison
    ? `Contact the district homeless liaison — ${profile.liaison.name}, ${profile.liaison.phone}, ${profile.liaison.email}.`
    : `Contact the district homeless liaison for ${org} (the school office can give you the name and number, or I can research it).`;
  const busPassLine = profile.busPasses
    ? `For free or subsidized bus passes, call ${profile.busPasses.name} at ${profile.busPasses.phone}.`
    : 'Ask the liaison about free or subsidized bus passes.';
  return [
    `Here's exactly how this works in ${org}:`,
    '',
    `Under McKinney-Vento, a child who is homeless or displaced has the right to transportation to ${school} if the parent or guardian asks for it.${scopeNote}`,
    '',
    `To request the bus${scope}:`,
    `1. ${liaisonLine}`,
    `2. ${busPassLine}`,
    '3. You do not need proof of residency or school records — your child can stay enrolled and be transported while this is sorted out.',
    '',
    `I haven't sent anything to the school — I can't take that action yet. The fastest step right now is to ${profile.liaison ? `call ${profile.liaison.name} at ${profile.liaison.phone}` : `reach out to the ${org} homeless liaison`}; supporting families in your situation is exactly their job. You're welcome to keep texting me with questions.`,
  ].join('\n');
}
