import type { ArchiveCase, ArchiveClient } from '../archive/client.js';
import { FamilyRecord, schoolMealsHousehold, type FactSource, type PayFrequency } from '../family/facts.js';

/**
 * Synthetic families for the harness, made from the rules archive's own household cases
 * (archive/playbooks/<program>/tests/households_<state>.yaml). Each case is ground truth: the
 * household, and the determination the archive must reach. Here it becomes the record a
 * perfect conversation would end with, each fact as if the parent said it.
 *
 * The simulated parent answers from the same facts; the scoreboard compares what the agent
 * recorded and submitted against this record.
 */

/** Household facts the conversion understands. A case using any other fact is skipped and
 * named, so a gap is visible rather than silently dropped. */
const KNOWN_HOUSEHOLD_FACTS = new Set(['reported_income', 'school_type', 'school_cep', 'school_provision2_nonbase', 'school_participates_nslp', 'medicaid_income_fpl_percent']);
const SCHOOL_KEY: Record<string, string> = {
  school_type: 'school.type',
  school_cep: 'school.cep',
  school_provision2_nonbase: 'school.provision2_nonbase',
  school_participates_nslp: 'school.participates_nslp',
  medicaid_income_fpl_percent: 'household.medicaid_income_fpl_percent',
};

export interface SyntheticFamily {
  id: string;
  title: string;
  asOf: string;
  record: FamilyRecord;
  /** What the archive says, from the case's own `expect`. */
  expect: ArchiveCase['expect'];
}

export function familyFromCase(c: ArchiveCase): { family?: SyntheticFamily; skipped?: string } {
  const hh = c.household;
  const unknown = Object.keys(hh.facts ?? {}).filter((k) => !KNOWN_HOUSEHOLD_FACTS.has(k));
  if (unknown.length) return { skipped: `${c.id}: household facts ${unknown.join(', ')}` };
  if (hh.incomes?.length && !(hh.facts as { reported_income?: unknown } | undefined)?.reported_income) {
    return { skipped: `${c.id}: monthly incomes without reported_income` };
  }
  const rec = new FamilyRecord(hh.state);
  const said = (key: string, value: unknown): FactSource => ({ kind: 'parent', ref: `synthetic:${c.id}`, quote: `${key} = ${JSON.stringify(value)}` });
  const put = (key: string, value: unknown, source: FactSource = said(key, value)) => rec.set(key, value, source, `${c.as_of}T12:00:00Z`);

  for (const m of hh.members) {
    put(`member.${m.id}.age`, m.age);
    put(`member.${m.id}.relationship`, m.relationship ?? 'self');
    if (m.student !== undefined) put(`member.${m.id}.student`, m.student);
    if (m.benefits?.length) put(`member.${m.id}.benefits`, m.benefits);
    for (const f of ['homeless', 'migrant', 'runaway'] as const) {
      const v = (m.facts as Record<string, unknown> | undefined)?.[f];
      if (v !== undefined) put(`member.${m.id}.${f}`, v);
    }
    const otherPersonFacts = Object.keys(m.facts ?? {}).filter((k) => !['homeless', 'migrant', 'runaway'].includes(k));
    if (otherPersonFacts.length) return { skipped: `${c.id}: person facts ${otherPersonFacts.join(', ')}` };
  }
  const income = ((hh.facts as { reported_income?: Array<{ owner: string; kind: string; amount: number; frequency: string }> } | undefined)?.reported_income) ?? [];
  put('household.income_reported', income.length > 0);
  income.forEach((r, n) => {
    put(`income.${n}.owner`, r.owner);
    put(`income.${n}.kind`, r.kind);
    put(`income.${n}.amount`, r.amount);
    put(`income.${n}.frequency`, r.frequency);
  });
  for (const [field, key] of Object.entries(SCHOOL_KEY)) {
    const v = (hh.facts as Record<string, unknown> | undefined)?.[field];
    if (v !== undefined) put(key, v, { kind: 'district', ref: `synthetic:${c.id}` });
  }
  return { family: { id: c.id, title: c.title, asOf: c.as_of, record: rec, expect: c.expect } };
}

