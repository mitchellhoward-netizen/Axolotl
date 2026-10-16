/**
 * Palm Springs USD's LINQ Connect "Income Form" for 2026-27 (an LCFF alternative income form),
 * and how a family record fills it. docs/REPLICA-DISTRICTS.md, replica 3.
 *
 * Labels come from LINQ's public bundle (bench/forms/linq/res_en.json). Palm Springs' own
 * configuration returns 401, so two things are parameters, not facts: whether the district
 * asks for an income range or a total (`IncomeMode`), and which schools it lists.
 *
 * Field ids (stable for this version; the replica posts and grades by these):
 *   student.<i>.first_name | last_name | dob (MM/DD/YYYY) | student_id | school | grade
 *   household_size
 *   income_range (mode 'range': band_1 | band_2 | band_3)   or   total_income (mode 'total')
 *   case_number (optional)
 *   guardian.<j>.first_name | last_name (j = 0, 1; the second optional)
 *   signer_name (the adult completing the form; must equal a guardian's name)
 *   certify: an attestation. The parent's, never in `values`.
 */
import type { FamilyRecord, FactKey, PayFrequency } from '../family/facts.js';
import type { FieldValue, FormFill, FormMap } from '../pathways/types.js';

export const FORM_ID = 'ca.psusd.linq-income-form.2026';
export type IncomeMode = 'range' | 'total';
/** Which one Palm Springs uses is not verified (REPLICA-DISTRICTS open question 4). */
export const PSUSD_INCOME_MODE: IncomeMode = 'range';
export const ATTESTATIONS = ['certify'] as const;
export const MAX_GUARDIANS = 2;

/** A short list of Palm Springs USD schools. Option value → name. */
export const PSUSD_SCHOOLS: Record<string, string> = {
  'psusd-phs': 'Palm Springs High School',
  'psusd-cchs': 'Cathedral City High School',
  'psusd-rmhs': 'Rancho Mirage High School',
  'psusd-dhshs': 'Desert Hot Springs High School',
  'psusd-cree': 'Raymond Cree Middle School',
  'psusd-coffman': 'Nellie N. Coffman Middle School',
  'psusd-dsms': 'Desert Springs Middle School',
  'psusd-cahuilla': 'Cahuilla Elementary School',
  'psusd-finchy': 'Katherine Finchy Elementary School',
  'psusd-sunny-sands': 'Sunny Sands Elementary School',
  'psusd-two-bunch': 'Two Bunch Palms Elementary School',
  'psusd-vista-del-monte': 'Vista del Monte Elementary School',
};

export const GRADES = ['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;

/**
 * USDA income eligibility guidelines, July 1, 2026 to June 30, 2027, 48 states, annual
 * (archive/playbooks/school_meals/federal/parameters/school_meals_federal.yaml:
 * federal.usda.cn_ieg_free_income_limit and cn_ieg_reduced_income_limit; FR 2026-06842).
 */
const FREE_ANNUAL_2026 = { sizes: [20748, 28132, 35516, 42900, 50284, 57668, 65052, 72436], additional: 7384 };
const REDUCED_ANNUAL_2026 = { sizes: [29526, 40034, 50542, 61050, 71558, 82066, 92574, 103082], additional: 10508 };

function limitFor(table: { sizes: number[]; additional: number }, size: number): number {
  if (!Number.isInteger(size) || size < 1) throw new Error(`household size ${size}`);
  if (size <= 8) return table.sizes[size - 1]!;
  return table.sizes[7]! + (size - 8) * table.additional;
}

export const freeLimit = (size: number): number => limitFor(FREE_ANNUAL_2026, size);
export const reducedLimit = (size: number): number => limitFor(REDUCED_ANNUAL_2026, size);

export type IncomeBand = 'band_1' | 'band_2' | 'band_3';

/** The bands "Select your Annual Income Range" offers for a household size. At or below a
 * limit is inside it (the USDA rule), so the free limit itself is band_1. */
export function incomeBands(size: number): Array<{ value: IncomeBand; min: number; max?: number }> {
  const f = freeLimit(size);
  const r = reducedLimit(size);
  return [
    { value: 'band_1', min: 0, max: f },
    { value: 'band_2', min: f + 1, max: r },
    { value: 'band_3', min: r + 1 },
  ];
}

/** Annual income → band, compared unrounded (the USDA annualizing rule). */
export function bandFor(size: number, annual: number): IncomeBand {
  if (annual <= freeLimit(size)) return 'band_1';
  if (annual <= reducedLimit(size)) return 'band_2';
  return 'band_3';
}

const PER_YEAR: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, twice_monthly: 24, monthly: 12, annual: 1 };

