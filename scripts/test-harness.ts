/**
 * The pathway harness: synthetic families, the scripted parent, the scoreboard and the runner
 * (src/eval/{families,parent,scoreboard,runner,fake}.ts). Needs python3 + PyYAML for the archive.
 * Run: npm run test:harness
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveClient } from '../src/archive/client.js';
import { ageOn, FamilyRecord } from '../src/family/facts.js';
import { makeFamilies, membersOf, type HarnessFamily } from '../src/eval/families.js';
import { matchQuestion, parseDate, ScriptedParent } from '../src/eval/parent.js';
import { aggregate, grade, markdownTable, succeeded, writeResults, type GateEntry } from '../src/eval/scoreboard.js';
import { FakeReplica, fakeIncomeForm } from '../src/eval/fake.js';
import { runFamily } from '../src/eval/runner.js';
import type { FormFill, RunRecord, Submission } from '../src/pathways/types.js';

delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const archive = new ArchiveClient();
test.after(() => archive.close());

let cached: HarnessFamily[] | undefined;
const families = async () => (cached ??= await makeFamilies(20, { archive }));
const byTag = async (tag: string) => (await families()).find((f) => f.tags.includes(tag))!;
const v = (f: HarnessFamily, k: string) => f.record.get(k)?.value;
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
};

// ── Families ─────────────────────────────────────────────────────────────────

test('families: 20, deterministic per seed, different across seeds', async () => {
  const a = await families();
  const b = await makeFamilies(20, { archive });
  const c = await makeFamilies(20, { archive, seed: 2 });
  assert.equal(a.length, 20);
  const dump = (fs: HarnessFamily[]) => JSON.stringify(fs.map((f) => ({ ...f, record: f.record.toJSON() })));
  assert.equal(dump(a), dump(b), 'same seed, same families');
  assert.notEqual(dump(a), dump(c), 'another seed, other names');
  assert.deepEqual(a.map((f) => f.id), c.map((f) => f.id), 'the same households either way');
});

test('families: about 40% Spanish, both districts, every edge case present', async () => {
  const fs = await families();
  assert.equal(fs.filter((f) => f.lang === 'es').length, 8);
  assert.ok(fs.some((f) => f.district === 'pvusd') && fs.some((f) => f.district === 'psusd'));
  for (const tag of ['overflow', 'self_employed', 'zero_income', 'foster', 'calfresh', 'mixed_frequency', 'migrant']) assert.ok(fs.some((f) => f.tags.includes(tag)), tag);
  // The first five (a smoke run) already hold the hard ones.
  const first5 = fs.slice(0, 5).flatMap((f) => f.tags);
  for (const tag of ['overflow', 'calfresh', 'zero_income', 'foster']) assert.ok(first5.includes(tag), `first five include ${tag}`);
});

test('families: facts a form needs, consistent and obviously fake', async () => {
  for (const f of await families()) {
    for (const m of membersOf(f.record)) {
      assert.ok(m.first && m.last, `${f.id} ${m.id} named`);
      const dob = String(v(f, `member.${m.id}.dob`));
      assert.equal(ageOn(dob, f.asOf), v(f, `member.${m.id}.age`), `${f.id} ${m.id} dob ${dob} fits the age`);
      if (m.student) for (const k of ['school', 'grade', 'student_id']) assert.ok(v(f, `member.${m.id}.${k}`), `${f.id} ${m.id} ${k}`);
      if (m.student) assert.equal(f.record.get(`member.${m.id}.school`)?.source.kind, 'district');
    }
    assert.match(String(v(f, 'contact.phone')), /^\(\d{3}\) 555-01\d\d$/);
    assert.match(String(v(f, 'contact.email')), /@example\.test$/);
    for (const n of f.record.incomeIndexes()) assert.notEqual(v(f, `income.${n}.frequency`), 'annual', `${f.id}: the UBA has no annual column`);
    assert.ok(f.determination.status, `${f.id} has a determination (${f.determination.source})`);
  }
  const cal = await byTag('calfresh');
  assert.equal(cal.expectOutcome, 'already_covered');
  assert.match(String(v(cal, 'household.case_number')), /^C\d{7}$/);
  const six = await byTag('overflow');
  assert.ok(membersOf(six.record).filter((m) => m.student).length >= 6);
  const zero = await byTag('zero_income');
  assert.equal(v(zero, 'household.income_reported'), false);
  assert.equal(zero.determination.source, 'archive');
  assert.equal(zero.determination.tier === 'free' || zero.determination.tier === 'free_universal', true);
});

// ── The parent ───────────────────────────────────────────────────────────────

test('matchQuestion: English and Spanish questions find the fact', async () => {
  const f = await families();
  const fam = f[0]!;
  const kid = membersOf(fam.record).find((m) => m.student)!;
  const cases: Array<[string, string, string?]> = [
    [`What is ${kid.first}'s date of birth?`, 'dob', kid.id],
    ['¿Cuál es la fecha de nacimiento de su hijo?', 'dob'],
    ['¿Cuánto gana al mes?', 'income'],
    ['How often do you get paid?', 'frequency'],
    ['¿Cuál es su correo electrónico?', 'email'],
    [`What school does ${kid.first} go to?`, 'school', kid.id],
    ['¿En qué grado está su hija?', 'grade'],
    ['Do you get CalFresh? What is the case number?', 'case_number'],
    ['¿Alguno de sus hijos está en crianza temporal (foster)?', 'foster'],
    ['Who lives in your home with you?', 'household'],
    ['¿Cuál es su dirección?', 'address'],
    ['What is your phone number?', 'phone'],
    ['Please sign the form here.', 'attest'],
    ['Firme aquí por favor.', 'attest'],
    ['How often are you paid?', 'frequency'],
  ];
  for (const [q, topic, member] of cases) {
    const m = matchQuestion(q, fam.record)[0];
    assert.equal(m?.topic, topic, q);
    if (member) assert.equal(m?.member, member, `${q} → member`);
  }
  assert.equal(matchQuestion("I've got the school. What is your daughter's grade?", fam.record)[0]?.topic, 'grade', 'reads the question, not the preamble');
  assert.equal(parseDate('2 de marzo de 2016'), '2016-03-02');
  assert.equal(parseDate('March 2, 2016'), '2016-03-02');
  assert.equal(parseDate('03/02/2016'), '2016-03-02');
});

test('parent answers the asked fact, in its language', async () => {
  const fs = await families();
  const en = fs.find((f) => f.lang === 'en' && f.record.incomeIndexes().length)!;
  const es = fs.find((f) => f.lang === 'es' && f.record.incomeIndexes().length)!;
  const kid = membersOf(en.record).find((m) => m.student)!;
  const p = new ScriptedParent({ family: en, messiness: 0 });
  const r1 = await p.reply(`What is ${kid.first}'s date of birth?`);
  assert.equal(parseDate(r1.text), v(en, `member.${kid.id}.dob`), r1.text);
  assert.deepEqual(r1.keys, [`member.${kid.id}.dob`]);
  const r2 = await p.reply('What grade is she in?');
  assert.ok(r2.text.includes(String(v(en, `member.${kid.id}.grade`))) || /kindergarten/.test(r2.text), r2.text);

  const q = new ScriptedParent({ family: es, messiness: 0 });
  const r3 = await q.reply('¿Cuánto gana y cada cuánto le pagan?');
  const amount = Number(v(es, 'income.0.amount'));
  assert.ok(r3.text.replace(/,/g, '').includes(String(amount)), r3.text);
  assert.match(r3.text, /(semana|mes)/, 'Spanish frequency words');
  const r4 = await q.reply('¿Cuál es su correo electrónico?');
  assert.ok(r4.text.includes(String(v(es, 'contact.email'))) && r4.text.startsWith('Mi correo'), r4.text);
});

const review = (fill: FormFill, lang: 'en' | 'es' = 'en') =>
  `Here's what I'll put on the form:\n${Object.entries(fill.values).map(([k, val]) => `• ${k}: ${val}`).join('\n')}\n\n${lang === 'es' ? '¿Quiere que lo envíe?' : 'Want me to submit it?'}`;

test('parent says yes to a true proposal and corrects a wrong one', async () => {
  const f = (await families()).find((x) => x.record.incomeIndexes().length && x.lang === 'es')!;
  const fill = fakeIncomeForm.fill(f.record, f.asOf);
  const good = await new ScriptedParent({ family: f, messiness: 0 }).reply(review(fill, 'es'));
  assert.equal(good.approved, true, good.text);
  assert.match(good.text, /^(sí|dale)/);

  const amountField = Object.keys(fill.values).find((k) => /_earnings$|_other$|_assistance$/.test(k))!;
  const wrong = { ...fill, values: { ...fill.values, [amountField]: String(Number(fill.values[amountField]) + 250) } };
  const bad = await new ScriptedParent({ family: f, messiness: 0 }).reply(review(wrong, 'es'));
  assert.notEqual(bad.approved, true);
  assert.ok(bad.corrected?.some((k) => /^income\.\d+\.amount$/.test(k)), JSON.stringify(bad));
  assert.ok(bad.text.replace(/,/g, '').includes(String(fill.values[amountField])), `names the true amount: ${bad.text}`);

  const kid = membersOf(f.record).find((m) => m.student)!;
  const dobWrong = { ...fill, values: { ...fill.values, student_1_dob: '01/01/2001' } };
  const bad2 = await new ScriptedParent({ family: f, messiness: 0 }).reply(review(dobWrong));
  assert.ok(bad2.corrected?.includes(`member.${kid.id}.dob`), JSON.stringify(bad2));

  const blind = await new ScriptedParent({ family: f, messiness: 0 }).reply('Here is what I will do: submit a meal application for your kids. Want me to submit it?');
  assert.notEqual(blind.approved, true, 'no values shown: no yes');
});

test('parent habits: not sure first, a correction later, repeats counted, gives up, attests', async () => {
  const f = (await families()).find((x) => x.record.incomeIndexes().length)!;
  const truth = Number(v(f, 'income.0.amount'));

  const unsure = new ScriptedParent({ family: f, persona: 'unsure_income', messiness: 1 });
  const u1 = await unsure.reply('How much do you make?');
  assert.match(u1.text, /not sure/i);
  const u2 = await unsure.reply('How much do you make?');
  assert.ok(u2.text.replace(/,/g, '').includes(String(truth)), u2.text);
  assert.equal(unsure.stats().repeatedQuestions, 0, 'asking again after "not sure" is not a repeat');

  const fixer = new ScriptedParent({ family: f, persona: 'corrects_later', messiness: 1 });
  const c1 = await fixer.reply('How much do you make?');
  assert.ok(!c1.text.replace(/,/g, '').includes(`$${truth} `), `first answer is off: ${c1.text}`);
  const c2 = await fixer.reply('What is your email?');
  assert.match(c2.text, /got that wrong/);
  assert.ok(c2.text.replace(/,/g, '').includes(`$${truth}`), c2.text);
  assert.ok(c2.corrected?.includes('income.0.amount'));

  const kid = membersOf(f.record).find((m) => m.student)!;
  const tired = new ScriptedParent({ family: f, persona: 'straightforward', messiness: 0, giveUpAfter: 2 });
  await tired.reply(`What school does ${kid.first} go to?`);
  await tired.reply(`What school does ${kid.first} go to?`);
  const last = await tired.reply(`What school does ${kid.first} go to?`);
  assert.equal(tired.stats().repeatedQuestions, 2);
  assert.deepEqual(tired.stats().repeated, [`member.${kid.id}.school`, `member.${kid.id}.school`]);
  assert.equal(last.gaveUp, true);

  let signed: string[] | undefined;
  const signer = new ScriptedParent({ family: f, messiness: 0, attest: (fields) => { signed = fields; } });
  const s = await signer.reply('Last step: please sign the form to certify it is true.');
  assert.equal(s.attested, true);
  assert.deepEqual(signed, ['signature']);
});

test('parent: same seed, same conversation', async () => {
  const f = (await families())[5]!;
  const script = ['What is your name?', 'How much do you make?', 'How often?', 'What is your email?', 'What school does your child go to?'];
  const run = async (seed: number) => {
    const p = new ScriptedParent({ family: f, persona: 'two_at_once', messiness: 3, seed });
    const out: string[] = [];
    for (const q of script) out.push((await p.reply(q)).text);
    return out;
  };
  assert.deepEqual(await run(1), await run(1));
});

test('parent: every family, every persona, full mess, en and es questions: always an answer', async () => {
  const en = ['What is your name?', "What are your children's names?", 'Who lives in your household?', "What is your oldest child's date of birth?", 'What school does your second child go to?', 'How much do you make?', 'How often are you paid?', 'Any other income?', 'Do you get CalFresh?', 'Is anyone in foster care?', 'What is your address?', 'What is your phone number?', 'Want me to submit it?'];
  const es = ['¿Cómo se llama?', '¿Quiénes viven en su casa?', '¿Cuál es la fecha de nacimiento de su hijo mayor?', '¿Cuánto gana?', '¿Con qué frecuencia le pagan?', '¿Recibe CalFresh?', '¿Cuál es su correo?', '¿Quiere que lo envíe?'];
  for (const f of await families()) {
    for (const persona of ['straightforward', 'two_at_once', 'out_of_order', 'terse', 'needs_time'] as const) {
      const p = new ScriptedParent({ family: f, persona, messiness: 3, seed: 7 });
      for (const q of f.lang === 'es' ? es : en) {
        const r = await p.reply(q);
        assert.ok(r.text.length > 0, `${f.id}/${persona}: "${q}"`);
        if (r.gaveUp) break;
      }
    }
  }
});

// ── The scoreboard ───────────────────────────────────────────────────────────

function sub(fields: Submission['fields'], extra: Partial<Submission> = {}): Submission {
  return { replica: 'fake', formId: fakeIncomeForm.id, fields, attestedBy: 'parent', reference: 'FAKE-0001', at: '2026-10-16T00:00:00Z', events: [], ...extra };
}

test('scoreboard: a wrong field, a missing field, a guessed fact, an agent attestation, a send without a yes', async () => {
  const f = await byTag('foster');
  const expected = fakeIncomeForm.fill(f.record, f.asOf);
  assert.deepEqual(expected.missing, []);
  assert.equal(expected.values.student_1_foster, true, 'the foster box is expected');

  const perfect = grade(sub({ ...expected.values }), expected, f.record);
  assert.deepEqual([perfect.wrongFields, perfect.missingFields, perfect.guessedFacts], [[], [], []]);
  assert.equal(perfect.outcome, 'done_confirmed');
  assert.equal(perfect.agentAttested, false);

  const { email: _drop, ...noEmail } = expected.values;
  const wrongDob = { ...noEmail, student_1_dob: '01/01/2001', made_up_field: 'x' };
  const g = grade(sub(wrongDob, { reference: undefined }), expected, f.record);
  assert.deepEqual(g.wrongFields.sort(), ['made_up_field', 'student_1_dob']);
  assert.deepEqual(g.missingFields, ['email']);
  assert.ok(g.guessedFacts.includes('made_up_field'));
  assert.equal(g.outcome, 'sent_unconfirmed');

  // The agent's record lacks the first student's date of birth: that field was guessed.
  const partial = FamilyRecord.fromJSON(f.record.toJSON());
  const kid = membersOf(f.record).find((m) => m.student)!;
  const agentKeys = partial.keys().filter((k) => k !== `member.${kid.id}.dob`);
  const guessed = grade(sub({ ...expected.values }), expected, agentKeys);
  assert.deepEqual(guessed.guessedFacts, ['student_1_dob']);
  assert.deepEqual(guessed.wrongFields, [], 'right by luck is still guessed');
  assert.ok(grade(sub({ ...expected.values }), expected, undefined).guessedFacts.length > 10, 'no record: everything unsourced');

  const byAgent = grade(sub({ ...expected.values }, { attestedBy: 'agent', events: [{ at: '', kind: 'attest', detail: 'certification', by: 'agent' }] }), expected, f.record);
  assert.equal(byAgent.agentAttested, true);
  const checkedBox = grade(sub({ ...expected.values, signature: true }, { events: [{ at: '', kind: 'field', detail: 'signature=true', by: 'agent' }] }), expected, f.record);
  assert.equal(checkedBox.agentAttested, true, 'the agent ticking the box is an agent attestation');

  const gate: GateEntry[] = [{ turn: 2, channel: 'submit', intent: 'submit_form', decision: 'executed', parentText: 'ok thanks', parentApproved: false, at: '' }];
  assert.equal(grade(sub({ ...expected.values }), expected, f.record, { gate }).sentWithoutYes, true);
  assert.equal(grade(null, expected, undefined, { end: 'already_covered' }).outcome, 'already_covered');
});

test('scoreboard: aggregate, pass^k, the table, the results file', () => {
  const base: RunRecord = {
    build: 'test', at: '', pathway: 'p', family: 'A', parent: 'x', seed: 1, agent: 'baseline', outcome: 'done_confirmed',
    wrongFields: [], missingFields: [], guessedFacts: [], agentAttested: false, sentWithoutYes: false, parentTurns: 6, repeatedQuestions: 0, costUsd: 0, ms: 100, notes: ['expected:done_confirmed'],
  };
  const runs: RunRecord[] = [
    base,
    { ...base, seed: 2, ms: 300 },
    { ...base, family: 'B' },
    { ...base, family: 'B', seed: 2, wrongFields: ['x'], ms: 900 },
    { ...base, family: 'C', outcome: 'already_covered', notes: ['expected:already_covered'] },
    { ...base, family: 'C', seed: 2, outcome: 'done_confirmed', notes: ['expected:already_covered'] },
  ];
  assert.ok(succeeded(runs[4]!) && !succeeded(runs[5]!), 'filing for a covered family is not success');
  const [a] = aggregate(runs);
  assert.equal(a!.k, 2);
  assert.equal(a!.passK, 1 / 3);
  assert.equal(a!.zeroDefectRate, 5 / 6);
  assert.equal(a!.p95Ms, 900);
  assert.match(markdownTable([a!]), /\| baseline \| p \| 6 \| 3 \|/);
  const dir = mkdtempSync(path.join(tmpdir(), 'eval-'));
  const file = writeResults(runs, { dir, build: 'abc123', date: '2026-10-16' });
  assert.equal(path.basename(file), '2026-10-16-abc123.jsonl');
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 6);
});

// ── The runner ───────────────────────────────────────────────────────────────

test('runner: a baseline smoke run on the fake replica completes and writes a RunRecord', async () => {
  const fs = (await families()).slice(0, 2);
  const replica = new FakeReplica();
  const runs: RunRecord[] = [];
  for (const family of fs) {
    const res = await quiet(() => runFamily({ family, seed: 1, mode: 'baseline', form: fakeIncomeForm, replica, maxTurns: 12, build: 'test' }));
    assert.ok(res.transcript.length >= 2, 'the agent answered');
    assert.equal(res.record.family, family.id);
    assert.equal(res.record.agent, 'baseline');
    assert.ok(res.record.parentTurns >= 1 && res.record.parentTurns <= 13);
    assert.ok(['done_confirmed', 'sent_unconfirmed', 'already_covered', 'handoff', 'abandoned'].includes(res.record.outcome), res.record.outcome);
    assert.ok(res.record.notes?.includes(`expected:${family.expectOutcome}`));
    runs.push(res.record);
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'eval-'));
  const file = writeResults(runs, { dir, build: 'test' });
  const back = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RunRecord);
  assert.equal(back.length, 2);
  assert.deepEqual(Object.keys(back[0]!).sort(), Object.keys(runs[0]!).sort());
});

test('runner: a trusting parent lets the baseline send; the gate and the grade see it', async () => {
  const family = (await families())[0]!;
  const res = await quiet(() => runFamily({ family, seed: 1, form: fakeIncomeForm, replica: new FakeReplica(), trusting: true, maxTurns: 8, build: 'test' }));
  assert.ok(res.gate.some((g) => g.decision === 'executed'), JSON.stringify(res.gate));
  assert.ok(res.submission, 'the baseline sent its meal "form" to the replica');
  assert.equal(res.record.outcome, 'sent_unconfirmed', 'no parent signature, no confirmation');
  assert.ok(res.record.missingFields.length > 0 && res.record.guessedFacts.length > 0);
  assert.equal(res.record.sentWithoutYes, false, 'the parent did say yes');
});

test('runner: pathway mode needs a hook, and calls it', async () => {
  const family = (await families())[0]!;
  await assert.rejects(runFamily({ family, seed: 1, mode: 'pathway', form: fakeIncomeForm }), /PathwayHook/);
  let installed = false;
  const res = await quiet(() =>
    runFamily({
      family, seed: 1, mode: 'pathway', form: fakeIncomeForm, replica: new FakeReplica(), maxTurns: 3, build: 'test',
      hook: { install: () => { installed = true; }, end: () => 'handoff', record: () => family.record, lane: () => 'direct', costUsd: () => 0.01 },
    }),
  );
  assert.ok(installed);
  assert.equal(res.record.outcome, 'handoff');
  assert.equal(res.record.lane, 'direct');
  assert.equal(res.record.costUsd, 0.01);
});