// ── Families for the income-form pathways ────────────────────────────────────
//
// The archive's cases carry what the rules need (ages, relationships, benefits, income). A form
// also needs what the rules don't: names, dates of birth, school and grade, student ids,
// contact, case numbers, incomes in the form's own frequencies. `makeFamilies` adds those,
// from a seeded RNG, so the same seed always gives the same families.
//
// Fact keys added here (the pathway FormMaps read the same keys; see the report on contracts):
//   member.<id>.first_name | last_name | middle_initial | dob        (parent)
//   member.<id>.school | grade | student_id                          (district)
//   household.case_number | household.case_program                   (parent)
//   contact.email | contact.phone | contact.street | contact.city | contact.state | contact.zip  (parent)
//   household.language | household.district                          (parent / district)

export type HarnessLang = 'en' | 'es';
export type DistrictId = 'pvusd' | 'psusd';

/** Behaviours for the scripted parent (src/eval/parent.ts). Named after, and extending, the
 * ten personas in scripts/compare-ux/personas.json (crisis and sarcasm don't apply to a form). */
export const PERSONAS = [
  'straightforward',
  'needs_time',
  'asks_first',
  'two_at_once',
  'out_of_order',
  'corrects_later',
  'side_request',
  'unsure_income',
  'terse',
  'impatient',
] as const;
export type PersonaId = (typeof PERSONAS)[number];

export interface HarnessFamily extends SyntheticFamily {
  /** The archive case this family was made from, or "augmented" for an added edge case. */
  caseId: string;
  lang: HarnessLang;
  persona: PersonaId;
  district: DistrictId;
  /** Edge cases this family exercises (overflow, self_employed, zero_income, foster, calfresh, mixed_frequency…). */
  tags: string[];
  /** The archive's expected determination for the household as the form states it. */
  determination: { status?: string; tier?: string | null; source: 'case' | 'archive' | 'unverified' };
  /** What a correct pathway run ends with. */
  expectOutcome: 'done_confirmed' | 'already_covered';
  /** The case's own expectation, when the conversion changed the household (incomes re-expressed). */
  caseExpect?: ArchiveCase['expect'];
}

export interface MakeFamiliesOptions {
  seed?: number;
  /** The archive's CA school-meals cases. Default: fetched from `archive`. */
  cases?: ArchiveCase[];
  /** Used to fetch cases and to re-evaluate households the conversion changed. Without it,
   * changed and augmented families are marked `determination.source: 'unverified'`. */
  archive?: ArchiveClient;
  /** Pay frequencies the form offers. Default: the UBA's weekly / biweekly / 2x monthly / monthly. */
  frequencies?: PayFrequency[];
  /** Force one district (default: alternate Pajaro Valley and Palm Springs). */
  district?: DistrictId;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a), for per-family seeds. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
