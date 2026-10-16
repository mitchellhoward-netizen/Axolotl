import type { ArchiveHousehold, ArchivePerson } from '../archive/client.js';

/**
 * The family record for pathways: every value carries where it came from.
 *
 * "Ask, don't guess" (VISION §8) is enforced here, in code: a value with no source can't be
 * recorded, a derived value names the facts it came from, and a form can only be built from
 * sourced facts (see `sourcedValues`). The archive gets a household built only from these
 * facts; anything missing is reported as missing, never defaulted.
 */

export type FactSource =
  /** The district's own record (SIS, CALPADS), by record id. */
  | { kind: 'district'; ref: string }
  /** A document the parent sent, by document id. */
  | { kind: 'document'; ref: string }
  /** The parent said it, in this turn. Keep the words: they are the evidence. */
  | { kind: 'parent'; ref: string; quote: string }
  /** Worked out by a rule from other facts (by their keys). */
  | { kind: 'derived'; ref: string; from: string[] };

export interface Fact<T = unknown> {
  value: T;
  source: FactSource;
  at: string;
}

/** Fact keys. Members are "member.<id>.<field>"; incomes are "income.<n>.<field>". */
export type FactKey = string;

export type Relationship = NonNullable<ArchivePerson['relationship']>;
/** As the archive spells them (school_meals/federal/rules.py). */
export type PayFrequency = 'weekly' | 'biweekly' | 'twice_monthly' | 'monthly' | 'annual';

export class FamilyRecord {
  private facts = new Map<FactKey, Fact>();

  constructor(readonly state: ArchiveHousehold['state']) {}

  /** Record a fact. A fact needs a source; the newest one for a key wins, and the old one is
   * returned so a correction ("actually it's $2,100") can be shown back. */
  set<T>(key: FactKey, value: T, source: FactSource, at = new Date().toISOString()): Fact | undefined {
    if (!source || !source.ref) throw new Error(`fact ${key} has no source`);
    if (source.kind === 'parent' && !source.quote) throw new Error(`fact ${key}: a parent fact keeps the parent's words`);
    if (source.kind === 'derived') {
      const missing = source.from.filter((k) => !this.facts.has(k));
      if (missing.length) throw new Error(`fact ${key} is derived from facts we don't have: ${missing.join(', ')}`);
    }
    const prev = this.facts.get(key);
    this.facts.set(key, { value, source, at });
    return prev;
  }

  get<T = unknown>(key: FactKey): Fact<T> | undefined {
    return this.facts.get(key) as Fact<T> | undefined;
  }

  has(key: FactKey): boolean {
    return this.facts.has(key);
  }

  /** Forget a fact (used only to move a member's facts to their archive id, keeping each
   * fact's value and source). */
  delete(key: FactKey): boolean {
    return this.facts.delete(key);
  }

  keys(): FactKey[] {
    return [...this.facts.keys()];
  }

  /** Member ids, in the order first recorded. */
  memberIds(): string[] {
    const ids: string[] = [];
    for (const k of this.facts.keys()) {
      const m = /^member\.([^.]+)\./.exec(k);
      if (m && !ids.includes(m[1]!)) ids.push(m[1]!);
    }
    return ids;
  }

  incomeIndexes(): number[] {
    const out = new Set<number>();
    for (const k of this.facts.keys()) {
      const m = /^income\.(\d+)\./.exec(k);
      if (m) out.add(Number(m[1]));
    }
    return [...out].sort((a, b) => a - b);
  }

  /** Plain data, for the conversation state. */
  toJSON(): { state: ArchiveHousehold['state']; facts: Array<[FactKey, Fact]> } {
    return { state: this.state, facts: [...this.facts.entries()] };
  }

  static fromJSON(data: { state: ArchiveHousehold['state']; facts: Array<[FactKey, Fact]> }): FamilyRecord {
    const rec = new FamilyRecord(data.state);
    for (const [k, f] of data.facts) rec.facts.set(k, f);
    return rec;
  }

  /** The values for these keys, only if every one is sourced. Otherwise: which are missing. */
  sourcedValues(keys: FactKey[]): { ok: true; values: Record<FactKey, unknown> } | { ok: false; missing: FactKey[] } {
    const missing = keys.filter((k) => !this.facts.has(k));
    if (missing.length) return { ok: false, missing };
    return { ok: true, values: Object.fromEntries(keys.map((k) => [k, this.facts.get(k)!.value])) };
  }
}

/** Age in whole years on a date, from an ISO date of birth. */
export function ageOn(dob: string, asOf: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [ay, am, ad] = asOf.split('-').map(Number) as [number, number, number];
  return ay - y - (am < m || (am === m && ad < d) ? 1 : 0);
}

