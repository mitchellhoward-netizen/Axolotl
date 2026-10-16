/**
 * The pathway engine (src/pathways/engine.ts): facts from the parent's words, the next question
 * by what it saves, the precheck, a proposal bound to the parent's yes, the lane with exactly
 * the approved fill, and attestations left to the parent. Deterministic: no keys, no Jev, no
 * archive worker. Run: npx tsx --test scripts/test-pathway-engine.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FamilyRecord } from '../src/family/facts.js';
import type { ArchiveClient } from '../src/archive/client.js';
import { PathwayEngine, type PathwayEngineOptions, type PathwaySession } from '../src/pathways/engine.js';
import { PathwayRegistry, type PathwayHints } from '../src/pathways/registry.js';
import {
  extractFacts,
  parseDates,
  parseGrade,
  parseMoney,
  parseName,
  saysNoIncome,
  type Slot,
  acceptModelFacts,
} from '../src/pathways/extract.js';
import type { FactSpec, FormFill, FormMap, LaneResult, LaneRunner, Pathway } from '../src/pathways/types.js';

// Never let a run send real mail or reach Jev.
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
const ENV = { JEV_ENABLED: 'false' } as NodeJS.ProcessEnv;

// ── a fake 3-fact pathway ────────────────────────────────────────────────────

const MEALS_FACTS: FactSpec[] = [
  { key: 'household.size', kind: 'number', required: true, sources: ['parent'], ask: { en: 'How many people live in your home, counting you?', es: '¿Cuántas personas viven en tu casa, contándote a ti?' } },
  { key: 'household.monthly_income', kind: 'number', required: true, sources: ['parent'], ask: { en: 'About how much does your household make in a month, before taxes?', es: '¿Cuánto gana tu hogar al mes, antes de impuestos?' } },
  { key: 'household.calfresh', kind: 'boolean', required: true, sources: ['parent', 'district'], ask: { en: 'Does anyone in your home get CalFresh?', es: '¿Alguien en tu casa recibe CalFresh?' } },
];

function mealsForm(opts: { leakAttestation?: boolean } = {}): FormMap {
  return {
    id: 'fake.meals.2026',
    title: 'Fake meal form',
    languages: ['en', 'es'],
    fill(rec: FamilyRecord): FormFill {
      const values: Record<string, string | boolean> = {};
      const sources: Record<string, string[]> = {};
      const missing: string[] = [];
      const size = rec.get<number>('household.size');
      const income = rec.get<number>('household.monthly_income');
      const calfresh = rec.get<boolean>('household.calfresh');
      if (size) (values.hh_size = String(size.value), (sources.hh_size = ['household.size']));
      else missing.push('household.size');
      if (income) (values.monthly_income = `$${income.value.toLocaleString('en-US')}`, (sources.monthly_income = ['household.monthly_income']));
      else missing.push('household.monthly_income');
      if (calfresh) (values.calfresh = calfresh.value, (sources.calfresh = ['household.calfresh']));
      else missing.push('household.calfresh');
      if (opts.leakAttestation) values.certify = true;
      return { values, sources, missing, attestations: ['certify'] };
    },
  };
}

const COVERED = { en: 'Since your family gets CalFresh, your child already gets free meals.', es: 'Como tu familia recibe CalFresh, tu hijo ya tiene comidas gratis.' };

function mealsPathway(opts: { leakAttestation?: boolean; opensNext?: string[] } = {}): Pathway {
  return {
    id: 'fake.meals',
    title: { en: 'the meal form', es: 'el formulario de comidas' },
    state: 'ca',
    facts: MEALS_FACTS,
    async precheck(rec) {
      const cf = rec.get<boolean>('household.calfresh');
      return cf?.value === true ? { file: false, why: COVERED } : { file: true, why: { en: 'Not covered yet.', es: 'Todavía no.' } };
    },
    form: mealsForm(opts),
    lanes: ['direct'],
    confirmation: { kind: 'reference', pattern: /^REF-\d+$/, describe: { en: 'a reference number', es: 'un número de referencia' } },
    opensNext: opts.opensNext ?? [],
  };
}

const MEALS_HINTS: PathwayHints = {
  precheckFacts: ['household.calfresh'],
  shortCircuit: { 'household.calfresh': { when: (v) => v === true, prior: 0.3 } },
  labels: {
    hh_size: { en: 'People in the home', es: 'Personas en casa' },
    monthly_income: { en: 'Monthly income', es: 'Ingreso mensual' },
    calfresh: { en: 'Gets CalFresh', es: 'Recibe CalFresh' },
  },
};

class FakeLane implements LaneRunner {
  kind = 'direct' as const;
  calls: FormFill[] = [];
  attested: string[][] = [];
  constructor(private readonly o: { attest?: string[]; result?: Partial<LaneResult> } = {}) {}
  async run(_form: FormMap, fill: FormFill, ctx: { lang: 'en' | 'es'; attest: (fields: string[]) => Promise<void> }): Promise<LaneResult> {
    this.calls.push(JSON.parse(JSON.stringify(fill)));
    if (this.o.attest) {
      await ctx.attest(this.o.attest);
      this.attested.push(this.o.attest);
    }
    return {
      status: 'done',
      reference: 'REF-123',
      readBack: { ...fill.values },
      parentSummary: { en: 'The school has your form.', es: 'La escuela tiene tu formulario.' },
      ...this.o.result,
    };
  }
}

function setup(o: { lane?: FakeLane; pathway?: Pathway; hints?: PathwayHints; consent?: Array<Record<string, unknown>>; extra?: Pathway[]; gate?: PathwayEngineOptions['gate'] } = {}) {
  const registry = new PathwayRegistry();
  const pathway = o.pathway ?? mealsPathway();
  registry.registerPathway(pathway, o.hints ?? MEALS_HINTS);
  for (const p of o.extra ?? []) registry.registerPathway(p, MEALS_HINTS);
  const lane = o.lane ?? new FakeLane();
  registry.registerLane(lane);
  const consent = o.consent ?? [];
  const engine = makeEngine({ registry, consent, gate: o.gate });
  const state: { pathway?: PathwaySession; profile?: { locale?: 'en' | 'es' } } = {};
  const say = async (text: string) => {
    const r = (await engine.turn('conv-1', state, text))?.text;
    // PATHWAY_TRANSCRIPT=1 prints each exchange, to read the replies as a parent would.
    if (process.env.PATHWAY_TRANSCRIPT) console.log(`parent: ${text}\nhelper: ${r ?? '(handed back to the agent)'}\n`);
    return r;
  };
  return { engine, state, lane, registry, pathway, consent, say };
}

function makeEngine(o: { registry: PathwayRegistry; consent: Array<Record<string, unknown>>; gate?: PathwayEngineOptions['gate'] }) {
  return new PathwayEngine({
    registry: o.registry,
    env: ENV,
    archive: () => ({}) as ArchiveClient,
    now: () => new Date('2026-10-16T17:00:00Z'),
    logConsent: (_c, d) => o.consent.push(d),
    gate: o.gate,
  });
}

const count = (haystack: string[], needle: string) => haystack.filter((t) => t.includes(needle)).length;

// ── the conversation ─────────────────────────────────────────────────────────

test('a cooperative parent finishes the 3-fact form in the minimum turns, CalFresh asked first', async () => {
  const { engine, state, lane, say, consent } = setup();
  const first = await engine.start('conv-1', state, 'fake.meals');
  assert.match(first.text, /CalFresh/, 'the question that can end the form goes first');
  assert.match(first.text, /nothing gets sent until you say yes/);
  assert.match((await say('no'))!, /How many people/);
  assert.match((await say('4'))!, /make in a month/);
  const proposal = (await say('2,100 a month'))!;
  assert.match(proposal, /People in the home: 4/);
  assert.match(proposal, /Monthly income: \$2,100/);
  assert.match(proposal, /Gets CalFresh: No/);
  assert.match(proposal, /sign the certification yourself/);
  assert.equal(lane.calls.length, 0, 'nothing runs before the yes');
  const done = (await say('yes'))!;
  assert.equal(lane.calls.length, 1);
  assert.match(done, /^Done\./);
  assert.match(done, /REF-123/);
  const s = state.pathway!;
  assert.equal(s.outcome, 'done_confirmed');
  assert.equal(s.turn, 4, 'three answers and one yes');
  assert.equal(s.repeatedQuestions, 0);
  assert.equal(consent.length, 1, 'the approval is logged');
  assert.deepEqual((consent[0]!.values as Record<string, string>)['Monthly income'], '$2,100');
  // Every fact carries the parent's words and the turn.
  const rec = FamilyRecord.fromJSON(s.record);
  const income = rec.get('household.monthly_income')!;
  assert.equal(income.value, 2100);
  assert.deepEqual(income.source, { kind: 'parent', ref: 'conv-1#3', quote: '2,100 a month' });
});

test('two facts in one message, and an answer out of order', async () => {
  const a = setup();
  await a.engine.start('conv-1', a.state, 'fake.meals');
  const p = (await a.say("no calfresh. We're 4 people and we make $2,100 a month"))!;
  assert.match(p, /Here is everything the form will say/, 'all three in one message → straight to the proposal');
  assert.equal(a.state.pathway!.turn, 1);

  const b = setup();
  await b.engine.start('conv-1', b.state, 'fake.meals');
  const next = (await b.say('we make 2100 a month'))!;
  const rec = FamilyRecord.fromJSON(b.state.pathway!.record);
  assert.equal(rec.get('household.monthly_income')?.value, 2100, 'the volunteered fact is kept');
  assert.ok(!rec.has('household.calfresh'), 'and nothing is assumed about the question they skipped');
  assert.match(next, /CalFresh/);
});

test('a correction updates the fact, is said back, and re-shows the proposal', async () => {
  const { engine, state, lane, say } = setup();
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  await say('4');
  await say('2,100 a month');
  const updated = (await say("actually it's 2,300"))!;
  assert.match(updated, /changed monthly income from 2,100 to 2,300/);
  assert.ok(!updated.includes('Updated.'), 'one acknowledgement, not two');
  assert.match(updated, /Monthly income: \$2,300/);
  assert.equal(lane.calls.length, 0);
  await say('yes');
  assert.equal(lane.calls[0]!.values.monthly_income, '$2,300');
  const rec = FamilyRecord.fromJSON(state.pathway!.record);
  assert.equal((rec.get('household.monthly_income')!.source as { quote: string }).quote, "actually it's 2,300");
});

test('Spanish, start to finish', async () => {
  const { engine, state, lane, say } = setup();
  const first = await engine.start('conv-1', state, 'fake.meals', { lang: 'es' });
  assert.match(first.text, /Te puedo ayudar con el formulario de comidas/);
  assert.match(first.text, /recibe CalFresh/);
  assert.match((await say('no tenemos'))!, /Cuántas personas/);
  assert.match((await say('somos cinco'))!, /Cuánto gana/);
  const p = (await say('ganamos 1.800 al mes'))!;
  assert.match(p, /Esto es todo lo que dirá el formulario/);
  assert.match(p, /Personas en casa: 5/);
  assert.match(p, /Ingreso mensual: \$1,800/);
  assert.match(p, /Recibe CalFresh: No/);
  assert.match(p, /¿Quieres que lo envíe\?/);
  const done = (await say('sí'))!;
  assert.match(done, /^Listo\./);
  assert.match(done, /La escuela tiene tu formulario/);
  assert.equal(lane.calls.length, 1);
});

test('a family on CalFresh is told it is already covered, and nothing is filed', async () => {
  const { engine, state, lane, say } = setup();
  await engine.start('conv-1', state, 'fake.meals');
  const r = (await say('yes we get calfresh'))!;
  assert.match(r, /already gets free meals/);
  assert.match(r, /nothing to fill out/);
  assert.equal(lane.calls.length, 0);
  assert.equal(state.pathway!.outcome, 'already_covered');
  assert.equal(state.pathway!.proposal, undefined);
  assert.equal(state.pathway!.turn, 1, 'one question instead of three');
});

test('nothing runs without a yes', async () => {
  const { engine, state, lane, say } = setup();
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  await say('4');
  await say('2100 a month');
  assert.equal(state.pathway!.stage, 'proposed');
  assert.match((await say('hmm'))!, /send it as shown, or change something/);
  assert.equal(await say('thanks'), 'Want me to send it as shown, or change something?');
  assert.equal(lane.calls.length, 0);
  assert.match((await say('no'))!, /won't send anything/);
  assert.equal(lane.calls.length, 0);
  assert.equal(state.pathway!.stage, 'paused');
  // Coming back re-shows the values before anything can run.
  const again = (await say('continue'))!;
  assert.match(again, /Here is everything the form will say/);
  assert.equal(lane.calls.length, 0);
  await say('yes');
  assert.equal(lane.calls.length, 1);
});

test('a value changed after the proposal was shown re-shows it instead of running', async () => {
  const { engine, state, lane, say } = setup();
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  await say('4');
  await say('2100 a month');
  // Something else changes the record after the parent saw the proposal.
  const rec = FamilyRecord.fromJSON(state.pathway!.record);
  rec.set('household.size', 5, { kind: 'parent', ref: 'elsewhere', quote: 'we are 5' });
  state.pathway!.record = rec.toJSON();
  const r = (await say('yes'))!;
  assert.equal(lane.calls.length, 0, 'the yes was for 4 people, not 5');
  assert.match(r, /Updated/);
  assert.match(r, /People in the home: 5/);
  await say('yes');
  assert.equal(lane.calls.length, 1);
  assert.equal(lane.calls[0]!.values.hh_size, '5');
});

test('a side question pauses the session; a yes after it re-shows, never runs', async () => {
  const { engine, state, lane, say } = setup();
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  await say('4');
  await say('2100 a month');
  assert.equal(await say('when is picture day?'), undefined, 'the normal agent answers it');
  assert.equal(state.pathway!.stage, 'paused');
  // The normal agent has the conversation now: its "want me to add it to your calendar?" gets
  // this yes, not our proposal.
  assert.equal(await say('yes'), undefined);
  assert.equal(await say('4'), undefined, 'a bare answer while paused is not ours either');
  assert.equal(lane.calls.length, 0);
  const r = (await say("ok let's finish this"))!;
  assert.match(r, /Here is everything the form will say/);
  assert.equal(lane.calls.length, 0);
  await say('yes');
  assert.equal(lane.calls.length, 1);
});

test('after "I don\'t know", the answer texted later picks the session back up', async () => {
  const { engine, state, say } = setup();
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  assert.match((await say("I don't know, let me check"))!, /When you have it, just text it to me/);
  assert.equal(state.pathway!.stage, 'paused');
  assert.match((await say('5'))!, /make in a month/);
  assert.equal(FamilyRecord.fromJSON(state.pathway!.record).get('household.size')?.value, 5);
});

test('the same question is never asked a third time: a person is offered', async () => {
  const { engine, state, say } = setup();
  const asked: string[] = [(await engine.start('conv-1', state, 'fake.meals')).text];
  asked.push((await say('blah'))!);
  const third = (await say('blah blah'))!;
  assert.equal(count(asked, 'Does anyone in your home get CalFresh?'), 2);
  assert.ok(!third.includes('CalFresh'));
  assert.match(third, /connect you with a person/);
  assert.match((await say('yes'))!, /pass this to a person/);
  assert.equal(state.pathway!.outcome, 'handoff');
  assert.equal(state.pathway!.repeatedQuestions, 1);
});

test('the lane gets exactly the approved fill, and never an attestation', async () => {
  const { engine, state, lane, say, consent } = setup({ pathway: mealsPathway({ leakAttestation: true }) });
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  await say('4');
  const p = (await say('2100 a month'))!;
  assert.ok(!/Certify/i.test(p.split('\n').filter((l) => l.startsWith('  - ')).join('\n')), 'an attestation is never shown as a value we fill');
  await say('yes');
  assert.deepEqual(lane.calls[0]!.values, { calfresh: false, hh_size: '4', monthly_income: '$2,100' });
  assert.deepEqual(lane.calls[0]!.attestations, ['certify']);
  assert.ok(!('certify' in lane.calls[0]!.values));
  assert.deepEqual((consent[0]!.values as Record<string, string>), { 'Gets CalFresh': 'No', 'People in the home': '4', 'Monthly income': '$2,100' });
});

test('attestations are the parent\'s: the engine waits for their turn', async () => {
  const lane = new FakeLane({ attest: ['certify'] });
  const { engine, state, say } = setup({ lane, hints: { ...MEALS_HINTS, labels: { ...MEALS_HINTS.labels, certify: { en: 'I certify this is true', es: 'Certifico que es verdad' } } } });
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  await say('4');
  await say('2100 a month');
  const ask = (await say('yes'))!;
  assert.match(ask, /your own signature on: I certify this is true/);
  assert.equal(state.pathway!.stage, 'attesting');
  assert.equal(lane.attested.length, 0, 'not completed by the engine');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(lane.attested.length, 0, 'still waiting on the parent');
  assert.match((await say('ok'))!, /^Done\./);
  assert.equal(lane.attested.length, 1);
  assert.equal(state.pathway!.outcome, 'done_confirmed');
});

test('a parent who won\'t sign: nothing is claimed', async () => {
  const lane = new FakeLane({ attest: ['certify'] });
  lane.run = async (_f, fill, ctx) => {
    lane.calls.push(fill);
    try {
      await ctx.attest(['certify']);
    } catch {
      return { status: 'failed', readBack: {}, parentSummary: { en: '', es: '' } };
    }
    return { status: 'done', reference: 'REF-1', readBack: fill.values, parentSummary: { en: '', es: '' } };
  };
  const { engine, state, say } = setup({ lane });
  await engine.start('conv-1', state, 'fake.meals');
  await say('no');
  await say('4');
  await say('2100 a month');
  await say('yes');
  assert.match((await say('no'))!, /Nothing goes in without your signature/);
  assert.equal(state.pathway!.outcome, 'abandoned');
});

test('done only with a confirmation; a read-back that differs is not done', async () => {
  const unconfirmed = setup({ lane: new FakeLane({ result: { status: 'sent_unconfirmed', reference: undefined } }) });
  await unconfirmed.engine.start('conv-1', unconfirmed.state, 'fake.meals');
  await unconfirmed.say("no calfresh, 4 people, we make 2100 a month");
  assert.match((await unconfirmed.say('yes'))!, /don't have a confirmation yet/);
  assert.equal(unconfirmed.state.pathway!.outcome, 'sent_unconfirmed');

  const noRef = setup({ lane: new FakeLane({ result: { reference: undefined } }) });
  await noRef.engine.start('conv-1', noRef.state, 'fake.meals');
  await noRef.say("no calfresh, 4 people, we make 2100 a month");
  assert.match((await noRef.say('yes'))!, /isn't done until they confirm/);

  const wrong = setup({ lane: new FakeLane({ result: { readBack: { hh_size: '40', monthly_income: '$2,100', calfresh: false } } }) });
  await wrong.engine.start('conv-1', wrong.state, 'fake.meals');
  await wrong.say("no calfresh, 4 people, we make 2100 a month");
  const r = (await wrong.say('yes'))!;
  assert.match(r, /People in the home didn't read back/);
  assert.equal(wrong.state.pathway!.outcome, 'sent_unconfirmed');
});

test('what it opens next is offered, and a yes starts it with the facts carried over', async () => {
  const next: Pathway = { ...mealsPathway(), id: 'fake.sunbucks', title: { en: 'SUN Bucks', es: 'SUN Bucks' }, precheck: undefined };
  const { engine, state, say } = setup({ pathway: mealsPathway({ opensNext: ['fake.sunbucks'] }), extra: [next] });
  await engine.start('conv-1', state, 'fake.meals');
  await say("no calfresh, 4 people, we make 2100 a month");
  const done = (await say('yes'))!;
  assert.match(done, /I can also help with SUN Bucks/);
  const r = (await say('yes'))!;
  assert.equal(state.pathway!.id, 'fake.sunbucks');
  assert.match(r, /Here is everything the form will say/, 'no question asked twice: every fact was already known');
});

test('gates: crisis and distress go back to the agent; asking for a person ends it', async () => {
  const a = setup();
  await a.engine.start('conv-1', a.state, 'fake.meals');
  assert.equal(await a.say("I can't take this anymore, I want to die"), undefined);
  assert.equal(a.state.pathway!.stage, 'paused');
  const b = setup();
  await b.engine.start('conv-1', b.state, 'fake.meals');
  assert.match((await b.say('can I talk to a real person?'))!, /pass this to a person/);
  assert.equal(b.state.pathway!.outcome, 'handoff');
  const c = setup();
  await c.engine.start('conv-1', c.state, 'fake.meals');
  assert.equal(await c.say('estoy agobiada, no puedo más'), undefined);
  // A second gate (Jev in production) is consulted when the words don't settle it.
  const d = setup({ gate: async () => ({ label: 'off_topic', confidence: 0.95 }) });
  await d.engine.start('conv-1', d.state, 'fake.meals');
  assert.equal(await d.say('my cousin is visiting'), undefined);
  assert.equal(d.state.pathway!.stage, 'paused');
  // "why?" is about the form: answered, not handed back, and not counted as asking again.
  const e = setup();
  await e.engine.start('conv-1', e.state, 'fake.meals');
  assert.match((await e.say('why do you need that?'))!, /The form asks for it/);
  assert.equal(e.state.pathway!.asked['household.calfresh'], 1);
});

// ── a pathway with people, incomes and a sensitive fact ──────────────────────

const CHILD_FACTS: FactSpec[] = [
  { key: 'member.<m>.first_name', kind: 'string', required: true, sources: ['parent'], ask: { en: "What's your child's first and last name?", es: '¿Cómo se llama tu hijo o hija (nombre y apellido)?' } },
  { key: 'member.<m>.last_name', kind: 'string', required: true, sources: ['parent'], ask: { en: '', es: '' } },
  { key: 'member.<m>.dob', kind: 'date', required: true, sources: ['parent', 'district'], ask: { en: 'And their date of birth?', es: '¿Y su fecha de nacimiento?' } },
  { key: 'income.<n>.amount', kind: 'number', required: true, sources: ['parent'], ask: { en: 'How much do you get paid, and how often?', es: '¿Cuánto te pagan, y cada cuánto?' } },
  { key: 'income.<n>.frequency', kind: 'enum', options: ['weekly', 'biweekly', 'twice_monthly', 'monthly', 'annual'], required: true, sources: ['parent'], ask: { en: 'How often is that?', es: '¿Cada cuánto?' } },
  { key: 'household.foster', kind: 'boolean', required: true, sensitive: true, sources: ['parent'], ask: { en: 'Is your child in foster care?', es: '¿Tu hijo o hija está en cuidado de crianza?' } },
];

const childForm: FormMap = {
  id: 'fake.child.2026',
  title: 'Fake child form',
  languages: ['en', 'es'],
  fill(rec) {
    const values: Record<string, string | boolean> = {};
    const sources: Record<string, string[]> = {};
    const missing: string[] = [];
    const ids = rec.memberIds();
    if (!ids.length) missing.push('member.<m>.first_name', 'member.<m>.last_name', 'member.<m>.dob');
    for (const id of ids) {
      for (const f of ['first_name', 'last_name', 'dob']) {
        const v = rec.get<string>(`member.${id}.${f}`);
        if (v) (values[`child_${f}`] = v.value, (sources[`child_${f}`] = [`member.${id}.${f}`]));
        else missing.push(`member.${id}.${f}`);
      }
    }
    const idx = rec.incomeIndexes();
    if (!idx.length) missing.push('income.<n>.amount', 'income.<n>.frequency');
    for (const n of idx) {
      const a = rec.get<number>(`income.${n}.amount`);
      const f = rec.get<string>(`income.${n}.frequency`);
      if (a) values[`income_${n}`] = String(a.value);
      else missing.push(`income.${n}.amount`);
      if (f) values[`income_${n}_how_often`] = f.value;
      else missing.push(`income.${n}.frequency`);
    }
    const foster = rec.get<boolean>('household.foster');
    if (foster) values.foster = foster.value;
    else missing.push('household.foster');
    return { values, sources, missing, attestations: ['signature'] };
  },
};

const childPathway: Pathway = {
  id: 'fake.child',
  title: { en: 'the child form', es: 'el formulario' },
  state: 'ca',
  facts: CHILD_FACTS,
  form: childForm,
  lanes: ['pdf'],
  confirmation: { kind: 'receipt_email', describe: { en: 'a receipt', es: 'un recibo' } },
  opensNext: [],
};

const CHILD_HINTS: PathwayHints = {
  groups: [{ keys: ['member.<m>.first_name', 'member.<m>.last_name', 'member.<m>.dob'], ask: { en: "What's your child's full name and date of birth?", es: '¿Cuál es el nombre completo de tu hijo o hija y su fecha de nacimiento?' } }],
  why: { 'household.foster': { en: 'Children in foster care get free meals automatically.', es: 'Los niños en cuidado de crianza reciben comidas gratis automáticamente.' } },
};

test('a child\'s name and birth date in one question; dates and pay in Spanish; a sensitive fact asked gently', async () => {
  const lane = new FakeLane();
  (lane as { kind: string }).kind = 'pdf';
  const { engine, state, say } = setup({ pathway: childPathway, hints: CHILD_HINTS, lane });
  const first = await engine.start('conv-1', state, 'fake.child', { lang: 'es' });
  assert.match(first.text, /nombre completo de tu hijo o hija y su fecha de nacimiento/);
  assert.deepEqual(state.pathway!.lastAsked, ['member.m1.first_name', 'member.m1.last_name', 'member.m1.dob']);
  const q2 = (await say('Ana López, nació el 3/4/2016'))!;
  const rec = FamilyRecord.fromJSON(state.pathway!.record);
  assert.equal(rec.get('member.m1.first_name')?.value, 'Ana');
  assert.equal(rec.get('member.m1.last_name')?.value, 'López');
  assert.equal(rec.get('member.m1.dob')?.value, '2016-04-03', 'day first in Spanish');
  assert.match(q2, /Cuánto te pagan/);
  const q3 = (await say('$600 cada dos semanas'))!;
  const rec2 = FamilyRecord.fromJSON(state.pathway!.record);
  assert.equal(rec2.get('income.0.amount')?.value, 600);
  assert.equal(rec2.get('income.0.frequency')?.value, 'biweekly');
  assert.match(q3, /personal, así que comparte solo lo que quieras/);
  assert.match(q3, /cuidado de crianza/);
  assert.match(q3, /reciben comidas gratis automáticamente/);
  const p = (await say('no'))!;
  assert.match(p, /Child first name: Ana/);
  assert.match(p, /Income 0 how often: biweekly/);
  await say('dale');
  assert.equal(lane.calls.length, 1);
});

test('declining a required sensitive fact offers a person, never a guess', async () => {
  const { engine, state, say } = setup({ pathway: childPathway, hints: CHILD_HINTS });
  await engine.start('conv-1', state, 'fake.child');
  await say('Ana Lopez, born March 3, 2016');
  await say('2,100 a month');
  const r = (await say("I'd rather not say"))!;
  assert.match(r, /has to be on the form/);
  assert.equal(state.pathway!.stage, 'handoff_offered');
  assert.ok(!FamilyRecord.fromJSON(state.pathway!.record).has('household.foster'));
});

// ── the extractor on its own ─────────────────────────────────────────────────

const slot = (key: string, kind: FactSpec['kind'], extra: Partial<FactSpec> = {}): Slot => ({
  key,
  spec: { key, kind, required: true, sources: ['parent'], ask: { en: '', es: '' }, ...extra },
});

test('dates in English and Spanish', () => {
  assert.equal(parseDates('born march 3, 2016', 'en')[0]?.value, '2016-03-03');
  assert.equal(parseDates('3/4/2016', 'en')[0]?.value, '2016-03-04');
  assert.equal(parseDates('3/4/2016', 'es')[0]?.value, '2016-04-03');
  assert.equal(parseDates('14/3/2016', 'en')[0]?.value, '2016-03-14', 'a part over 12 is the day');
  assert.equal(parseDates('3 de marzo de 2016', 'es')[0]?.value, '2016-03-03');
  assert.equal(parseDates('2016-03-03', 'en')[0]?.value, '2016-03-03');
  assert.equal(parseDates('2/30/2016', 'en').length, 0, 'no such day');
});

test('money and how often', () => {
  assert.deepEqual(parseMoney('2,100 a month')[0]?.value, { amount: 2100, frequency: 'monthly' });
  assert.deepEqual(parseMoney('$600 cada dos semanas')[0]?.value, { amount: 600, frequency: 'biweekly' });
  assert.deepEqual(parseMoney('i make 500 every week')[0]?.value, { amount: 500, frequency: 'weekly' });
  assert.deepEqual(parseMoney('ganamos 1.800 al mes')[0]?.value, { amount: 1800, frequency: 'monthly' });
  assert.deepEqual(parseMoney('$30k a year')[0]?.value, { amount: 30000, frequency: 'annual' });
  assert.equal(parseMoney('$15 an hour')[0]?.value.frequency, 'hourly');
  assert.equal(parseMoney('quincenal $800')[0]?.value.frequency, 'ambiguous');
  assert.equal(parseMoney('we have 3 kids').length, 0, 'a number is not money without a cue');
  assert.ok(saysNoIncome('no tenemos ingresos'));
  assert.ok(saysNoIncome('nobody works right now'));
});

test('names, grades and plain words', () => {
  assert.equal(parseName('her name is Ana María López', false), 'Ana María López');
  assert.equal(parseName('se llama luis', false), 'Luis');
  assert.equal(parseName('Ana Lopez', true), 'Ana Lopez');
  assert.equal(parseName('she likes math', true), undefined);
  assert.equal(parseName('María de la Cruz', true), 'María de la Cruz');
  assert.equal(parseGrade('3rd grade'), '3');
  assert.equal(parseGrade('tercer grado'), '3');
  assert.equal(parseGrade('kinder'), 'K');
  assert.equal(parseGrade('tk'), 'TK');
  assert.equal(parseGrade('4', true), '4');
});

test('the extractor never sets what the parent did not say', () => {
  const slots = [slot('household.size', 'number'), slot('household.calfresh', 'boolean'), slot('member.m1.first_name', 'string'), slot('parent.email', 'string'), slot('parent.phone', 'string')];
  const ctx = (asked: string[]) => ({ lang: 'en' as const, slots, asked, recent: [] });
  assert.deepEqual(extractFacts("I'm not sure", ctx(['household.size'])).facts, []);
  assert.ok(extractFacts("I'm not sure", ctx(['household.size'])).dontKnow);
  assert.deepEqual(extractFacts('she likes math', ctx(['member.m1.first_name'])).facts, []);
  assert.deepEqual(extractFacts('yes', ctx(['household.size'])).facts, [], 'a yes is not a number');
  assert.deepEqual(extractFacts('what do you mean?', ctx(['household.calfresh'])).facts, []);
  const two = extractFacts('you can email me at ana@example.com, my cell is (831) 555-0100', ctx([])).facts;
  assert.deepEqual(two.map((f) => [f.key, f.value]), [['parent.email', 'ana@example.com'], ['parent.phone', '831-555-0100']]);
  // A model's fact counts only with a quote that is really in the message.
  const model = acceptModelFacts('we are four', [{ key: 'household.size', value: 4, quote: 'we are four' }, { key: 'household.calfresh', value: true, quote: 'we get calfresh' }], slots);
  assert.deepEqual(model.map((f) => f.key), ['household.size']);
});

// ── through the agent ────────────────────────────────────────────────────────

test('through Agent.handle: the hook gives the engine the turn, and the yes runs the lane', async () => {
  const { Agent } = await import('../src/agent/agent.js');
  const { RulesIntentEngine } = await import('../src/agent/intent/rules.js');
  const { MockCalendarProvider } = await import('../src/integrations/calendar.js');
  const { MockMealsProvider } = await import('../src/integrations/meals.js');
  const { MockSis } = await import('../src/integrations/sis.js');
  const { createSeedDb, provisionFamily } = await import('../src/seed.js');
  const db = createSeedDb();
  db.parents.push({ id: 'parent-maya', phone: '15555550100', email: '', firstName: 'Maya', lastName: 'Lee', studentIds: [] });
  provisionFamily(db, 'parent-maya', { children: [{ name: 'Emma', grade: '3rd' }], school: 'Soquel Elementary School', district: 'Soquel Union Elementary School District', schoolType: 'public', needs: [], challenges: [] });
  const registry = new PathwayRegistry().registerPathway(mealsPathway(), MEALS_HINTS);
  const lane = new FakeLane();
  registry.registerLane(lane);
  const consent: Array<Record<string, unknown>> = [];
  const agent = new Agent({
    intentEngine: new RulesIntentEngine(),
    sis: new MockSis(db),
    calendar: new MockCalendarProvider(),
    meals: new MockMealsProvider({}),
    db,
    defaultParentId: 'parent-maya',
    requireVerification: false,
    email: { send: async () => ({ id: 'mock' }) } as never,
    pathwayEngine: makeEngine({ registry, consent }),
  });
  const first = await agent.startPathway('agent-conv', 'fake.meals');
  assert.match(first.text, /CalFresh/);
  assert.match((await agent.handle('agent-conv', 'no')).text, /How many people/);
  assert.match((await agent.handle('agent-conv', '4')).text, /make in a month/);
  const p = await agent.handle('agent-conv', '2100 a month');
  assert.match(p.text, /Monthly income: \$2,100/);
  assert.equal(agent.getStateForTest('agent-conv')?.pendingSteps, undefined, 'the existing gate holds nothing for it');
  const done = await agent.handle('agent-conv', 'yes');
  assert.match(done.text, /^Done\./);
  assert.equal(lane.calls.length, 1);
  assert.equal(agent.getStateForTest('agent-conv')?.pathway?.outcome, 'done_confirmed');
});