function shuffle<T>(r: () => number, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const NAMES = {
  latino: {
    women: ['María', 'Guadalupe', 'Rosa', 'Verónica', 'Alejandra', 'Yesenia', 'Claudia', 'Leticia', 'Adriana', 'Marisol', 'Araceli', 'Juana', 'Brenda', 'Elena'],
    men: ['José', 'Juan', 'Luis', 'Miguel', 'Jesús', 'Francisco', 'Alejandro', 'Ricardo', 'Héctor', 'Raúl', 'Javier', 'Rogelio', 'Efraín'],
    girls: ['Sofía', 'Valentina', 'Camila', 'Ximena', 'Isabella', 'Daniela', 'Natalia', 'Mía', 'Renata', 'Itzel', 'Yaretzi'],
    boys: ['Mateo', 'Santiago', 'Diego', 'Emiliano', 'Adrián', 'Leonardo', 'Ángel', 'Iker', 'Julián', 'Joaquín', 'Brayan'],
    surnames: ['García', 'Hernández', 'López', 'Martínez', 'González', 'Rodríguez', 'Pérez', 'Sánchez', 'Ramírez', 'Flores', 'Cruz', 'Morales', 'Reyes', 'Gutiérrez', 'Ortiz', 'Chávez', 'Mendoza', 'Vásquez', 'Castillo', 'Muñoz', 'Ibarra', 'Zúñiga', 'Cervantes', 'Ochoa', 'Barajas', 'Villaseñor', 'García-López', 'Peña-Ruiz'],
  },
  other: {
    women: ['Linh', 'Maricel', 'Jasmine', 'Aaliyah', 'Emily', 'Harpreet', 'Keiko', 'Grace', 'Tamika'],
    men: ['Minh', 'Rodel', 'DeShawn', 'Tyler', 'Gurpreet', 'Kenji', 'Daniel', 'Marcus'],
    girls: ['Ava', 'Olivia', 'Amara', 'Zoe', 'Hana', 'Maya', 'Simran', 'Kiara'],
    boys: ['Kai', 'Ethan', 'Noah', 'Liam', 'Arjun', 'Jayden', 'Elijah', 'Ren'],
    surnames: ['Nguyen', 'Tran', 'Santos', 'Johnson', 'Washington', 'Singh', 'Tanaka', 'Kim', "O'Brien", 'Bautista', 'Dela Cruz'],
  },
} as const;

const DISTRICTS: Record<DistrictId, {
  name: string;
  cities: Array<{ city: string; zip: string }>;
  area: string;
  elementary: string[];
  middle: string[];
  high: string[];
}> = {
  pvusd: {
    name: 'Pajaro Valley Unified School District',
    cities: [{ city: 'Watsonville', zip: '95076' }, { city: 'Watsonville', zip: '95076' }, { city: 'Freedom', zip: '95019' }],
    area: '831',
    elementary: ['Starlight Elementary', 'Hall District Elementary', 'Ohlone Elementary', 'Calabasas Elementary', 'MacQuiddy Elementary', 'Landmark Elementary'],
    middle: ['E.A. Hall Middle School', 'Lakeview Middle School', 'Rolling Hills Middle School', 'Pajaro Middle School'],
    high: ['Watsonville High School', 'Pajaro Valley High School', 'Aptos High School'],
  },
  psusd: {
    name: 'Palm Springs Unified School District',
    cities: [{ city: 'Palm Springs', zip: '92262' }, { city: 'Cathedral City', zip: '92234' }, { city: 'Desert Hot Springs', zip: '92240' }],
    area: '760',
    elementary: ['Cathedral City Elementary', 'Julius Corsini Elementary', 'Two Bunch Palms Elementary', 'Rio Vista Elementary', 'Bubbling Wells Elementary', 'Agua Caliente Elementary'],
    middle: ['Raymond Cree Middle School', 'Desert Springs Middle School', 'Nellie N. Coffman Middle School', 'Painted Hills Middle School'],
    high: ['Palm Springs High School', 'Cathedral City High School', 'Desert Hot Springs High School'],
  },
};

const STREETS = ['Ejemplo St', 'Sample Ave', 'Testing Way', 'Placeholder Rd', 'Calle Prueba', 'Fictional Ct', 'Demo Dr'];
const FORM_FREQUENCIES: PayFrequency[] = ['weekly', 'biweekly', 'twice_monthly', 'monthly'];
const PER_YEAR: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, twice_monthly: 24, monthly: 12, annual: 1 };

const reported = (rows: Array<[string, string, number, PayFrequency]>) => rows.map(([owner, kind, amount, frequency]) => ({ owner, kind, amount, frequency }));
const adults = (...ages: number[]) => ages.map((age, i) => ({ id: i === 0 ? 'p' : i === 1 ? 'q' : `g${i - 1}`, age, relationship: (i === 0 ? 'self' : i === 1 ? 'spouse' : 'parent') as 'self' | 'spouse' | 'parent' }));
const kids = (...ages: number[]) => ages.map((age, i) => ({ id: `c${i + 1}`, age, relationship: 'child' as const, student: true }));