export interface Projection {
  /** Present only when every fact the archive needs is here. */
  household?: ArchiveHousehold;
  /** The facts still to get (ask the parent, or read the district's record). */
  missing: FactKey[];
  /** Which fact each archive field came from, for the review and the consent log. */
  sources: Record<string, FactKey>;
}

/**
 * The household for the school-meals rules (the shape of archive/playbooks/school_meals/tests):
 * members with age, relationship, student and benefits; income as reported on a meal form
 * (`facts.reported_income`: amount and pay frequency, per earner); the school's type.
 *
 * Required: at least one member; for each member an age (or date of birth) and relationship;
 * for each income an owner, kind, amount and frequency; and a statement about income at all
 * (`household.income_reported`), so "no income" is a fact the parent gave, never a blank.
 */
export function schoolMealsHousehold(rec: FamilyRecord, asOf: string): Projection {
  const missing: FactKey[] = [];
  const sources: Record<string, FactKey> = {};
  const need = <T>(key: FactKey): T | undefined => {
    const f = rec.get<T>(key);
    if (!f) missing.push(key);
    return f?.value;
  };

  const ids = rec.memberIds();
  if (!ids.length) missing.push('member.<id>.age');
  const members: ArchivePerson[] = [];
  for (const id of ids) {
    const dob = rec.get<string>(`member.${id}.dob`);
    const ageFact = rec.get<number>(`member.${id}.age`);
    let age: number | undefined;
    if (dob) {
      age = ageOn(dob.value, asOf);
      sources[`members.${id}.age`] = `member.${id}.dob`;
    } else if (ageFact) {
      age = ageFact.value;
      sources[`members.${id}.age`] = `member.${id}.age`;
    } else missing.push(`member.${id}.age`);
    const relationship = need<Relationship>(`member.${id}.relationship`);
    const student = rec.get<boolean>(`member.${id}.student`);
    const benefits = rec.get<string[]>(`member.${id}.benefits`);
    if (student) sources[`members.${id}.student`] = `member.${id}.student`;
    if (benefits) sources[`members.${id}.benefits`] = `member.${id}.benefits`;
    // A child's own categorical status (school_meals/federal/rules.py individual_categorical).
    const personFacts: Record<string, unknown> = {};
    for (const f of ['homeless', 'migrant', 'runaway'] as const) {
      const v = rec.get<boolean>(`member.${id}.${f}`);
      if (v) {
        personFacts[f] = v.value;
        sources[`members.${id}.facts.${f}`] = `member.${id}.${f}`;
      }
    }
    members.push({
      id,
      age: age ?? 0,
      relationship: relationship ?? 'other',
      ...(student ? { student: student.value } : {}),
      ...(benefits ? { benefits: benefits.value } : {}),
      ...(Object.keys(personFacts).length ? { facts: personFacts } : {}),
    });
  }

  const reported = need<boolean>('household.income_reported');
  const income: Array<{ owner: string; kind: string; amount: number; frequency: PayFrequency }> = [];
  for (const n of rec.incomeIndexes()) {
    const owner = need<string>(`income.${n}.owner`);
    const kind = need<string>(`income.${n}.kind`);
    const amount = need<number>(`income.${n}.amount`);
    const frequency = need<PayFrequency>(`income.${n}.frequency`);
    if (owner !== undefined && kind !== undefined && amount !== undefined && frequency !== undefined) {
      income.push({ owner, kind, amount, frequency });
      sources[`reported_income.${n}`] = `income.${n}.amount`;
    }
  }
  if (reported === true && !rec.incomeIndexes().length) missing.push('income.0.amount');

  const facts: Record<string, unknown> = { reported_income: income };
  // The school's facts (and the Medi-Cal match) usually come from the district, not the parent.
  for (const [key, field] of [
    ['school.type', 'school_type'],
    ['school.cep', 'school_cep'],
    ['school.provision2_nonbase', 'school_provision2_nonbase'],
    ['school.participates_nslp', 'school_participates_nslp'],
    // Medi-Cal income as % of the poverty line: decides free vs reduced direct certification.
    ['household.medicaid_income_fpl_percent', 'medicaid_income_fpl_percent'],
  ] as const) {
    const f = rec.get(key);
    if (f) {
      facts[field] = f.value;
      sources[`facts.${field}`] = key;
    }
  }

  if (missing.length) return { missing: [...new Set(missing)], sources };
  return { household: { state: rec.state, members, facts }, missing: [], sources };
}
