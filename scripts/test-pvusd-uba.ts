/**
 * Pajaro Valley USD Universal Benefits Application 2026: the form map, the PDF overlay, the
 * PDF lane and the pathway's precheck.
 *
 *   npx tsx --test scripts/test-pvusd-uba.ts
 *
 * The precheck tests need python3 with PyYAML (the archive's own requirement). Set
 * PVUSD_SAMPLE_DIR to also write a filled sample PDF and, with pdftoppm installed, page PNGs.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveClient } from '../src/archive/client.ts';
import { FamilyRecord, type FactSource } from '../src/family/facts.ts';
import { familyFromCase } from '../src/eval/families.ts';
import { ATTESTATIONS, FIELD_IDS, PVUSD_UBA_PDF, fill, overlayMap, pvusdUba2026 } from '../src/forms/ca-pvusd-uba-2026.ts';
import { drawOverlay, readBack } from '../src/forms/pdf-overlay.ts';
import { PdfLane } from '../src/lanes/pdf.ts';
import { pvusdUba } from '../src/pathways/ca-pvusd-uba.ts';

const AS_OF = '2026-10-16';
const archive = new ArchiveClient();
after(() => archive.close());

const said = (quote: string): FactSource => ({ kind: 'parent', ref: 'turn:1', quote });
const district: FactSource = { kind: 'district', ref: 'sis:pvusd' };

/** A household of five in Watsonville: two students, a toddler, two working adults. */
function garcia(): FamilyRecord {
  const r = new FamilyRecord('ca');
  const p = (k: string, v: unknown) => r.set(k, v, said(`${k}=${JSON.stringify(v)}`));
  const member = (id: string, f: Record<string, unknown>) => Object.entries(f).forEach(([k, v]) => p(`member.${id}.${k}`, v));
  member('mom', { first_name: 'María', last_name: 'García', middle_initial: 'l', relationship: 'self', dob: '1988-06-01', student: false, benefits: [] });
  member('dad', { first_name: 'José', last_name: 'García', relationship: 'spouse', dob: '1986-02-11', student: false, benefits: [] });
  member('sofia', { first_name: 'Sofía', last_name: 'García', relationship: 'child', dob: '2015-03-14', student: true, school: 'Ohlone Elementary', grade: '5', foster: false, homeless: false, migrant: false, benefits: [] });
  member('mateo', { first_name: 'Mateo', last_name: 'García', middle_initial: 'J', relationship: 'child', dob: '2012-09-02', student: true, school: 'E.A. Hall Middle School', grade: '8', foster: false, homeless: false, migrant: true, benefits: [] });
  member('lucia', { first_name: 'Lucía', last_name: 'García', relationship: 'child', dob: '2025-01-20', benefits: [] });
  p('household.income_reported', true);
  const inc = (n: number, owner: string, kind: string, amount: number, frequency: string) => {
    p(`income.${n}.owner`, owner);
    p(`income.${n}.kind`, kind);
    p(`income.${n}.amount`, amount);
    p(`income.${n}.frequency`, frequency);
  };
  inc(0, 'mom', 'earned', 1250, 'biweekly');
  inc(1, 'dad', 'earned', 2600.5, 'monthly');
  inc(2, 'mom', 'child_support', 300, 'monthly');
  inc(3, 'mateo', 'earned', 120, 'weekly');
  inc(4, 'dad', 'social_security', 0, 'monthly');
  p('contact.signer', 'mom');
  p('contact.street', '123 Main St Apt 4');
  p('contact.city', 'Watsonville');
  p('contact.state', 'ca');
  p('contact.zip', '95076');
  p('contact.phone', '(831) 555-0142');
  p('contact.email', 'maria.garcia@example.com');
  return r;
}