/** Edge cases the archive's CA cases don't have. Their determinations come from the archive. */
const AUGMENTED: Array<ArchiveCase & { tags: string[] }> = [
  {
    id: 'AUG-OVERFLOW-6',
    title: 'Six students: more than the form has rows for',
    as_of: '2026-09-15',
    tags: ['overflow'],
    household: { state: 'ca', members: [...adults(41, 43), ...kids(16, 14, 12, 10, 8, 5)], facts: { reported_income: reported([['q', 'earned', 2200, 'biweekly'], ['p', 'earned', 1100, 'biweekly']]) } },
    expect: {},
  },
  {
    id: 'AUG-ZERO-INCOME',
    title: 'No income at all right now',
    as_of: '2026-09-15',
    tags: ['zero_income'],
    household: { state: 'ca', members: [...adults(29), ...kids(12, 7)], facts: { reported_income: [] } },
    expect: {},
  },
  {
    id: 'AUG-SELF-EMPLOYED',
    title: 'Self-employed, income changes month to month, plus child support',
    as_of: '2026-09-15',
    tags: ['self_employed', 'irregular_income'],
    household: { state: 'ca', members: [...adults(34), ...kids(9, 6)], facts: { reported_income: reported([['p', 'self_employment', 1800, 'monthly'], ['p', 'child_support', 300, 'monthly']]) } },
    expect: {},
  },
  {
    id: 'AUG-MIXED-FREQ',
    title: 'Weekly, biweekly and monthly income; grandmother on SSI; migrant students',
    as_of: '2026-09-15',
    tags: ['mixed_frequency', 'migrant', 'multigenerational'],
    household: {
      state: 'ca',
      members: [...adults(38, 39, 67), ...kids(15, 11).map((k) => ({ ...k, facts: { migrant: true } }))],
      facts: { reported_income: reported([['q', 'earned', 620, 'weekly'], ['p', 'earned', 1350, 'biweekly'], ['g1', 'ssi', 1100, 'monthly']]) },
    },
    expect: {},
  },
];

/** The order families come out in: the hard cases first, so a 5-family smoke run still sees them. */
const FIRST = ['SCH-CA-T01', 'AUG-OVERFLOW-6', 'SCH-CA-T14', 'AUG-ZERO-INCOME', 'SCH-CA-T15', 'AUG-SELF-EMPLOYED', 'AUG-MIXED-FREQ', 'SCH-CA-T09'];

function gradeFor(age: number): string | undefined {
  const g = age - 5;
  if (g < -1 || g > 12) return undefined;
  return g === -1 ? 'TK' : g === 0 ? 'K' : String(g);
}

