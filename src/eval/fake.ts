import type { FamilyRecord, FactKey } from '../family/facts.js';
import type { FieldValue, FormFill, FormMap, Replica, ReplicaEvent, Submission } from '../pathways/types.js';

/**
 * A stand-in income form and replica, shaped like the Pajaro Valley UBA (students with
 * foster/homeless/migrant boxes, a case number, other members' income by frequency, contact,
 * a parent-only certification). For smoke runs and the harness's own tests until the real
 * replicas (src/replicas/*) land. Not a model of any real form's field ids.
 */

const FREQ_LABEL: Record<string, string> = { weekly: 'weekly', biweekly: 'biweekly', twice_monthly: '2x_monthly', monthly: 'monthly', annual: 'annual' };

/** ISO date → MM/DD/YYYY, as paper forms ask. */
export function usDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export const fakeIncomeForm: FormMap = {
  id: 'fake.income-form.v1',
  title: 'Fake household income form (harness)',
  languages: ['en', 'es'],
  fill(rec: FamilyRecord): FormFill {
    const values: Record<string, FieldValue> = {};
    const sources: Record<string, FactKey[]> = {};
    const missing: FactKey[] = [];
    const set = (field: string, keys: FactKey[], make: (v: unknown[]) => FieldValue | undefined) => {
      const got = rec.sourcedValues(keys);
      if (!got.ok) {
        missing.push(...got.missing);
        return;
      }
      const v = make(keys.map((k) => got.values[k]));
      if (v === undefined) return;
      values[field] = v;
      sources[field] = keys;
    };
    const ids = rec.memberIds();
    const students = ids.filter((id) => rec.get(`member.${id}.student`)?.value === true);
    const others = ids.filter((id) => !students.includes(id));
    students.forEach((id, i) => {
      const s = `student_${i + 1}`;
      set(`${s}_last`, [`member.${id}.last_name`], ([v]) => String(v));
      set(`${s}_first`, [`member.${id}.first_name`], ([v]) => String(v));
      set(`${s}_dob`, [`member.${id}.dob`], ([v]) => usDate(String(v)));
      set(`${s}_school`, [`member.${id}.school`], ([v]) => String(v));
      set(`${s}_grade`, [`member.${id}.grade`], ([v]) => String(v));
      const benefits = rec.get<string[]>(`member.${id}.benefits`);
      if (benefits?.value.includes('foster_care')) set(`${s}_foster`, [`member.${id}.benefits`], () => true);
      for (const f of ['homeless', 'migrant'] as const) if (rec.get(`member.${id}.${f}`)?.value === true) set(`${s}_${f}`, [`member.${id}.${f}`], () => true);
    });
    if (rec.has('household.case_number')) set('case_number', ['household.case_number'], ([v]) => String(v));
    others.forEach((id, i) => {
      const a = `member_${i + 1}`;
      set(`${a}_last`, [`member.${id}.last_name`], ([v]) => String(v));
      set(`${a}_first`, [`member.${id}.first_name`], ([v]) => String(v));
    });
    for (const n of rec.incomeIndexes()) {
      const owner = rec.get<string>(`income.${n}.owner`)?.value;
      const who = owner && students.includes(owner) ? `student_${students.indexOf(owner) + 1}` : `member_${others.indexOf(owner ?? '') + 1}`;
      const kind = rec.get<string>(`income.${n}.kind`)?.value;
      const col = kind === 'earned' || kind === 'self_employment' ? 'earnings' : kind === 'child_support' || kind === 'tanf' ? 'assistance' : 'other';
      set(`${who}_${col}`, [`income.${n}.amount`], ([v]) => String(v));
      set(`${who}_${col}_freq`, [`income.${n}.frequency`], ([v]) => FREQ_LABEL[String(v)] ?? String(v));
    }
    if (rec.get('household.income_reported')?.value === false) set('no_income', ['household.income_reported'], () => true);
    set('email', ['contact.email'], ([v]) => String(v));
    set('phone', ['contact.phone'], ([v]) => String(v));
    set('street', ['contact.street'], ([v]) => String(v));
    set('city_state_zip', ['contact.city', 'contact.state', 'contact.zip'], ([c, s, z]) => `${c}, ${s} ${z}`);
    set('printed_name', [`member.${ids[0]}.first_name`, `member.${ids[0]}.last_name`], ([f, l]) => `${f} ${l}`);
    return { values, sources, missing: [...new Set(missing)], attestations: ['signature', 'certify'] };
  },
};

/** A replica that keeps state and records events. The agent's hands (the runner routes the
 * agent's form/submit steps here) call `receive`; the parent's own link calls `attest`. */
export class FakeReplica implements Replica {
  readonly id = 'fake';
  readonly formId = fakeIncomeForm.id;
  private subs: Submission[] = [];
  private attested = false;
  private events: ReplicaEvent[] = [];
  private n = 0;

  constructor(private readonly opts: { requireAttestation?: boolean } = {}) {}

  async start(): Promise<{ url: string; parentUrl: (token: string) => string; close: () => Promise<void> }> {
    return { url: 'fake://income-form', parentUrl: (t) => `fake://income-form/attest/${t}`, close: async () => {} };
  }

  /** The parent signed through their own link. */
  attest(by: 'parent' | 'agent' = 'parent'): void {
    this.attested = true;
    this.attestedBy = by;
    this.events.push({ at: new Date().toISOString(), kind: 'attest', detail: 'certification', by });
  }
  private attestedBy: 'parent' | 'agent' = 'parent';

  /** A submit. Confirmed (with a reference) only when someone attested, if the form requires it. */
  receive(fields: Record<string, FieldValue>, by: 'agent' | 'parent' = 'agent'): Submission {
    const at = new Date().toISOString();
    for (const [k, v] of Object.entries(fields)) this.events.push({ at, kind: 'field', detail: `${k}=${String(v)}`, by });
    if ((fields.signature || fields.certify) && !this.attested) this.attest(by);
    const ok = this.attested || this.opts.requireAttestation === false;
    if (!ok) this.events.push({ at, kind: 'validation_error', detail: 'certification required', by });
    this.events.push({ at, kind: 'submit', detail: ok ? 'accepted' : 'rejected: not certified', by });
    const reference = ok ? `FAKE-${String(++this.n).padStart(4, '0')}` : undefined;
    if (reference) this.events.push({ at, kind: 'confirm', detail: reference, by });
    const sub: Submission = { replica: this.id, formId: this.formId, fields: { ...fields }, attestedBy: this.attested ? this.attestedBy : 'none', reference, at, events: [...this.events] };
    this.subs.push(sub);
    return sub;
  }

  submissions(): Submission[] {
    return [...this.subs];
  }

  reset(): void {
    this.subs = [];
    this.events = [];
    this.attested = false;
  }
}
