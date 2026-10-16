import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ageOn, type FactKey, type FactSource, type FamilyRecord } from '../family/facts.js';
import type { FieldValue, FormFill, FormMap, Lang } from '../pathways/types.js';
import type { OverlayField, OverlayMap } from './pdf-overlay.js';

/**
 * Pajaro Valley USD, Universal Benefits Application 2026 (the district's own form, branded SUN
 * Bucks). A flat, image-only Canva PDF: pages 1-2 English, 3-4 Spanish, letter landscape.
 * Read from the form itself; see docs/REPLICA-DISTRICTS.md "Replica 1".
 *
 * ── Field ids (stable for this version) ──────────────────────────────────────
 *   student.<i>.{last_name, first_name, mi, foster, homeless, migrant, dob, school, grade,
 *                income_amount, income_frequency}                       i = 0..4 (page 1, §1)
 *   case_number                                                          (page 1, §2)
 *   other.<j>.{last_name, first_name, mi, work_amount, work_frequency, assistance_amount,
 *              assistance_frequency, other_amount, other_frequency}      j = 0..4 (page 1, §3)
 *   adult.{printed_name, email, street, city_state_zip, phone}          (page 1, certification)
 *   ethnicity, race.<r>                                                  (page 2, optional)
 *   Attestations (the parent's, never in `values`): signature, date.
 *   Never filled: page 2's "School Use Only" block.
 *
 * Values: names as recorded; `mi` one capital letter; foster/homeless/migrant booleans; `dob`
 * ISO (YYYY-MM-DD; the overlay writes MM/DD/YYYY in English and DD/MM/YYYY in Spanish, as the
 * Spanish page writes its own deadline); amounts whole dollars as digit strings (a cents value
 * is rounded half up, the form asks for whole dollars); frequencies in the archive's spelling
 * (weekly | biweekly | twice_monthly | monthly). An income of 0 is written "0"; a person with no
 * income rows gets blank boxes (the household's "no income" is `household.income_reported`).
 *
 * ── Fact keys this form reads ────────────────────────────────────────────────
 *   member.<id>.first_name, .last_name            required for everyone listed
 *   member.<id>.middle_initial                    optional (blank when absent)
 *   member.<id>.student                           who is at school (see `isStudent`)
 *   member.<id>.dob, .school, .grade              required per student
 *   member.<id>.foster, .homeless, .migrant       required per student; SENSITIVE: only from the
 *                                                 parent or the district. `benefits` holding
 *                                                 "foster_care" (or "homeless_liaison") from the
 *                                                 parent or district also checks the box.
 *   member.<id>.relationship, .age | .dob         to decide who may be a student
 *   member.<id>.benefits                          snap | tanf | medicaid | ... (case number needed)
 *   household.income_reported                     the parent said whether anyone has income
 *   income.<n>.owner (member id), .amount (number), .frequency (one of the form's four; an
 *     "annual" figure doesn't fill this form: we ask how often it is paid, we don't divide),
 *     .kind (for non-students: maps to the three columns, see INCOME_COLUMN)
 *   household.case_number                         required when anyone gets SNAP/TANF/Medicaid
 *   contact.signer                                the member id of the adult who signs
 *   contact.street, .city, .state, .zip, .phone   required; contact.email optional
 *   household.ethnicity, household.race           optional; only ever from the parent's own words
 *
 * Problems that aren't a missing fact still go in `missing` (so nothing is filed), with keys
 * under `form.`: more than five students or other members (`form.students.over_5`,
 * `form.others.over_5`: the family needs a second copy of page 1), and two incomes in one box
 * paid on different schedules (`member.<id>.income.<column>.single_frequency`: ask for the
 * total on one schedule).
 */

export const FORM_ID = 'ca.pvusd.uba.2026';
export const ROWS = 5;
/** Copies of page 1 the form may use: "if you need more rows, use another page 1". */
export const COPIES = 2;
export const FREQUENCIES = ['weekly', 'biweekly', 'twice_monthly', 'monthly'] as const;
export type FormFrequency = (typeof FREQUENCIES)[number];
export const ATTESTATIONS = ['signature', 'date'];
export const RACES = ['american_indian_alaska_native', 'asian', 'black_african_american', 'white', 'native_hawaiian_pacific_islander'] as const;
export const ETHNICITIES = ['hispanic_latino', 'not_hispanic_latino'] as const;
const STUDENT_FIELDS = ['last_name', 'first_name', 'mi', 'foster', 'homeless', 'migrant', 'dob', 'school', 'grade', 'income_amount', 'income_frequency'] as const;
const OTHER_FIELDS = ['last_name', 'first_name', 'mi', 'work_amount', 'work_frequency', 'assistance_amount', 'assistance_frequency', 'other_amount', 'other_frequency'] as const;

