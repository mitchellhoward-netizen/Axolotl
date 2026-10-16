/**
 * The Palm Springs LINQ Income Form replica (src/replicas/linq-income-form.ts), its form map
 * (src/forms/ca-psusd-linq-income-form-2026.ts) and the direct lane (src/lanes/direct.ts).
 * Run: tsx --test scripts/test-linq-replica.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FamilyRecord } from '../src/family/facts.js';
import { bandFor, freeLimit, makeLinqIncomeForm, reducedLimit } from '../src/forms/ca-psusd-linq-income-form-2026.js';
import { LinqIncomeFormReplica, type LinqReplicaOptions } from '../src/replicas/linq-income-form.js';
import { directLane } from '../src/lanes/direct.js';
import type { FormFill, Lang } from '../src/pathways/types.js';

const said = (quote: string) => ({ kind: 'parent' as const, ref: 'turn-1', quote });
const district = { kind: 'district' as const, ref: 'sis:psusd' };
const AS_OF = '2026-10-16';

/** Maria Lopez, her husband, two kids at Palm Springs schools; $1,500 every two weeks. */
function family(): FamilyRecord {
  const r = new FamilyRecord('ca');
  const put = (k: string, v: unknown, s: Parameters<FamilyRecord['set']>[2] = said(`${k}=${JSON.stringify(v)}`)) => r.set(k, v, s, `${AS_OF}T12:00:00Z`);
  put('member.p.first_name', 'Maria');
  put('member.p.last_name', 'Lopez');
  put('member.p.relationship', 'self');
  put('member.q.first_name', 'Jorge');
  put('member.q.last_name', 'Lopez');
  put('member.q.relationship', 'spouse');
  for (const [id, first, dob, sid, school, grade] of [
    ['a', 'Sofia', '2015-03-09', '1023456', 'Cahuilla Elementary School', 5],
    ['b', 'Mateo', '2012-11-30', '1019876', 'Raymond Cree Middle School', '8th'],
  ] as const) {
    put(`member.${id}.first_name`, first, district);
    put(`member.${id}.last_name`, 'Lopez', district);
    put(`member.${id}.relationship`, 'child');
    put(`member.${id}.student`, true, district);
    put(`member.${id}.dob`, dob, district);
    put(`member.${id}.student_id`, sid, district);
    put(`member.${id}.school`, school, district);
    put(`member.${id}.grade`, grade, district);
  }
  put('household.income_reported', true);
  put('income.0.owner', 'q');
  put('income.0.kind', 'earned');
  put('income.0.amount', 1500);
  put('income.0.frequency', 'biweekly');
  return r;
}

async function withReplica(opts: LinqReplicaOptions, fn: (r: LinqIncomeFormReplica, url: string, parentUrl: (t: string) => string) => Promise<void>) {
  const replica = new LinqIncomeFormReplica(opts);
  const srv = await replica.start();
  try {
    await fn(replica, srv.url, srv.parentUrl);
  } finally {
    await srv.close();
  }
}

/** The simulated parent: opens their own link and checks the box (or refuses). */
function simulatedParent(behaviour: 'agree' | 'refuse' = 'agree') {
  let link = '';
  return {
    onParentLink: (l: string) => {
      link = l;
    },
    attest: async (fields: string[]) => {
      assert.deepEqual(fields, ['certify']);
      if (behaviour === 'refuse') throw new Error('parent declined to certify');
      const page = await (await fetch(link)).text();
      assert.match(page, /I certify \(promise\)|Certifico \(prometo\)/);
      const token = new URL(link).searchParams.get('token')!;
      await fetch(new URL('/attest', link), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, certify: 'on' }).toString() });
    },
  };
}

async function runLane(url: string, fill: FormFill, lang: Lang = 'en', behaviour: 'agree' | 'refuse' = 'agree') {
  const parent = simulatedParent(behaviour);
  const lane = directLane({ url, onParentLink: parent.onParentLink, statusWaitMs: 5 });
  return lane.run(makeLinqIncomeForm('range'), fill, { lang, attest: parent.attest });
}

test('the form map fills every field from sourced facts, and the band is derived', () => {
  const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
  assert.deepEqual(fill.missing, []);
  assert.deepEqual(fill.attestations, ['certify']);
  assert.equal(fill.values['student.0.dob'], '03/09/2015');
  assert.equal(fill.values['student.0.school'], 'psusd-cahuilla');
  assert.equal(fill.values['student.1.grade'], '8');
  assert.equal(fill.values.household_size, '4');
  // 1,500 x 26 = 39,000 ≤ 42,900 (free, household of 4)
  assert.equal(fill.values.income_range, 'band_1');
  assert.equal(fill.values.signer_name, 'Maria Lopez');
  assert.ok(!('certify' in fill.values));
  assert.ok(fill.sources.income_range!.includes('income.0.amount'));
  assert.match(fill.derived.income_range!, /annual 39000/);
  for (const id of Object.keys(fill.values)) assert.ok(fill.sources[id]?.length, `${id} has a source`);
});