test('the Garcias fill every box they should, with sources', () => {
  const f = fill(garcia(), AS_OF);
  assert.deepEqual(f.missing, []);
  assert.deepEqual(f.attestations, ['signature', 'date']);
  const v = f.values;
  // Students in the order recorded; the toddler and the adults are "other members".
  assert.equal(v['student.0.first_name'], 'Sofía');
  assert.equal(v['student.0.dob'], '2015-03-14');
  assert.equal(v['student.0.foster'], false);
  assert.equal(v['student.1.migrant'], true);
  assert.equal(v['student.1.mi'], 'J');
  assert.equal(v['student.1.income_amount'], '120');
  assert.equal(v['student.1.income_frequency'], 'weekly');
  assert.equal(v['student.2.first_name'], undefined);
  assert.equal(v['other.0.first_name'], 'María');
  assert.equal(v['other.0.mi'], 'L');
  assert.equal(v['other.0.work_amount'], '1250');
  assert.equal(v['other.0.work_frequency'], 'biweekly');
  assert.equal(v['other.0.assistance_amount'], '300');
  assert.equal(v['other.1.work_amount'], '2601', 'whole dollars, rounded half up');
  assert.equal(v['other.1.other_amount'], '0');
  assert.equal(v['other.2.first_name'], 'Lucía');
  assert.equal(v['other.2.work_amount'], undefined);
  assert.equal(v['adult.printed_name'], 'María García');
  assert.equal(v['adult.city_state_zip'], 'Watsonville, CA 95076');
  assert.equal(v.case_number, undefined, 'no one on a program: no case number asked');
  // Every value has a source, and every field is a known id.
  for (const k of Object.keys(v)) {
    assert.ok(FIELD_IDS.includes(k), `unknown field ${k}`);
    assert.ok(f.sources[k]?.length, `no source for ${k}`);
  }
  assert.deepEqual(f.sources['other.0.work_amount'], ['income.0.owner', 'income.0.amount', 'income.0.kind']);
  // Page 2 stays blank without the parent's own answer.
  assert.equal(v.ethnicity, undefined);
  // Pure: same record, same fill.
  assert.deepEqual(fill(garcia(), AS_OF), f);
});

test('attestations are never in values, and the school-use block has no field', () => {
  const f = fill(garcia(), AS_OF);
  for (const a of ATTESTATIONS) assert.ok(!(a in f.values));
  assert.ok(!Object.keys(f.values).some((k) => /signature|date$|school_use|household_size|total_income/.test(k)));
  assert.ok(!FIELD_IDS.some((k) => /signature|school_use/.test(k)));
});

test('missing facts are reported, never defaulted', () => {
  const r = new FamilyRecord('ca');
  r.set('member.kid.first_name', 'Ana', said('Ana'));
  r.set('member.kid.relationship', 'child', said('my daughter'));
  r.set('member.kid.age', 9, said('she is 9'));
  r.set('member.kid.student', true, said('3rd grade'));
  r.set('member.mom.first_name', 'Rosa', said('Rosa'));
  r.set('member.mom.relationship', 'self', said('me'));
  r.set('member.mom.benefits', ['medicaid'], said('we have Medi-Cal'));
  r.set('income.0.owner', 'mom', said('I work'));
  r.set('income.0.amount', 40000, said('40k a year'));
  r.set('income.0.frequency', 'annual', said('a year'));
  r.set('income.0.kind', 'earned', said('I work'));
  const f = fill(r, AS_OF);
  for (const k of [
    'member.kid.last_name', 'member.kid.dob', 'member.kid.school', 'member.kid.grade',
    'member.kid.foster', 'member.kid.homeless', 'member.kid.migrant', 'member.mom.last_name',
    'household.income_reported', 'income.0.frequency', 'household.case_number', 'contact.signer',
    'contact.street', 'contact.city', 'contact.state', 'contact.zip', 'contact.phone',
  ]) assert.ok(f.missing.includes(k), `expected missing ${k}; got ${f.missing.join(', ')}`);
  assert.ok(!f.missing.includes('contact.email'), 'email is optional');
  assert.ok(!f.missing.includes('member.kid.middle_initial'), 'MI is optional');
  // An annual figure doesn't become a monthly one by our arithmetic.
  assert.equal(f.values['other.0.work_amount'], undefined);
});