/** Every field id on the form that we may fill. */
export const FIELD_IDS: string[] = [
  ...Array.from({ length: ROWS * COPIES }, (_, i) => STUDENT_FIELDS.map((f) => `student.${i}.${f}`)).flat(),
  'case_number',
  ...Array.from({ length: ROWS * COPIES }, (_, j) => OTHER_FIELDS.map((f) => `other.${j}.${f}`)).flat(),
  'adult.printed_name',
  'adult.email',
  'adult.street',
  'adult.city_state_zip',
  'adult.phone',
  'ethnicity',
  ...RACES.map((r) => `race.${r}`),
];

export type IncomeColumn = 'work' | 'assistance' | 'other';
/** Income kinds → the form's three columns (USDA's prototype application puts SSI,
 * unemployment and veterans' benefits with public assistance; Social Security, pensions and
 * everything else in "other"). A kind not listed here is asked, never guessed. */
export const INCOME_COLUMN: Record<string, IncomeColumn> = {
  earned: 'work', wages: 'work', salary: 'work', work: 'work', self_employment: 'work', tips: 'work',
  public_assistance: 'assistance', tanf: 'assistance', calworks: 'assistance', child_support: 'assistance',
  alimony: 'assistance', unemployment: 'assistance', workers_comp: 'assistance', ssi: 'assistance', veterans: 'assistance',
  pension: 'other', retirement: 'other', social_security: 'other', ssa: 'other', ssdi: 'other', disability: 'other',
  interest: 'other', investment: 'other', rental: 'other', other: 'other',
};

/** Sources allowed for sensitive facts: the parent's own words or the district's record. */
export const SENSITIVE_SOURCES: Array<FactSource['kind']> = ['parent', 'district'];

const isFreq = (v: unknown): v is FormFrequency => typeof v === 'string' && (FREQUENCIES as readonly string[]).includes(v);

/**
 * Is this member a student on §1? An explicit `member.<id>.student` decides. Without it, the
 * household's adults (self, spouse, parent) and anyone under 3 or over 21 are not; anyone else
 * must be asked (`needs` names the fact).
 */
export function isStudent(rec: FamilyRecord, id: string, asOf: string): { student: boolean; needs?: FactKey } {
  const s = rec.get<boolean>(`member.${id}.student`);
  if (s) return { student: s.value === true };
  const rel = rec.get<string>(`member.${id}.relationship`)?.value;
  if (rel === 'self' || rel === 'spouse' || rel === 'parent') return { student: false };
  const dob = rec.get<string>(`member.${id}.dob`)?.value;
  const age = dob ? ageOn(dob, asOf) : rec.get<number>(`member.${id}.age`)?.value;
  if (age !== undefined && (age < 3 || age > 21)) return { student: false };
  return { student: false, needs: `member.${id}.student` };
}

/** A US phone number written one way, "(831) 555-0100", however it was typed. */
export function phoneText(raw: string): string {
  const d = raw.replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw.trim();
}