test('a missing fact is reported, never defaulted', () => {
  const r = family();
  const rec = FamilyRecord.fromJSON({ ...r.toJSON(), facts: r.toJSON().facts.filter(([k]) => k !== 'member.b.student_id' && k !== 'household.income_reported') });
  const fill = makeLinqIncomeForm('range').fill(rec, AS_OF);
  assert.ok(fill.missing.includes('member.b.student_id'));
  assert.ok(fill.missing.includes('household.income_reported'));
  assert.ok(!('income_range' in fill.values));
});

test('range bands at the 2026-27 thresholds; total mode annualizes', () => {
  assert.equal(freeLimit(2), 28132);
  assert.equal(reducedLimit(2), 40034);
  assert.equal(bandFor(2, 28132), 'band_1');
  assert.equal(bandFor(2, 28133), 'band_2');
  assert.equal(bandFor(2, 40034), 'band_2');
  assert.equal(bandFor(2, 40034.01), 'band_3');
  assert.equal(reducedLimit(9), 103082 + 10508);

  const at = (amount: number, frequency: string, mode: 'range' | 'total' = 'range') => {
    const r = new FamilyRecord('ca');
    r.set('member.p.relationship', 'self', said('me'));
    r.set('member.k.relationship', 'child', said('my son'));
    r.set('household.size', 2, said('two of us'));
    r.set('household.income_reported', true, said('I work'));
    r.set('income.0.amount', amount, said(String(amount)));
    r.set('income.0.frequency', frequency, said(frequency));
    return makeLinqIncomeForm(mode).fill(r, AS_OF).values;
  };
  assert.equal(at(40034, 'annual').income_range, 'band_2');
  assert.equal(at(40035, 'annual').income_range, 'band_3');
  assert.equal(at(3336, 'monthly').income_range, 'band_2'); // 40,032
  assert.equal(at(770, 'weekly').income_range, 'band_3'); // 40,040
  assert.equal(at(1668, 'twice_monthly', 'total').total_income, '40032');
  assert.equal(at(1668, 'twice_monthly', 'total').income_range, undefined);
});

test('a correct fill reaches a reference, and every field grades equal', async () => {
  await withReplica({ now: () => Date.parse(`${AS_OF}T18:00:00Z`) }, async (replica, url) => {
    const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
    const result = await runLane(url, fill);
    assert.equal(result.status, 'done', result.detail);
    assert.match(result.reference!, /^[A-Z0-9]{6}$/);
    assert.deepEqual(result.readBack, fill.values);
    const [sub, ...rest] = replica.submissions();
    assert.equal(rest.length, 0);
    assert.equal(sub!.reference, result.reference);
    assert.equal(sub!.attestedBy, 'parent');
    assert.deepEqual(sub!.fields, fill.values);
    assert.ok(sub!.events.some((e) => e.kind === 'attest' && e.by === 'parent'));
    assert.ok(sub!.events.some((e) => e.kind === 'confirm'));
    assert.ok(!sub!.events.some((e) => e.kind === 'validation_error'));
  });
});

test('total mode end to end', async () => {
  await withReplica({ incomeMode: 'total' }, async (replica, url) => {
    const fill = makeLinqIncomeForm('total').fill(family(), AS_OF);
    assert.equal(fill.values.total_income, '39000');
    const result = await runLane(url, fill);
    assert.equal(result.status, 'done', result.detail);
    assert.deepEqual(replica.submissions()[0]!.fields, fill.values);
  });
});

/** An agent that checks the certification box itself (what must never happen). */
async function cheat(url: string, values: Record<string, string>, extra: Record<string, string> = {}) {
  let cookie = '';
  const go = async (path: string, body?: Record<string, string>) => {
    const res = await fetch(new URL(path, url), {
      method: body ? 'POST' : 'GET',
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? new URLSearchParams(body).toString() : undefined,
    });
    const sc = res.headers.getSetCookie()[0];
    if (sc) cookie = sc.split(';')[0]!;
    return { status: res.status, html: await res.text() };
  };
  const csrf = (html: string) => /name="_csrf" value="([^"]*)"/.exec(html)![1]!;
  let page = await go('/');
  page = await go('/form', { _csrf: csrf(page.html), action: 'next', ...values, ...extra });
  if (/id="review"/.test(page.html)) page = await go('/confirm', { _csrf: csrf(page.html) });
  return page;
}

const oneStudent = {
  'student.0.first_name': 'Sofia',
  'student.0.last_name': 'Lopez',
  'student.0.dob': '03/09/2015',
  'student.0.student_id': '1023456',
  'student.0.grade': '5',
  household_size: '2',
  income_range: 'band_1',
  'guardian.0.first_name': 'Maria',
  'guardian.0.last_name': 'Lopez',
  signer_name: 'maria  lopez',
};

test('an agent-checked certification is accepted but recorded as the agent', async () => {
  await withReplica({}, async (replica, url) => {
    const page = await cheat(url, oneStudent, { certify: 'on' });
    assert.match(page.html, /Your reference code is: <strong data-reference>[A-Z0-9]{6}/);
    const [sub] = replica.submissions();
    assert.equal(sub!.attestedBy, 'agent');
    assert.ok(sub!.events.some((e) => e.kind === 'attest' && e.by === 'agent'));
  });
});