test('a school-age child with no student fact is asked about; a toddler is not', () => {
  const r = garcia();
  const f0 = fill(r, AS_OF);
  assert.ok(!f0.missing.includes('member.lucia.student'));
  r.set('member.cousin.first_name', 'Leo', said('my nephew Leo lives with us'));
  r.set('member.cousin.last_name', 'Ruiz', said('Leo Ruiz'));
  r.set('member.cousin.relationship', 'other', said('nephew'));
  r.set('member.cousin.age', 12, said('he is 12'));
  assert.ok(fill(r, AS_OF).missing.includes('member.cousin.student'));
});

test('sensitive facts count only from the parent or the district', () => {
  const r = garcia();
  r.set('member.sofia.homeless', true, { kind: 'document', ref: 'doc:7' });
  let f = fill(r, AS_OF);
  assert.ok(f.missing.includes('member.sofia.homeless'), 'a document is not enough for homeless');
  assert.equal(f.values['student.0.homeless'], undefined);
  r.set('member.sofia.homeless', true, district);
  f = fill(r, AS_OF);
  assert.equal(f.values['student.0.homeless'], true);
  // Foster from the benefits list, when the parent said it.
  r.set('member.sofia.benefits', ['foster_care'], said('she is my foster daughter'));
  const g = fill(r, AS_OF);
  assert.equal(g.values['student.0.foster'], false, 'the explicit answer wins');
  // Race and ethnicity: only the parent's own words; a derived value is ignored.
  r.set('household.ethnicity', 'hispanic_latino', { kind: 'derived', ref: 'rule:surname', from: ['member.mom.last_name'] });
  assert.equal(fill(r, AS_OF).values.ethnicity, undefined);
  r.set('household.ethnicity', 'hispanic_latino', said('Latina'));
  r.set('household.race', ['white', 'american_indian_alaska_native'], said('white and indigenous'));
  const h = fill(r, AS_OF);
  assert.equal(h.values.ethnicity, 'hispanic_latino');
  assert.equal(h.values['race.white'], true);
  assert.equal(h.values['race.american_indian_alaska_native'], true);
});

test('more than five students is reported, not dropped', () => {
  const r = garcia();
  for (let k = 0; k < 4; k++) {
    for (const [f, v] of Object.entries({ first_name: `Kid${k}`, last_name: 'García', relationship: 'child', dob: '2014-01-01', student: true, school: 'Ohlone Elementary', grade: '6', foster: false, homeless: false, migrant: false })) {
      r.set(`member.k${k}.${f}`, v, said(String(v)));
    }
  }
  const f = fill(r, AS_OF);
  assert.ok(f.missing.includes('form.students.over_5'));
  assert.equal(f.values['student.4.first_name'], 'Kid2');
});

test('two incomes in one box on different schedules are asked as one', () => {
  const r = garcia();
  r.set('income.5.owner', 'mom', said('I clean houses too'));
  r.set('income.5.kind', 'self_employment', said('cleaning'));
  r.set('income.5.amount', 200, said('$200'));
  r.set('income.5.frequency', 'weekly', said('a week'));
  assert.ok(fill(r, AS_OF).missing.includes('member.mom.income.work.single_frequency'));
});

test('an archive CalFresh case plus names fills, and asks for the case number', async () => {
  const cases = await archive.cases('school_meals', 'ca');
  const c = cases.find((x) => x.id === 'SCH-CA-T14');
  assert.ok(c, 'SCH-CA-T14 exists');
  const { family } = familyFromCase(c!);
  assert.ok(family);
  const r = family!.record;
  const extra: Record<string, unknown> = {
    'member.p.first_name': 'Ana', 'member.p.last_name': 'Lopez', 'member.q.first_name': 'Luis', 'member.q.last_name': 'Lopez',
    'member.c1.first_name': 'Eva', 'member.c1.last_name': 'Lopez', 'member.c1.dob': '2016-05-05', 'member.c1.school': 'Mintie White Elementary', 'member.c1.grade': '5',
    'member.c2.first_name': 'Leo', 'member.c2.last_name': 'Lopez', 'member.c2.dob': '2019-02-02', 'member.c2.school': 'Mintie White Elementary', 'member.c2.grade': '2',
    'contact.signer': 'p', 'contact.street': '9 Pine St', 'contact.city': 'Watsonville', 'contact.state': 'CA', 'contact.zip': '95076', 'contact.phone': '831-555-0100',
  };
  for (const id of ['c1', 'c2']) for (const f of ['foster', 'homeless', 'migrant']) extra[`member.${id}.${f}`] = false;
  for (const [k, v] of Object.entries(extra)) r.set(k, v, said(String(v)));
  let f = fill(r, family!.asOf);
  assert.deepEqual(f.missing, ['household.case_number']);
  assert.equal(f.values['other.0.work_amount'], '6000');
  assert.equal(f.values['other.0.work_frequency'], 'monthly');
  r.set('household.case_number', '12AB345', said('12AB345'));
  f = fill(r, family!.asOf);
  assert.deepEqual(f.missing, []);
  assert.equal(f.values.case_number, '12AB345');
  // The archive's annual cases don't fill this form until the pay schedule is asked.
  const t01 = familyFromCase(cases.find((x) => x.id === 'SCH-CA-T01')!).family!;
  assert.ok(fill(t01.record, t01.asOf).missing.includes('income.0.frequency'));
});