export function fill(rec: FamilyRecord, asOf: string): FormFill {
  const values: Record<string, FieldValue> = {};
  const sources: Record<string, FactKey[]> = {};
  const missing: FactKey[] = [];
  const put = (field: string, value: FieldValue, from: FactKey[]) => {
    values[field] = value;
    sources[field] = from;
  };
  /** A fact's value, only if its source is allowed. A fact from any other source is missing. */
  const val = <T>(key: FactKey, allowed?: Array<FactSource['kind']>): T | undefined => {
    const f = rec.get<T>(key);
    if (!f || (allowed && !allowed.includes(f.source.kind))) return undefined;
    if (f.value === undefined || f.value === null || (typeof f.value === 'string' && !f.value.trim())) return undefined;
    return f.value;
  };
  const need = <T>(key: FactKey, allowed?: Array<FactSource['kind']>): T | undefined => {
    const v = val<T>(key, allowed);
    if (v === undefined) missing.push(key);
    return v;
  };

  const ids = rec.memberIds();
  if (!ids.length) missing.push('member.<id>.first_name');
  const students: string[] = [];
  const others: string[] = [];
  for (const id of ids) {
    const s = isStudent(rec, id, asOf);
    if (s.needs) missing.push(s.needs);
    (s.student ? students : others).push(id);
  }
  // Rows 6-10 go on a second copy of page 1; past that the family needs a person's help.
  if (students.length > ROWS * COPIES) missing.push('form.students.over_10');
  if (others.length > ROWS * COPIES) missing.push('form.others.over_10');

  const names = (prefix: string, id: string) => {
    const last = need<string>(`member.${id}.last_name`);
    const first = need<string>(`member.${id}.first_name`);
    if (last !== undefined) put(`${prefix}.last_name`, last.trim(), [`member.${id}.last_name`]);
    if (first !== undefined) put(`${prefix}.first_name`, first.trim(), [`member.${id}.first_name`]);
    const mi = val<string>(`member.${id}.middle_initial`);
    if (mi !== undefined) put(`${prefix}.mi`, mi.trim().charAt(0).toUpperCase(), [`member.${id}.middle_initial`]);
  };

  // Incomes, grouped by person and box.
  type Entry = { n: number; amount: number; frequency: FormFrequency };
  const byBox = new Map<string, Entry[]>(); // `${id}|${column or 'student'}`
  const reported = need<boolean>('household.income_reported');
  const incomeIdx = rec.incomeIndexes();
  if (reported === true && !incomeIdx.length) missing.push('income.0.amount');
  for (const n of incomeIdx) {
    const owner = need<string>(`income.${n}.owner`);
    const amount = need<number>(`income.${n}.amount`);
    const freqFact = rec.get<string>(`income.${n}.frequency`)?.value;
    const frequency = isFreq(freqFact) ? freqFact : undefined;
    if (!frequency) missing.push(`income.${n}.frequency`);
    if (owner !== undefined && !ids.includes(owner)) {
      missing.push(`income.${n}.owner`);
      continue;
    }
    if (owner === undefined) continue;
    let box = 'student';
    if (!students.includes(owner)) {
      const kind = need<string>(`income.${n}.kind`);
      const col = kind !== undefined ? INCOME_COLUMN[kind] : undefined;
      if (kind !== undefined && !col) missing.push(`income.${n}.kind`);
      if (!col) continue;
      box = col;
    }
    if (amount === undefined || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || !frequency) continue;
    const k = `${owner}|${box}`;
    byBox.set(k, [...(byBox.get(k) ?? []), { n, amount, frequency }]);
  }
  const income = (id: string, box: string, amountField: string, freqField: string) => {
    const entries = byBox.get(`${id}|${box}`);
    if (!entries?.length) return;
    const freqs = new Set(entries.map((e) => e.frequency));
    if (freqs.size > 1) {
      missing.push(`member.${id}.income.${box}.single_frequency`);
      return;
    }
    const total = Math.round(entries.reduce((s, e) => s + e.amount, 0));
    const from = entries.flatMap((e) => [`income.${e.n}.owner`, `income.${e.n}.amount`, ...(box === 'student' ? [] : [`income.${e.n}.kind`])]);
    put(amountField, String(total), from);
    put(freqField, entries[0]!.frequency, entries.map((e) => `income.${e.n}.frequency`));
  };

  students.slice(0, ROWS * COPIES).forEach((id, i) => {
    const p = `student.${i}`;
    names(p, id);
    // Foster / homeless / migrant: sensitive, only from the parent or the district.
    const benefits = val<string[]>(`member.${id}.benefits`, SENSITIVE_SOURCES) ?? [];
    for (const [flag, benefit] of [['foster', 'foster_care'], ['homeless', 'homeless_liaison'], ['migrant', undefined]] as const) {
      const key = `member.${id}.${flag}`;
      const v = val<boolean>(key, SENSITIVE_SOURCES);
      if (v !== undefined) put(`${p}.${flag}`, v === true, [key]);
      else if (benefit && benefits.includes(benefit)) put(`${p}.${flag}`, true, [`member.${id}.benefits`]);
      else missing.push(key);
    }
    const dob = need<string>(`member.${id}.dob`);
    if (dob !== undefined) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) put(`${p}.dob`, dob, [`member.${id}.dob`]);
      else missing.push(`member.${id}.dob`);
    }
    const school = need<string>(`member.${id}.school`);
    if (school !== undefined) put(`${p}.school`, school.trim(), [`member.${id}.school`]);
    const grade = need<string | number>(`member.${id}.grade`);
    if (grade !== undefined) put(`${p}.grade`, String(grade).trim(), [`member.${id}.grade`]);
    income(id, 'student', `${p}.income_amount`, `${p}.income_frequency`);
  });

  others.slice(0, ROWS * COPIES).forEach((id, j) => {
    const p = `other.${j}`;
    names(p, id);
    for (const col of ['work', 'assistance', 'other'] as const) income(id, col, `${p}.${col}_amount`, `${p}.${col}_frequency`);
  });

  // §2 case number: needed when anyone gets SNAP, TANF (CalWORKs) or Medicaid (Medi-Cal).
  const onProgram = ids.filter((id) => (val<string[]>(`member.${id}.benefits`) ?? []).some((b) => ['snap', 'tanf', 'medicaid'].includes(b)));
  const caseNumber = val<string>('household.case_number');
  if (caseNumber !== undefined) put('case_number', String(caseNumber).trim(), ['household.case_number']);
  else if (onProgram.length) missing.push('household.case_number');

  // The adult who signs: printed name from their member record; contact details.
  const signer = need<string>('contact.signer');
  if (signer !== undefined) {
    if (!ids.includes(signer)) missing.push('contact.signer');
    else {
      const first = val<string>(`member.${signer}.first_name`);
      const last = val<string>(`member.${signer}.last_name`);
      if (first !== undefined && last !== undefined) put('adult.printed_name', `${first.trim()} ${last.trim()}`, ['contact.signer', `member.${signer}.first_name`, `member.${signer}.last_name`]);
      // (a missing name is already in `missing` from the member rows)
    }
  }
  const email = val<string>('contact.email');
  if (email !== undefined) put('adult.email', email.trim(), ['contact.email']);
  const street = need<string>('contact.street');
  if (street !== undefined) put('adult.street', street.trim(), ['contact.street']);
  const city = need<string>('contact.city');
  const st = need<string>('contact.state');
  const zip = need<string | number>('contact.zip');
  if (city !== undefined && st !== undefined && zip !== undefined) {
    put('adult.city_state_zip', `${city.trim()}, ${st.trim().toUpperCase()} ${String(zip).trim()}`, ['contact.city', 'contact.state', 'contact.zip']);
  }
  const phone = need<string>('contact.phone');
  if (phone !== undefined) put('adult.phone', phoneText(String(phone)), ['contact.phone']);

  // Page 2, optional: only from the parent's own words, never inferred.
  const eth = val<string>('household.ethnicity', ['parent']);
  if (eth !== undefined && (ETHNICITIES as readonly string[]).includes(eth)) put('ethnicity', eth, ['household.ethnicity']);
  const races = val<string[]>('household.race', ['parent']);
  for (const r of races ?? []) if ((RACES as readonly string[]).includes(r)) put(`race.${r}`, true, ['household.race']);

  return { values, sources, missing: [...new Set(missing)], attestations: [...ATTESTATIONS] };
}

