/**
 * The family record with provenance (src/family/facts.ts), and the synthetic families made
 * from the archive's cases (src/eval/families.ts). Needs python3 + PyYAML for the round trip.
 * Run: npm run test:family
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveClient } from '../src/archive/client.js';
import { FamilyRecord, ageOn, schoolMealsHousehold } from '../src/family/facts.js';
import { familyFromCase } from '../src/eval/families.js';

const client = new ArchiveClient();
test.after(() => client.close());

const parent = (quote: string) => ({ kind: 'parent' as const, ref: 'turn-1', quote });

test('a fact needs a source; a parent fact keeps their words; a derived fact names real facts', () => {
  const r = new FamilyRecord('ca');
  assert.throws(() => r.set('member.p.age', 40, undefined as never), /no source/);
  assert.throws(() => r.set('member.p.age', 40, { kind: 'parent', ref: 'turn-1', quote: '' }), /parent's words/);
  assert.throws(() => r.set('household.size', 2, { kind: 'derived', ref: 'count', from: ['member.p.age'] }), /don't have/);
  r.set('member.p.age', 40, parent("I'm 40"));
  r.set('household.size', 1, { kind: 'derived', ref: 'count', from: ['member.p.age'] });
  assert.equal(r.get('household.size')?.value, 1);
});

test('a correction replaces the value and returns the old one', () => {
  const r = new FamilyRecord('ca');
  r.set('income.0.amount', 2000, parent('about 2000 a month'));
  const old = r.set('income.0.amount', 2100, parent("actually it's 2100"));
  assert.equal(old?.value, 2000);
  assert.equal(r.get('income.0.amount')?.value, 2100);
});

test('sourcedValues refuses a form with any unsourced value', () => {
  const r = new FamilyRecord('ca');
  r.set('member.c1.name', 'Emma Lee', { kind: 'district', ref: 'sis:123' });
  assert.deepEqual(r.sourcedValues(['member.c1.name', 'member.c1.dob']), { ok: false, missing: ['member.c1.dob'] });
  assert.deepEqual(r.sourcedValues(['member.c1.name']), { ok: true, values: { 'member.c1.name': 'Emma Lee' } });
});

test('missing facts are reported, never defaulted; "no income" must be said', () => {
  const r = new FamilyRecord('ca');
  r.set('member.p.age', 35, parent('35'));
  r.set('member.c1.dob', '2016-03-02', { kind: 'district', ref: 'sis:9' });
  r.set('member.c1.relationship', 'child', parent('my daughter'));
  const p = schoolMealsHousehold(r, '2026-09-15');
  assert.equal(p.household, undefined);
  assert.deepEqual(p.missing.sort(), ['household.income_reported', 'member.p.relationship']);
  assert.equal(ageOn('2016-03-02', '2026-09-15'), 10);
});

test('every CA school-meals case: record → household → archive gives the expected answer', async () => {
  const cases = await client.cases('school_meals', 'ca');
  const skipped: string[] = [];
  let ran = 0;
  for (const c of cases) {
    const { family, skipped: why } = familyFromCase(c);
    if (!family) { skipped.push(why!); continue; }
    const p = schoolMealsHousehold(family.record, family.asOf);
    assert.deepEqual(p.missing, [], `${c.id} missing ${p.missing.join(', ')}`);
    const d = await client.evaluate('school_meals', p.household!, family.asOf);
    assert.equal(d.status, c.expect.status, `${c.id} status`);
    if (c.expect.tier !== undefined) assert.equal(d.tier, c.expect.tier, `${c.id} tier`);
    ran++;
  }
  console.log(`  round trip: ${ran}/${cases.length} CA cases${skipped.length ? `; skipped: ${skipped.join(' | ')}` : ''}`);
  assert.equal(ran, cases.length, `skipped: ${skipped.join(' | ')}`);
});
