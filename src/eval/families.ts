import type { ArchiveCase } from '../archive/client.js';
import { FamilyRecord, type FactSource } from '../family/facts.js';

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