export const pvusdUba2026: FormMap = {
  id: FORM_ID,
  title: 'Pajaro Valley USD Universal Benefits Application 2026',
  languages: ['en', 'es'],
  fill,
};

// ── Where each field sits on the page (measured from the PDF itself) ─────────
//
// Measured on a 144 dpi render (`pdftoppm -r 144`, 1584 × 1224 px for a 792 × 612 pt page):
// table rules and checkbox outlines found by pixel scan, then halved into points. The Spanish
// pages are NOT the same layout (shorter rows, different columns), so each language has its own
// numbers. `px` below are 144 dpi pixels from the top-left; `pt` converts to PDF space.

const X = (px: number) => px / 2;
const Y = (px: number) => 612 - px / 2;

interface Layout {
  page1: number;
  page2: number;
  size: number;
  /** Text baseline offset below a row's top rule, px. */
  base: number;
  studentTop: (i: number) => number;
  studentBox: (i: number) => number;
  otherTop: (i: number) => number;
  otherBox: (i: number) => number;
  /** Text columns: [left, right] px. */
  sCols: Record<'last_name' | 'first_name' | 'mi' | 'dob' | 'school' | 'grade' | 'income_amount', [number, number]>;
  sChecks: Record<'foster' | 'homeless' | 'migrant', number>;
  sFreq: [number, number, number, number];
  oCols: Record<'last_name' | 'first_name' | 'mi' | 'work_amount' | 'assistance_amount' | 'other_amount', [number, number]>;
  oFreq: Record<IncomeColumn, [number, number, number, number]>;
  caseNumber: { x: number; y: number; right: number };
  contact: Record<'printed_name' | 'email' | 'street' | 'city_state_zip' | 'phone', { left: number; right: number; y: number }>;
  dob: (iso: string) => string;
  ethnicity: Record<(typeof ETHNICITIES)[number], [number, number]>;
  race: Record<(typeof RACES)[number], [number, number]>;
}