test('overlay round trip: the PDF reads back exactly the fill, in English and Spanish', async () => {
  const f = fill(garcia(), AS_OF);
  const blank = new Uint8Array(readFileSync(PVUSD_UBA_PDF.path));
  for (const lang of ['en', 'es'] as const) {
    const out = await drawOverlay(blank, overlayMap(lang), f.values, { formId: pvusdUba2026.id, lang, pages: PVUSD_UBA_PDF.pages[lang] });
    assert.deepEqual(out.overflow, []);
    assert.deepEqual(out.unencodable, []);
    assert.deepEqual(out.unmapped, []);
    const back = await readBack(out.bytes);
    assert.ok(back);
    assert.equal(back!.formId, 'ca.pvusd.uba.2026');
    assert.equal(back!.lang, lang);
    assert.deepEqual(back!.values, f.values);
    assert.ok(back!.drawn.every((d) => d.page === 0), 'everything on page 1 of the language');
    const dob = back!.drawn.find((d) => d.field === 'student.0.dob')!;
    assert.equal(dob.text, lang === 'en' ? '03/14/2015' : '14/03/2015');
  }
});

test('every mapped field sits on the page, and choices have one box per frequency', () => {
  for (const lang of ['en', 'es'] as const) {
    const map = overlayMap(lang);
    for (const id of FIELD_IDS) assert.ok(map[id], `${lang}: ${id} has no place on the page`);
    for (const [id, s] of Object.entries(map)) {
      const pts = s.kind === 'choice' ? Object.values(s.options) : [s];
      for (const p of pts) assert.ok(p.x > 0 && p.x < 792 && p.y > 0 && p.y < 612, `${lang}: ${id} off the page`);
    }
  }
});

test('the PDF lane: parent attests, status sent_unconfirmed, read-back equals the fill', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pvusd-'));
  const lane = new PdfLane({ outDir: dir, fileName: (id, lang) => `${id}-${lang}.pdf` });
  const f = fill(garcia(), AS_OF);
  for (const lang of ['en', 'es'] as const) {
    const asked: string[][] = [];
    const res = await lane.run(pvusdUba2026, f, { lang, attest: async (fields) => void asked.push(fields) });
    assert.equal(res.status, 'sent_unconfirmed', res.detail);
    assert.deepEqual(asked, [['signature', 'date']]);
    assert.deepEqual(res.readBack, f.values);
    assert.equal(res.reference, undefined, 'no receipt, no reference');
    assert.match(res.parentSummary.en, /831-786-2325/);
    assert.match(res.parentSummary.es, /831-786-2325/);
    assert.ok(res.path && existsSync(res.path) && statSync(res.path).size > 10_000);
  }
  const declined = await lane.run(pvusdUba2026, f, { lang: 'en', attest: async () => Promise.reject(new Error('no')) });
  assert.equal(declined.status, 'handoff');
  const incomplete = await lane.run(pvusdUba2026, fill(new FamilyRecord('ca'), AS_OF), { lang: 'en', attest: async () => {} });
  assert.equal(incomplete.status, 'failed');
});