test('rows the page never rendered are ignored, and the signer must be a listed guardian', async () => {
  await withReplica({}, async (replica, url) => {
    const page = await cheat(url, { ...oneStudent, 'student.1.first_name': 'Mateo', signer_name: 'Ana Ruiz' });
    assert.match(page.html, /data-error-for="signer_name"/);
    assert.ok(replica.events().some((e) => e.kind === 'field' && /ignored student\.1\.first_name/.test(e.detail)));
    assert.equal(replica.submissions().length, 0);
  });
});

test('validation errors surface and nothing is filed', async () => {
  await withReplica({}, async (replica, url) => {
    const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
    const bad: FormFill = { ...fill, values: { ...fill.values, 'student.0.dob': '2015-03-09', household_size: '1' } };
    const result = await runLane(url, bad);
    assert.equal(result.status, 'failed');
    assert.equal(result.reference, undefined);
    assert.match(result.detail!, /student\.0\.dob/);
    assert.match(result.detail!, /household_size: Household size must include every student/);
    assert.equal(replica.submissions().length, 0);
    const errs = replica.events().filter((e) => e.kind === 'validation_error').map((e) => e.detail);
    assert.ok(errs.some((d) => d.startsWith('student.0.dob')));
    assert.ok(errs.some((d) => d.startsWith('household_size')));
  });
});

test('a stale form token is refused', async () => {
  await withReplica({}, async (_replica, url) => {
    const first = await fetch(url);
    const cookie = first.headers.getSetCookie()[0]!.split(';')[0]!;
    const res = await fetch(new URL('/form', url), { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: 'old', action: 'next' }).toString() });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /data-error="bad_token"/);
  });
});

test('the Spanish page renders, and the lane finishes in Spanish', async () => {
  await withReplica({}, async (replica, url) => {
    const html = await (await fetch(`${url}/?lang=es`)).text();
    assert.match(html, /<html lang="es">/);
    for (const s of ['Formulario de ingresos', 'Agregar estudiante', 'Seleccione el rango de sus ingresos anuales', 'Certifico (prometo)', 'Fecha de nacimiento', '$29,527 o más']) {
      assert.ok(html.includes(s), s);
    }
    const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
    const result = await runLane(url, fill, 'es');
    assert.equal(result.status, 'done', result.detail);
    assert.match(result.parentSummary.es, /código de referencia es [A-Z0-9]{6}/);
    assert.equal(replica.submissions()[0]!.attestedBy, 'parent');
  });
});

test('the lane never reports done without a reference', async () => {
  await withReplica({ dropConfirmation: true }, async (replica, url) => {
    const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
    const result = await runLane(url, fill);
    assert.equal(result.status, 'sent_unconfirmed');
    assert.equal(result.reference, undefined);
    // The replica did file it; the lane just never saw proof.
    assert.equal(replica.submissions()[0]!.attestedBy, 'parent');
  });
});

test('a parent who does not certify leaves it pending, as a handoff', async () => {
  await withReplica({}, async (replica, url) => {
    const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
    const result = await runLane(url, fill, 'en', 'refuse');
    assert.equal(result.status, 'handoff');
    assert.equal(result.reference, undefined);
    const [sub] = replica.submissions();
    assert.equal(sub!.attestedBy, 'none');
    assert.equal(sub!.reference, undefined);
  });
});

test('the lane refuses to post an attestation or a fill with missing facts', async () => {
  const lane = directLane({ url: 'http://127.0.0.1:9' });
  const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
  const attest = async () => {};
  const a = await lane.run(makeLinqIncomeForm(), { ...fill, values: { ...fill.values, certify: true } }, { lang: 'en', attest });
  assert.equal(a.status, 'failed');
  assert.match(a.detail!, /attestation in values/);
  const b = await lane.run(makeLinqIncomeForm(), { ...fill, missing: ['household.size'] }, { lang: 'en', attest });
  assert.equal(b.status, 'failed');
});

test('a session that times out gets one fresh start', async () => {
  let clock = Date.parse(`${AS_OF}T18:00:00Z`);
  await withReplica({ sessionTtlMs: 1000, now: () => clock }, async (replica, url) => {
    const fill = makeLinqIncomeForm('range').fill(family(), AS_OF);
    let calls = 0;
    const slow: typeof fetch = async (input, init) => {
      // The first session's first post arrives after the timeout.
      if (++calls === 2) clock += 5000;
      return fetch(input, init);
    };
    const parent = simulatedParent();
    const result = await directLane({ url, fetch: slow, onParentLink: parent.onParentLink, statusWaitMs: 5 }).run(makeLinqIncomeForm(), fill, { lang: 'en', attest: parent.attest });
    assert.equal(result.status, 'done', result.detail);
    assert.equal(replica.submissions().length, 1);
    assert.ok(replica.events().some((e) => e.detail === 'session: expired'));
  });
});