export function annualize(amount: number, frequency: PayFrequency): number {
  const k = PER_YEAR[frequency];
  if (k === undefined) throw new Error(`unknown pay frequency ${frequency}`);
  return amount * k;
}

/** ISO date → the MM/DD/YYYY the form's date field takes. */
export function usDate(iso: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A school fact (an option value or the school's name) → the option value. */
export function schoolOption(fact: string): string | undefined {
  if (fact in PSUSD_SCHOOLS) return fact;
  const n = norm(fact);
  for (const [value, name] of Object.entries(PSUSD_SCHOOLS)) {
    const nn = norm(name);
    if (nn === n || nn.replace(/ school$/, '') === n.replace(/ school$/, '')) return value;
  }
  return undefined;
}

export function gradeOption(fact: unknown): string | undefined {
  const s = String(fact ?? '').trim().toUpperCase().replace(/^GRADE\s*/, '').replace(/(ST|ND|RD|TH)$/, '');
  if (s === 'KINDER' || s === 'KINDERGARTEN' || s === '0') return 'K';
  if (s === 'TRANSITIONAL KINDERGARTEN') return 'TK';
  const n = /^0?(\d{1,2})$/.exec(s);
  const v = n ? String(Number(n[1])) : s;
  return (GRADES as readonly string[]).includes(v) ? v : undefined;
}

/** The fill, plus what this form derives (the contract has no slot for it; see the report). */
export interface LinqIncomeFill extends FormFill {
  /** Field id → how its value was worked out, for fields not copied from a single fact. */
  derived: Record<string, string>;
}

/** A FormMap whose fill also says what it derived. */
export type LinqIncomeFormMap = Omit<FormMap, 'fill'> & { mode: IncomeMode; fill(rec: FamilyRecord, asOf: string): LinqIncomeFill };

export function makeLinqIncomeForm(mode: IncomeMode = PSUSD_INCOME_MODE): LinqIncomeFormMap {
  return {
    id: FORM_ID,
    title: `Palm Springs USD Income Form 2026-27 (LINQ Connect, income ${mode})`,
    languages: ['en', 'es'],
    mode,
    fill(rec: FamilyRecord, _asOf: string): LinqIncomeFill {
      // The form version fixes the guideline year (2026-27), so asOf does not pick the table.
      const values: Record<string, FieldValue> = {};
      const sources: Record<string, FactKey[]> = {};
      const derived: Record<string, string> = {};
      const missing: FactKey[] = [];
      const val = <T>(key: FactKey): T | undefined => rec.get<T>(key)?.value;
      const need = <T>(key: FactKey): T | undefined => {
        const f = rec.get<T>(key);
        if (!f) missing.push(key);
        return f?.value;
      };
      const put = (id: string, v: FieldValue | undefined, from: FactKey[]) => {
        if (v === undefined || v === '') return;
        values[id] = v;
        sources[id] = from;
      };

      const ids = rec.memberIds();

      // Students: members the record says are students.
      const students = ids.filter((id) => val<boolean>(`member.${id}.student`) === true);
      if (!students.length) missing.push('member.<id>.student');
      students.forEach((id, i) => {
        for (const f of ['first_name', 'last_name', 'student_id'] as const) {
          const v = need<string>(`member.${id}.${f}`);
          if (v !== undefined) put(`student.${i}.${f}`, String(v).trim(), [`member.${id}.${f}`]);
        }
        const dob = need<string>(`member.${id}.dob`);
        if (dob !== undefined) {
          const us = usDate(dob);
          if (us) put(`student.${i}.dob`, us, [`member.${id}.dob`]);
          else missing.push(`member.${id}.dob`);
        }
        const grade = need<unknown>(`member.${id}.grade`);
        if (grade !== undefined) {
          const g = gradeOption(grade);
          if (g) put(`student.${i}.grade`, g, [`member.${id}.grade`]);
          else missing.push(`member.${id}.grade`);
        }
        // School is optional on the form; a school we can't find in the list is asked again.
        const school = val<string>(`member.${id}.school`);
        if (school !== undefined) {
          const opt = schoolOption(String(school));
          if (opt) put(`student.${i}.school`, opt, [`member.${id}.school`]);
          else missing.push(`member.${id}.school`);
        }
      });

      // Household size: the parent's number, else the members recorded (the household the
      // archive evaluates is the members list).
      let size: number | undefined;
      let sizeFrom: FactKey[] = [];
      const sizeFact = val<number>('household.size');
      if (sizeFact !== undefined) {
        size = Number(sizeFact);
        sizeFrom = ['household.size'];
      } else if (ids.length) {
        size = ids.length;
        sizeFrom = ids.map((id) => `member.${id}.relationship`).filter((k) => rec.has(k));
        if (sizeFrom.length !== ids.length) {
          missing.push('household.size');
          size = undefined;
        } else derived.household_size = `count of members recorded (${ids.length})`;
      } else missing.push('household.size');
      if (size !== undefined) put('household_size', String(size), sizeFrom);

      // Income: every income annualized and summed.
      const reported = need<boolean>('household.income_reported');
      const incomeKeys: FactKey[] = ['household.income_reported'];
      let annual: number | undefined;
      if (reported === false) annual = 0;
      else if (reported === true) {
        const idx = rec.incomeIndexes();
        if (!idx.length) missing.push('income.0.amount');
        let total = 0;
        let complete = idx.length > 0;
        for (const n of idx) {
          const amount = need<number>(`income.${n}.amount`);
          const freq = need<PayFrequency>(`income.${n}.frequency`);
          if (amount === undefined || freq === undefined || !(freq in PER_YEAR)) {
            complete = false;
            continue;
          }
          total += annualize(Number(amount), freq);
          incomeKeys.push(`income.${n}.amount`, `income.${n}.frequency`);
        }
        if (complete) annual = total;
      }
      if (annual !== undefined) {
        if (mode === 'total') {
          put('total_income', String(Math.round(annual)), incomeKeys);
          derived.total_income = `annualized and summed (weekly x52, biweekly x26, twice_monthly x24, monthly x12): ${annual}`;
        } else if (size !== undefined) {
          const band = bandFor(size, annual);
          put('income_range', band, [...incomeKeys, ...sizeFrom]);
          derived.income_range = `${band}: annual ${annual} for household of ${size} vs 2026-27 limits free ${freeLimit(size)}, reduced ${reducedLimit(size)}`;
        }
      }

      const caseNumber = val<string>('household.case_number');
      if (caseNumber !== undefined) put('case_number', String(caseNumber).trim(), ['household.case_number']);

      // The adult completing the form is the parent we talk to (relationship "self"); a spouse
      // or partner with a recorded name is the second guardian.
      const self = ids.find((id) => val<string>(`member.${id}.relationship`) === 'self');
      if (!self) missing.push('member.<id>.relationship');
      else {
        const first = need<string>(`member.${self}.first_name`);
        const last = need<string>(`member.${self}.last_name`);
        put('guardian.0.first_name', first?.trim(), [`member.${self}.first_name`]);
        put('guardian.0.last_name', last?.trim(), [`member.${self}.last_name`]);
        if (first !== undefined && last !== undefined) {
          put('signer_name', `${first.trim()} ${last.trim()}`, [`member.${self}.first_name`, `member.${self}.last_name`]);
        }
        const spouse = ids.find((id) => id !== self && val<string>(`member.${id}.relationship`) === 'spouse');
        const sf = spouse && val<string>(`member.${spouse}.first_name`);
        const sl = spouse && val<string>(`member.${spouse}.last_name`);
        if (spouse && sf && sl) {
          put('guardian.1.first_name', sf.trim(), [`member.${spouse}.first_name`]);
          put('guardian.1.last_name', sl.trim(), [`member.${spouse}.last_name`]);
        }
      }

      return { values, sources, missing: [...new Set(missing)], attestations: [...ATTESTATIONS], derived };
    },
  };
}

export const caPsusdLinqIncomeForm2026: LinqIncomeFormMap = makeLinqIncomeForm(PSUSD_INCOME_MODE);
// Still a FormMap, for the pathway and the grader.
const _isFormMap: FormMap = caPsusdLinqIncomeForm2026;
void _isFormMap;