const iso = (s: string) => s.split('-') as [string, string, string];

const LAYOUT: Record<Lang, Layout> = {
  en: {
    page1: 0,
    page2: 1,
    size: 9,
    base: 22,
    studentTop: (i) => 386 + 32 * i,
    studentBox: (i) => 402 + 31.9 * i,
    otherTop: (i) => 762 + 32 * i,
    otherBox: (i) => 777.5 + 32.1 * i,
    sCols: { last_name: [70, 272], first_name: [272, 466], mi: [466, 547], dob: [682, 817], school: [817, 1087], grade: [1087, 1186], income_amount: [1214, 1340] },
    sChecks: { foster: 569.5, homeless: 614.5, migrant: 659.5 },
    sFreq: [1361.5, 1404.5, 1447.5, 1489.5],
    oCols: { last_name: [70, 272], first_name: [272, 466], mi: [466, 547], work_amount: [576, 682], assistance_amount: [885, 1006], other_amount: [1226, 1340] },
    oFreq: { work: [704.5, 746.5, 790, 832.5], assistance: [1028.5, 1073.5, 1118.5, 1163.5], other: [1361.5, 1404.5, 1447.5, 1489.5] },
    caseNumber: { x: 1214, y: 574, right: 1468 },
    contact: {
      printed_name: { left: 640, right: 1030, y: 1082 },
      email: { left: 1042, right: 1508, y: 1082 },
      street: { left: 82, right: 626, y: 1134 },
      city_state_zip: { left: 640, right: 1030, y: 1134 },
      phone: { left: 1042, right: 1508, y: 1134 },
    },
    dob: (s) => {
      const [y, m, d] = iso(s);
      return `${m}/${d}/${y}`;
    },
    ethnicity: { hispanic_latino: [1057.5, 218], not_hispanic_latino: [1279, 218] },
    race: {
      american_indian_alaska_native: [1042, 293],
      asian: [1397.5, 293],
      black_african_american: [1041.5, 327.5],
      white: [1399.5, 332.5],
      native_hawaiian_pacific_islander: [1039, 367],
    },
  },
  es: {
    page1: 2,
    page2: 3,
    size: 8,
    base: 19.5,
    studentTop: (i) => 444 + 26.4 * i,
    studentBox: (i) => 457 + 26.5 * i,
    otherTop: (i) => 780 + 26.4 * i,
    otherBox: (i) => 793 + 26.25 * i,
    sCols: { last_name: [72, 274], first_name: [274, 468], mi: [468, 534], dob: [684, 819], school: [819, 1089], grade: [1089, 1193], income_amount: [1222, 1328] },
    sChecks: { foster: 555.5, homeless: 616, migrant: 661 },
    sFreq: [1350, 1393, 1439, 1490.5],
    oCols: { last_name: [72, 274], first_name: [274, 468], mi: [468, 534], work_amount: [562, 684], assistance_amount: [888, 1008], other_amount: [1222, 1329] },
    oFreq: { work: [705.5, 748, 794, 840], assistance: [1030.5, 1076, 1125, 1174], other: [1350.5, 1394, 1439, 1491] },
    caseNumber: { x: 1246, y: 602, right: 1500 },
    contact: {
      printed_name: { left: 640, right: 1030, y: 1097 },
      email: { left: 1042, right: 1508, y: 1097 },
      street: { left: 82, right: 626, y: 1150 },
      city_state_zip: { left: 640, right: 1030, y: 1150 },
      phone: { left: 1042, right: 1508, y: 1150 },
    },
    dob: (s) => {
      const [y, m, d] = iso(s);
      return `${d}/${m}/${y}`;
    },
    ethnicity: { hispanic_latino: [1017.5, 218.5], not_hispanic_latino: [1212.5, 219] },
    race: {
      american_indian_alaska_native: [1019, 309],
      asian: [1381.5, 309.5],
      black_african_american: [1020, 349],
      white: [1378.5, 356],
      native_hawaiian_pacific_islander: [1017.5, 391],
    },
  },
};

