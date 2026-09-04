/**
 * Sourced facts about Soquel Union Elementary School District (SUESD) and the
 * McKinney-Vento process for students experiencing homelessness/displacement.
 *
 * Sources:
 * - https://www.suesd.org/mckinny-vento   (McKinney-Vento rights & contacts)
 * - https://www.suesd.org/our-schools     (school list, principals, phones)
 *
 * ⚠️ The agent must ONLY state facts from this file. Anything not here → say
 * "I'm not sure" and hand off to a human (OFFICE / LIAISON below). Never invent.
 */

export const DISTRICT = {
  name: 'Soquel Union Elementary School District',
  shortName: 'SUESD',
  city: 'Capitola, CA',
} as const;

export const SOQUEL_ELEMENTARY = {
  name: 'Soquel Elementary School',
  principal: 'Brittany Birchall',
  address: '2700 Porter St, Soquel, CA 95073',
  phone: '(831) 464-5655',
} as const;

/** District Homeless Liaison (the person whose job McKinney-Vento is). */
export const LIAISON = {
  name: 'Carissa Lemos',
  role: 'Director of Student Services / District Homeless Liaison',
  phone: '(831) 464-5631',
  email: 'clemos@suesd.org',
} as const;

/** Contact for free/subsidized public bus passes (per the district site). */
export const BUS_PASSES = {
  name: 'Erika Cortes',
  phone: '(831) 466-5666',
} as const;

export const SCHOOLS_LIST = [
  `• Soquel Elementary — ${SOQUEL_ELEMENTARY.principal}, (831) 464-5655`,
  '• Main Street Elementary — Heather Herbst, (831) 464-5650',
  '• Santa Cruz Gardens Elementary — Carlo Albano, (831) 464-5670',
  '• Opal Cliffs School',
  '• New Brighton Middle School — Christina Hadreas, (831) 464-5660',
].join('\n');

/** Plain-language definition of "homeless" under McKinney-Vento (education). */
export const HOMELESS_DEFINITION =
  'Under McKinney-Vento, "homeless" means not having a fixed, regular, and adequate place to sleep at night — for example: staying with others because you lost housing or money is tight, or living in a shelter, motel, car, park, campground, or a place not meant for sleeping.';

/**
 * The exact process for requesting transportation for a student experiencing
 * homelessness/displacement. v1 does NOT submit anything — it explains the path
 * and gives the human contacts. "Real action" can be wired in later.
 */
export function busProcessSummary(schoolOfOrigin?: string, childNames?: string): string {
  const school = schoolOfOrigin
    ? `"${schoolOfOrigin}"`
    : 'their "school of origin" (the school they attended before this)';
  const scope = childNames ? ` for ${childNames}` : '';
  const scopeNote = childNames ? `\n\nThis covers ${childNames}.` : '';
  return [
    `Here's exactly how this works in ${DISTRICT.shortName}:`,
    '',
    `Under McKinney-Vento, a child who is homeless or displaced has the right to transportation to ${school} if the parent or guardian asks for it.${scopeNote}`,
    '',
    `To request the bus${scope}:`,
    `1. Contact the district homeless liaison — ${LIAISON.name}, ${LIAISON.phone}, ${LIAISON.email}.`,
    `2. For free or subsidized bus passes, call ${BUS_PASSES.name} at ${BUS_PASSES.phone}.`,
    '3. You do not need proof of residency or school records — your child can stay enrolled and be transported while this is sorted out.',
    '',
    `I have not sent anything to the school — I can't take that action yet. The fastest step right now is to call ${LIAISON.name} at ${LIAISON.phone}; supporting families in your situation is exactly her job. You're welcome to keep texting me with questions.`,
  ].join('\n');
}

/** Answer common factual questions about the school/district, or return undefined. */
export function answerSchoolInfo(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/principal|head of school|who runs/.test(t)) {
    return `The principal of ${SOQUEL_ELEMENTARY.name} is ${SOQUEL_ELEMENTARY.principal}.`;
  }
  if (/phone|call|number|contact|front office/.test(t)) {
    return `${SOQUEL_ELEMENTARY.name}: ${SOQUEL_ELEMENTARY.phone}. District Student Services (homeless liaison): ${LIAISON.name}, ${LIAISON.phone}.`;
  }
  if (/address|where|located|directions|map/.test(t)) {
    return `${SOQUEL_ELEMENTARY.name} is at ${SOQUEL_ELEMENTARY.address}.`;
  }
  if (/schools|district|which school/.test(t)) {
    return `${DISTRICT.name} has five schools:\n${SCHOOLS_LIST}`;
  }
  if (/bell schedule|hours|start time|dismissal|pick ?up time/.test(t)) {
    return `I don't have the bell schedule memorized yet — the ${SOQUEL_ELEMENTARY.name} office can tell you: ${SOQUEL_ELEMENTARY.phone}.`;
  }
  return undefined;
}