/** A date of birth that makes `age` true on `asOf`. */
function dobFor(r: () => number, age: number, asOf: string): string {
  const [ay, am, ad] = asOf.split('-').map(Number) as [number, number, number];
  const m = 1 + Math.floor(r() * 12);
  const d = 1 + Math.floor(r() * 28);
  const y = ay - age - (m > am || (m === am && d > ad) ? 1 : 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Re-express an amount in a frequency the form offers. Whole dollars, exact when possible
 * (42,900 a year is exactly 1,650 every two weeks); otherwise monthly, rounded. */
function inFormFrequency(r: () => number, amount: number, frequency: PayFrequency, allowed: PayFrequency[]): { amount: number; frequency: PayFrequency; exact: boolean } {
  if (allowed.includes(frequency)) return { amount, frequency, exact: true };
  const yearly = amount * PER_YEAR[frequency];
  for (const f of shuffle(r, allowed)) {
    const v = yearly / PER_YEAR[f];
    if (Number.isInteger(v)) return { amount: v, frequency: f, exact: true };
  }
  const f: PayFrequency = allowed.includes('monthly') ? 'monthly' : allowed[0]!;
  return { amount: Math.round(yearly / PER_YEAR[f]), frequency: f, exact: false };
}

/**
 * Twenty (or `n`) deterministic synthetic California families for the income-form pathways:
 * the 16 CA school-meals cases from the archive plus four edge cases (six students, zero
 * income, self-employed, mixed frequencies), each with names, dates of birth, schools, grades,
 * student ids, contact, case numbers and form-frequency incomes. About 40% prefer Spanish.
 */
export async function makeFamilies(n = 20, opts: MakeFamiliesOptions = {}): Promise<HarnessFamily[]> {
  const seed = opts.seed ?? 1;
  const allowed = opts.frequencies ?? FORM_FREQUENCIES;
  const cases = opts.cases ?? (opts.archive ? await opts.archive.cases('school_meals', 'ca') : undefined);
  if (!cases) throw new Error('makeFamilies needs `cases` or an `archive` client');

  const pool: Array<ArchiveCase & { tags?: string[] }> = [...cases.filter((c) => c.household.state === 'ca'), ...AUGMENTED];
  pool.sort((a, b) => {
    const ia = FIRST.indexOf(a.id);
    const ib = FIRST.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id);
  });
  const personas = shuffle(rng(seed ^ 0x5eed), PERSONAS);

  const out: HarnessFamily[] = [];
  for (let i = 0; i < n; i++) {
    const base = pool[i % pool.length]!;
    const round = Math.floor(i / pool.length);
    const id = round ? `${base.id}~${round + 1}` : base.id;
    // Spanish for 40% of any prefix of the list (positions 3, 5, 8, 10…).
    const lang: HarnessLang = Math.floor((i + 1) * 0.4) > Math.floor(i * 0.4) ? 'es' : 'en';
    const district: DistrictId = opts.district ?? (i % 2 === 0 ? 'pvusd' : 'psusd');
    const fam = await buildFamily(base, { id, lang, district, persona: personas[i % personas.length]!, seed: hash(`${seed}:${id}`), allowed, archive: opts.archive });
    if (fam) out.push(fam);
  }
  return out;
}

async function buildFamily(
  c: ArchiveCase & { tags?: string[] },
  o: { id: string; lang: HarnessLang; district: DistrictId; persona: PersonaId; seed: number; allowed: PayFrequency[]; archive?: ArchiveClient },
): Promise<HarnessFamily | undefined> {
  const { family, skipped } = familyFromCase(c);
  if (!family) {
    console.warn(`[families] skipped ${skipped}`);
    return undefined;
  }
  const r = rng(o.seed);
  const rec = family.record;
  const at = `${c.as_of}T12:00:00Z`;
  const said = (key: string, value: unknown): FactSource => ({ kind: 'parent', ref: `synthetic:${o.id}`, quote: `${key} = ${JSON.stringify(value)}` });
  const district = (key: string): FactSource => ({ kind: 'district', ref: `synthetic-sis:${o.id}:${key}` });
  const put = (key: string, value: unknown, source: FactSource = said(key, value)) => rec.set(key, value, source, at);
  const d = DISTRICTS[o.district];
  const tags = [...(c.tags ?? [])];

  // Names: Spanish-preferring parents are Latino; about half the English-preferring ones too.
  const pool = o.lang === 'es' || r() < 0.5 ? NAMES.latino : NAMES.other;
  const surname = pick(r, pool.surnames);
  const used = new Set<string>();
  const uniq = (xs: readonly string[]) => {
    for (let k = 0; k < 20; k++) {
      const x = pick(r, xs);
      if (!used.has(x)) {
        used.add(x);
        return x;
      }
    }
    return pick(r, xs);
  };
  let anyStudent = false;
  for (const m of c.household.members) {
    const rel = m.relationship ?? 'self';
    const isKid = rel === 'child';
    const female = m.id === 'p' ? r() < 0.8 : m.id === 'q' ? false : r() < 0.5;
    const first = isKid ? uniq(female ? pool.girls : pool.boys) : uniq(female ? pool.women : pool.men);
    const last = m.id === 'q' && r() < 0.35 ? pick(r, pool.surnames) : rel === 'parent' ? pick(r, pool.surnames) : surname;
    put(`member.${m.id}.first_name`, first);
    put(`member.${m.id}.last_name`, last);
    if (r() < 0.3) put(`member.${m.id}.middle_initial`, String.fromCharCode(65 + Math.floor(r() * 26)));
    put(`member.${m.id}.dob`, dobFor(r, m.age, c.as_of));
    if (m.student) {
      anyStudent = true;
      const grade = gradeFor(m.age) ?? '12';
      const g = grade === 'K' || grade === 'TK' ? 0 : Number(grade);
      const type = (c.household.facts as { school_type?: string } | undefined)?.school_type;
      const school = type === 'private' ? 'St. Example Parish School' : type === 'charter' ? 'Example Charter Academy' : pick(r, g <= 5 ? d.elementary : g <= 8 ? d.middle : d.high);
      put(`member.${m.id}.school`, school, district('school'));
      put(`member.${m.id}.grade`, grade, district('grade'));
      put(`member.${m.id}.student_id`, String(1_000_000 + Math.floor(r() * 9_000_000)), district('student_id'));
    }
    if (m.benefits?.includes('foster_care')) tags.push('foster');
  }
  if (!anyStudent) return undefined;

  // Benefits → a case number the form asks for.
  const benefits = new Set(c.household.members.flatMap((m) => m.benefits ?? []));
  const program = benefits.has('snap') ? 'calfresh' : benefits.has('tanf') ? 'calworks' : benefits.has('medicaid') ? 'medi-cal' : undefined;
  if (program) {
    put('household.case_program', program);
    put('household.case_number', `${program === 'medi-cal' ? '9' : 'C'}${String(Math.floor(r() * 1e7)).padStart(7, '0')}`);
    tags.push(program === 'calfresh' ? 'calfresh' : program);
  }

  // Contact: 555-01xx numbers and example.test addresses, never a real person's.
  const p = c.household.members[0]!.id;
  const firstName = rec.get<string>(`member.${p}.first_name`)!.value;
  const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const place = pick(r, d.cities);
  put('contact.email', `${ascii(firstName)}.${ascii(surname)}${Math.floor(r() * 90) + 10}@example.test`);
  put('contact.phone', `(${d.area}) 555-01${String(Math.floor(r() * 100)).padStart(2, '0')}`);
  put('contact.street', `${100 + Math.floor(r() * 9800)} ${pick(r, STREETS)}${r() < 0.25 ? ` Apt ${1 + Math.floor(r() * 30)}` : ''}`);
  put('contact.city', place.city);
  put('contact.state', 'CA');
  put('contact.zip', place.zip);
  put('household.language', o.lang);
  put('household.district', o.district, district('district'));

  // Incomes in the form's frequencies. When that changes the household, the archive re-decides.
  let changed = !!c.id.startsWith('AUG-');
  for (const n of rec.incomeIndexes()) {
    const amount = rec.get<number>(`income.${n}.amount`)!.value;
    const freq = rec.get<PayFrequency>(`income.${n}.frequency`)!.value;
    const conv = inFormFrequency(r, amount, freq, o.allowed);
    if (conv.frequency !== freq || conv.amount !== amount) {
      changed = true;
      put(`income.${n}.amount`, conv.amount);
      put(`income.${n}.frequency`, conv.frequency);
    }
  }
  const freqs = new Set(rec.incomeIndexes().map((n) => rec.get<string>(`income.${n}.frequency`)!.value));
  if (freqs.size > 1 && !tags.includes('mixed_frequency')) tags.push('mixed_frequency');
  if (!rec.incomeIndexes().length && !tags.includes('zero_income')) tags.push('zero_income');
  if (c.household.members.filter((m) => m.student).length > 5 && !tags.includes('overflow')) tags.push('overflow');

  let determination: HarnessFamily['determination'] = { status: c.expect.status as string | undefined, tier: c.expect.tier as string | null | undefined, source: 'case' };
  if (changed) {
    determination = { source: 'unverified' };
    if (o.archive) {
      const proj = schoolMealsHousehold(rec, c.as_of);
      if (proj.household) {
        const det = await o.archive.evaluate('school_meals', proj.household, c.as_of);
        determination = { status: det.status, tier: det.tier, source: 'archive' };
      }
    }
  }

  return {
    ...family,
    id: o.id,
    caseId: c.id.startsWith('AUG-') ? 'augmented' : c.id,
    lang: o.lang,
    persona: o.persona,
    district: o.district,
    tags,
    determination,
    expectOutcome: benefits.has('snap') || benefits.has('tanf') ? 'already_covered' : 'done_confirmed',
    ...(changed && !c.id.startsWith('AUG-') ? { caseExpect: c.expect } : {}),
    expect: { ...c.expect, ...(determination.status ? { status: determination.status } : {}), ...(determination.tier !== undefined ? { tier: determination.tier } : {}) },
  };
}

/** The district's full name, for prompts and provisioning. */
export function districtName(d: DistrictId): string {
  return DISTRICTS[d].name;
}

/** Members of a family's true record, with their names, in record order. */
export function membersOf(rec: FamilyRecord): Array<{ id: string; first: string; last: string; relationship: string; student: boolean }> {
  return rec.memberIds().map((id) => ({
    id,
    first: String(rec.get(`member.${id}.first_name`)?.value ?? ''),
    last: String(rec.get(`member.${id}.last_name`)?.value ?? ''),
    relationship: String(rec.get(`member.${id}.relationship`)?.value ?? 'self'),
    student: rec.get(`member.${id}.student`)?.value === true,
  }));
}