const PAD = 8; // px inside a cell

/** The coordinate map for one language's pages (page indexes are the source PDF's). */
export function overlayMap(lang: Lang): OverlayMap {
  const L = LAYOUT[lang];
  const map: OverlayMap = {};
  let copy = 0;
  const text = (field: string, [l, r]: [number, number], baselinePx: number, extra: Partial<Extract<OverlayField, { kind: 'text' }>> = {}) => {
    map[field] = { kind: 'text', page: L.page1, ...(copy ? { copy } : {}), x: X(l + PAD), y: Y(baselinePx), w: X(r - l - 2 * PAD), size: L.size, ...extra };
  };
  const freq = (field: string, xs: [number, number, number, number], yPx: number) => {
    map[field] = { kind: 'choice', page: L.page1, ...(copy ? { copy } : {}), options: Object.fromEntries(FREQUENCIES.map((f, k) => [f, { x: X(xs[k]!), y: Y(yPx) }])) };
  };
  for (let n = 0; n < ROWS * COPIES; n++) {
    // Row n sits in row n % 5 of copy n / 5 of page 1.
    copy = Math.floor(n / ROWS);
    const i = n % ROWS;
    const base = L.studentTop(i) + L.base;
    for (const f of ['last_name', 'first_name', 'mi', 'school', 'grade', 'income_amount'] as const) text(`student.${n}.${f}`, L.sCols[f], base);
    text(`student.${n}.dob`, L.sCols.dob, base, { format: L.dob });
    for (const f of ['foster', 'homeless', 'migrant'] as const) map[`student.${n}.${f}`] = { kind: 'check', page: L.page1, ...(copy ? { copy } : {}), x: X(L.sChecks[f]), y: Y(L.studentBox(i)) };
    freq(`student.${n}.income_frequency`, L.sFreq, L.studentBox(i));

    const ob = L.otherTop(i) + L.base;
    for (const f of ['last_name', 'first_name', 'mi', 'work_amount', 'assistance_amount', 'other_amount'] as const) text(`other.${n}.${f}`, L.oCols[f], ob);
    for (const c of ['work', 'assistance', 'other'] as const) freq(`other.${n}.${c}_frequency`, L.oFreq[c], L.otherBox(i));
  }
  copy = 0;
  map.case_number = { kind: 'text', page: L.page1, x: X(L.caseNumber.x), y: Y(L.caseNumber.y), w: X(L.caseNumber.right - L.caseNumber.x), size: L.size + 1 };
  for (const [f, c] of Object.entries(L.contact)) map[`adult.${f}`] = { kind: 'text', page: L.page1, x: X(c.left), y: Y(c.y), w: X(c.right - c.left), size: L.size + 1 };
  map.ethnicity = { kind: 'choice', page: L.page2, options: Object.fromEntries(Object.entries(L.ethnicity).map(([k, [x, y]]) => [k, { x: X(x), y: Y(y) }])) };
  for (const [r, [x, y]] of Object.entries(L.race)) map[`race.${r}`] = { kind: 'check', page: L.page2, x: X(x), y: Y(y) };
  return map;
}

/** The blank form, and which of its pages each language uses. */
export const PVUSD_UBA_PDF = {
  formId: FORM_ID,
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bench/forms/pvusd-uba-2026.pdf'),
  pages: { en: [0, 1], es: [2, 3] } as Record<Lang, number[]>,
  /** A sixth student or other member on: page 1 twice, then page 2. */
  pagesFor(lang: Lang, values: Record<string, FieldValue>): number[] {
    const [p1, p2] = lang === 'es' ? [2, 3] : [0, 1];
    const second = Object.keys(values).some((k) => /^(student|other)\.(\d+)\./.test(k) && Number(/^(?:student|other)\.(\d+)\./.exec(k)![1]) >= ROWS);
    return second ? [p1, p1, p2] : [p1, p2];
  },
  overlay: overlayMap,
};