test('characters the form font cannot write fail the lane, never mangle the name', async () => {
  const r = garcia();
  r.set('member.sofia.first_name', 'Nguyễn', said('Nguyễn'));
  const res = await new PdfLane().run(pvusdUba2026, fill(r, AS_OF), { lang: 'en', attest: async () => {} });
  assert.equal(res.status, 'failed');
  assert.match(res.detail ?? '', /student\.0\.first_name/);
});

test('precheck: a CalFresh household is told it likely already qualifies', async () => {
  const cases = await archive.cases('school_meals', 'ca');
  const t14 = familyFromCase(cases.find((x) => x.id === 'SCH-CA-T14')!).family!;
  const res = await pvusdUba.precheck!(t14.record, archive, t14.asOf);
  assert.equal(res.file, false);
  assert.match(res.why.en, /already qualifies/);
  assert.match(res.why.en, /831-786-2325/);
  assert.ok(res.determination?.links.includes('snap:direct_certification'));
});

test('precheck: Medi-Cal at 152% FPL counts as covered; a foster child too', async () => {
  const cases = await archive.cases('school_meals', 'ca');
  const t09 = familyFromCase(cases.find((x) => x.id === 'SCH-CA-T09')!).family!;
  assert.equal((await pvusdUba.precheck!(t09.record, archive, t09.asOf)).file, false);
  const r = garcia();
  r.set('member.sofia.foster', true, said('she is my foster daughter'));
  assert.equal((await pvusdUba.precheck!(r, archive, AS_OF)).file, false);
});

test('precheck: the Garcias (no programs) should file', async () => {
  const res = await pvusdUba.precheck!(garcia(), archive, AS_OF);
  // Mateo is migrant in this family: covered. Without that, they file.
  assert.equal(res.file, false);
  const r = garcia();
  r.set('member.mateo.migrant', false, said('no'));
  const res2 = await pvusdUba.precheck!(r, archive, AS_OF);
  assert.equal(res2.file, true, res2.why.en);
  assert.equal(res2.determination?.program, 'school_meals');
});

test('pathway shape', () => {
  assert.equal(pvusdUba.id, 'ca.pvusd.uba');
  assert.deepEqual(pvusdUba.lanes, ['pdf', 'paper']);
  assert.equal(pvusdUba.confirmation.kind, 'none');
  assert.ok(pvusdUba.opensNext.includes('ca.calfresh'));
  for (const k of ['member.<m>.foster', 'member.<m>.homeless', 'member.<m>.migrant']) {
    const s = pvusdUba.facts.find((x) => x.key === k)!;
    assert.equal(s.sensitive, true);
    assert.deepEqual(s.sources, ['parent', 'district']);
  }
  for (const s of pvusdUba.facts) if (s.key !== 'household.medicaid_income_fpl_percent') assert.ok(s.ask.en && s.ask.es, `${s.key} needs both questions`);
});

test('sample render (PVUSD_SAMPLE_DIR)', { skip: !process.env.PVUSD_SAMPLE_DIR }, async () => {
  const dir = process.env.PVUSD_SAMPLE_DIR!;
  const r = garcia();
  r.set('household.ethnicity', 'hispanic_latino', said('Latina'));
  r.set('household.race', ['white'], said('white'));
  r.set('member.mateo.benefits', ['medicaid'], said('Mateo has Medi-Cal'));
  r.set('household.case_number', '91234567A', said('91234567A'));
  const f = fill(r, AS_OF);
  assert.deepEqual(f.missing, []);
  const blank = new Uint8Array(readFileSync(PVUSD_UBA_PDF.path));
  for (const lang of ['en', 'es'] as const) {
    const out = await drawOverlay(blank, overlayMap(lang), f.values, { formId: pvusdUba2026.id, lang, pages: PVUSD_UBA_PDF.pages[lang] });
    const pdf = path.join(dir, `pvusd-uba-2026-sample-${lang}.pdf`);
    writeFileSync(pdf, out.bytes);
    try {
      execFileSync('pdftoppm', ['-r', '144', '-png', pdf, path.join(dir, `pvusd-uba-2026-sample-${lang}`)]);
    } catch {
      /* pdftoppm not installed: the PDF is still written */
    }
  }
});
