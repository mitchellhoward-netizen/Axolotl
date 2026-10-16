/**
 * The understanding layer (src/pathways/understand.ts) and how the engine uses it: the guards
 * (a quote must be in the message, a value must be in its message), the fallbacks (a model that
 * fails or is slow reads nothing), and the rules the model can't bend (a yes runs only as a
 * plain yes, through the digest; a fact it reads still goes through the engine's rules). The
 * model is a scripted double here: no keys, no network. Run: npx tsx --test scripts/test-understand.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FamilyRecord } from '../src/family/facts.js';
import type { ArchiveClient } from '../src/archive/client.js';
import { PathwayEngine, type PathwaySession } from '../src/pathways/engine.js';
import { PathwayRegistry } from '../src/pathways/registry.js';
import { grounded, modelUnderstander, parseUnderstanding, quoted, type Understander, type UnderstandInput, type Understanding } from '../src/pathways/understand.js';
import type { FormFill, FormMap, LaneResult, LaneRunner } from '../src/pathways/types.js';

delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
const ENV = { JEV_ENABLED: 'false' } as NodeJS.ProcessEnv;

const input = (message: string, extra: Partial<UnderstandInput> = {}): UnderstandInput => ({
  message,
  lang: 'en',
  stage: 'asking',
  asked: [],
  people: [{ id: 'p', relationship: 'self' }],
  specs: [],
  ...extra,
});

// ── the guards ───────────────────────────────────────────────────────────────

test('a quote must be a verbatim span of the message (case and spacing aside)', () => {
  assert.ok(quoted('I make $1100 every two weeks', 'i make  $1100'));
  assert.ok(!quoted('I make $1100 every two weeks', 'I make $1,100'));
  assert.ok(!quoted('no', 'nobody has income'));
});

test('a value must be in the message: names, amounts, emails, phones', () => {
  assert.ok(grounded('harpreet nguyen', 'first_name', 'Harpreet'));
  assert.ok(!grounded('yes', 'first_name', 'Ricardo'));
  assert.ok(grounded('I make $1,100 every two weeks', 'amount', 1100));
  assert.ok(!grounded('I make about a thousand', 'amount', 1000));
  assert.ok(grounded('(831) 555-0190', 'contact.phone', '831-555-0190'));
  assert.ok(grounded('4207 fictional court, watsonville', 'contact.street', '4207 Fictional Ct'));
  assert.ok(!grounded('4207 fictional ct', 'contact.street', '4270 Fictional Ct'));
  assert.ok(grounded('Reyes. Same as mine', 'last_name', 'Reyes'));
  assert.ok(grounded('same as mine', 'last_name', 'Reyes', [{ id: 'p', last: 'Reyes' }]), 'pointing at a known last name');
  assert.ok(!grounded('same as mine', 'last_name', 'Lopez', [{ id: 'p', last: 'Reyes' }]));
});

test('parse: items are strict (quote, amount), fields lenient (an unknown word is left out)', () => {
  const msg = 'I make $1100 every two weeks, and my husband Ricardo makes $2200. ricardo garcia 43';
  const u = parseUnderstanding(
    {
      intent: 'answer',
      people: [
        { ref: 'new1', first_name: 'Ricardo', last_name: 'Garcia', age: '43', quote: 'ricardo garcia 43' },
        { ref: 'new2', first_name: 'Invented', quote: 'not in the message' },
      ],
      incomes: [
        { owner: 'p', amount: 1100, frequency: 'bi-weekly', kind: 'wages', quote: 'I make $1100 every two weeks' },
        { owner: 'q', amount: 2200, frequency: 'monthly', kind: 'salary', quote: 'my husband Ricardo makes $2200' },
        { owner: 'q', amount: 9999, quote: 'my husband Ricardo makes $2200' },
      ],
    },
    input(msg),
  )!;
  assert.equal(u.people.length, 1, 'the invented quote is dropped');
  assert.deepEqual([u.people[0]!.first_name, u.people[0]!.last_name, u.people[0]!.age, u.people[0]!.relationship], ['Ricardo', 'Garcia', 43, undefined]);
  assert.equal(u.incomes.length, 2, 'an amount the message never says is dropped');
  assert.deepEqual([u.incomes[0]!.frequency, u.incomes[0]!.kind], ['biweekly', 'earned']);
  // "monthly" was never said (the message's only frequency is every two weeks): unknown, so
  // the engine asks.
  assert.equal(u.incomes[1]!.frequency, undefined, 'a frequency the words do not say');
  const u2 = parseUnderstanding({ intent: 'answer', incomes: [{ owner: 'p', amount: 1800, frequency: 'monthly', quote: 'like 1800' }] }, input('like 1800'))!;
  assert.equal(u2.incomes[0]!.frequency, undefined, 'no frequency word in the message, no frequency');
  assert.equal(parseUnderstanding({ nonsense: true }, input('hi')), undefined);
  assert.equal(parseUnderstanding({ intent: 'answer', people: [{ ref: 'p', first_name: 'Harpreet', last_name: 'Nguyen', quote: 'harpreet nguyen' }] }, input('harpreet nguyen'))!.people.length, 1, 'a person with no relationship or age is kept');
});

test('a model that fails, returns junk or is slow gives undefined (never a guess)', async () => {
  const fails = modelUnderstander({ complete: async () => null });
  assert.equal(await fails.understand(input('hi')), undefined);
  const junk = modelUnderstander({ complete: async () => 'I think the parent means yes!' });
  assert.equal(await junk.understand(input('yes')), undefined);
  const slow = modelUnderstander({ timeoutMs: 20, complete: () => new Promise((r) => setTimeout(() => r('{"intent":"approve"}'), 500)) });
  assert.equal(await slow.understand(input('yes')), undefined);
  const fenced = modelUnderstander({ complete: async () => '```json\n{"intent": "approve"}\n```' });
  assert.equal((await fenced.understand(input('yes')))?.intent, 'approve');
});

test('only the minimal context reaches the model', async () => {
  let seen = '';
  const spy = modelUnderstander({ complete: async (system, user) => ((seen = system + user), '{"intent":"answer"}') });
  const { engine, state, say } = await launch(spy);
  void engine;
  await say('hi can you help with the school lunch form');
  await say('no we dont get any of that');
  assert.match(seen, /no we dont get any of that/);
  for (const secret of ['2016-02-25', '5738907', 'Katherine Finchy']) assert.ok(!seen.includes(secret), `not sent: ${secret}`);
  assert.ok(state.pathway);
});

// ── the engine with a model ──────────────────────────────────────────────────

class FakeLane implements LaneRunner {
  kind = 'direct' as const;
  calls: FormFill[] = [];
  async run(_form: FormMap, fill: FormFill, ctx: { lang: 'en' | 'es'; attest: (fields: string[]) => Promise<void> }): Promise<LaneResult> {
    this.calls.push(JSON.parse(JSON.stringify(fill)));
    await ctx.attest(['certify']);
    return { status: 'done', reference: 'ABC123', readBack: { ...fill.values }, parentSummary: { en: 'Filed.', es: 'Enviado.' } };
  }
}

/** A model double: each message → the reading we script for it (or "answer" with nothing). */
function scripted(map: Record<string, Partial<Understanding> | ((i: UnderstandInput) => Partial<Understanding>)>): Understander & { inputs: UnderstandInput[] } {
  const inputs: UnderstandInput[] = [];
  return {
    inputs,
    async understand(i) {
      inputs.push(i);
      const e = map[i.message];
      const r = typeof e === 'function' ? e(i) : e ?? {};
      // Through the real guards, as production does.
      return parseUnderstanding({ intent: 'answer', ...r, no_income: (r as { noIncome?: unknown }).noIncome }, i);
    },
  };
}

async function launch(u?: Understander) {
  const { registerLaunchPathways } = await import('../src/pathways/index.js');
  const registry = registerLaunchPathways(new PathwayRegistry());
  const lane = new FakeLane();
  registry.registerLane(lane);
  const engine = new PathwayEngine({
    registry,
    env: ENV,
    understander: u,
    archive: () => ({ evaluate: async () => { throw new Error('no archive in this test'); } }) as unknown as ArchiveClient,
    now: () => new Date('2026-10-16T17:00:00Z'),
  });
  const seed = new FamilyRecord('ca');
  const sis = { kind: 'district' as const, ref: 'sis:c1' };
  seed.set('member.c1.student', true, sis);
  seed.set('member.c1.relationship', 'child', sis);
  seed.set('member.c1.first_name', 'Leonardo', sis);
  seed.set('member.c1.last_name', 'Villaseñor', sis);
  seed.set('member.c1.dob', '2016-02-25', sis);
  seed.set('member.c1.grade', '5', sis);
  seed.set('member.c1.school', 'Katherine Finchy Elementary School', sis);
  seed.set('member.c1.student_id', '5738907', sis);
  const state: { pathway?: PathwaySession; profile?: { locale?: 'en' | 'es' } } = {};
  await engine.start('conv-u', state, 'ca.psusd.linq', { seed, announce: false });
  const say = async (text: string) => (await engine.turn('conv-u', state, text))?.text;
  const rec = () => FamilyRecord.fromJSON(state.pathway!.record);
  return { engine, state, lane, say, rec };
}

const P = (ref: string, o: Record<string, unknown>) => ({ ref, ...o });

test('the household through the model: interjections are not names, "no income from him" is his, and a plain yes runs once', async () => {
  const u = scripted({
    "Oh right! I'm Araceli Villaseñor": { people: [P('p', { first_name: 'Araceli', last_name: 'Villaseñor', quote: "I'm Araceli Villaseñor" })] },
    'me (40), ricardo villaseñor 38, my husband, and leonardo 10': {
      people: [
        P('p', { relationship: 'self', age: 40, quote: 'me (40)' }),
        P('new1', { first_name: 'ricardo', last_name: 'villaseñor', relationship: 'spouse', age: 38, quote: 'ricardo villaseñor 38, my husband' }),
        P('c1', { age: 10, quote: 'leonardo 10' }),
      ],
    },
    'umm 3575 a month. ricardo dont work so no income from him': {
      incomes: [{ owner: 'p', amount: 3575, frequency: 'monthly', quote: 'umm 3575 a month' }],
      noIncome: [{ person: 'q', scope: 'none', quote: 'ricardo dont work so no income from him' }],
    } as Partial<Understanding>,
    'nope thats it': { noIncome: [{ person: 'p', scope: 'no_more', quote: 'nope thats it' }] } as Partial<Understanding>,
    'no nobody else': { facts: [{ key: 'household.incomes_complete', value: true, quote: 'no nobody else' }] },
    'Yeah that all looks right to me. send it': { intent: 'approve' },
  });
  const { say, rec, lane, state } = await launch(u);
  await say('hi can you help with the lunch income form');
  assert.match((await say("No, we don't get CalFresh or Medi-Cal."))!, /first and last name/);
  assert.match((await say("Oh right! I'm Araceli Villaseñor"))!, /Who lives in your home/);
  assert.equal(rec().get('member.p.first_name')?.value, 'Araceli');
  assert.match((await say('me (40), ricardo villaseñor 38, my husband, and leonardo 10'))!, /How much do you make/);
  assert.deepEqual(rec().get('household.roster')?.value, ['p', 'q', 'c1']);
  assert.equal(rec().get('member.q.first_name')?.value, 'ricardo');
  await say('umm 3575 a month. ricardo dont work so no income from him');
  assert.equal(rec().get('income.0.amount')?.value, 3575);
  assert.equal(rec().get('income.0.owner')?.value, 'p');
  assert.equal(rec().get('member.q.has_income')?.value, false, 'the no income is his');
  assert.notEqual(rec().get('household.income_reported')?.value, false, 'not the household\'s');
  await say('nope thats it');
  const proposal = (await say('no nobody else'))!;
  assert.match(proposal, /Here is everything the form will say/);
  assert.equal(lane.calls.length, 0);
  await say('Yeah that all looks right to me. send it');
  assert.equal(lane.calls.length, 1, 'a plain yes, read by the model, runs exactly what was shown');
  assert.equal(state.pathway!.stage, 'attesting');
});

test('the model can not approve past the rules: a value in the message, a correction, or a changed proposal', async () => {
  const u = scripted({
    'yes send it, my income is 3575': { intent: 'approve' },
    'looks good but the grade is wrong': { intent: 'approve' },
  });
  const { say, lane, state, rec } = await launch(u);
  void rec;
  await say('lunch income form please');
  await say('no');
  await say('Araceli Villaseñor');
  await say("It's me and my kid Leonardo Villaseñor (10).");
  await say('I make $3,575 a month.');
  await say("No, that's all.");
  const p = (await say('no'))!;
  assert.match(p, /Here is everything/);
  await say('yes send it, my income is 3575');
  assert.equal(lane.calls.length, 0, 'a value in the message is not a plain yes');
  await say('looks good but the grade is wrong');
  assert.equal(lane.calls.length, 0, '"wrong" is not a yes');
  assert.equal(state.pathway!.stage, 'proposed');
});

test('a model fact whose quote is not in the message is never recorded; a sensitive fact needs asking', async () => {
  const u = scripted({
    'no': { facts: [{ key: 'member.p.benefits', value: [], quote: 'no' }, { key: 'member.c1.homeless', value: true, quote: 'we are homeless' }] },
    'Araceli Villaseñor': { people: [P('p', { first_name: 'Araceli', last_name: 'Villaseñor', quote: 'Araceli Villaseñor' })], facts: [{ key: 'member.c1.migrant', value: true, quote: 'Araceli' }] },
  });
  const { say, rec } = await launch(u);
  await say('lunch income form please');
  await say('no');
  assert.deepEqual(rec().get('member.p.benefits')?.value, []);
  assert.equal(rec().has('member.c1.homeless'), false, 'quote not in the message');
  await say('Araceli Villaseñor');
  assert.equal(rec().has('member.c1.migrant'), false, 'a sensitive fact nobody asked, in words that do not name it');
});

test('a failed model falls back to the deterministic readers', async () => {
  const down: Understander = { understand: async () => undefined };
  const { say, rec } = await launch(down);
  await say('lunch income form please');
  await say("No, we don't get CalFresh or Medi-Cal.");
  await say("I'm Araceli M. Villaseñor.");
  assert.equal(rec().get('member.p.first_name')?.value, 'Araceli');
  assert.equal(rec().get('member.p.middle_initial')?.value, 'M');
});

test('the person offer: "ok sure whatever works" and "sí, conéctame" are yes; "no, it\'s Javier" is an answer', async () => {
  for (const yes of ['ok sure whatever works', 'sí, conéctame con alguien', 'Yeah, I just said yes lol. Go ahead and connect me with someone']) {
    const { say, state } = await launch();
    await say('lunch income form please');
    await say('blah');
    await say('blah blah');
    assert.equal(state.pathway!.stage, 'handoff_offered');
    assert.match((await say(yes))!, /pass this to a person|Le paso esto a una persona/, yes);
    assert.equal(state.pathway!.outcome, 'handoff');
  }
  const { say, state } = await launch(scripted({ "no, it's Araceli Villaseñor": { intent: 'decline', people: [P('p', { first_name: 'Araceli', last_name: 'Villaseñor', quote: 'Araceli Villaseñor' })] } }));
  await say('lunch income form please');
  await say('no');
  await say('123');
  await say('123 456');
  assert.equal(state.pathway!.stage, 'handoff_offered');
  const r = (await say("no, it's Araceli Villaseñor"))!;
  assert.match(r, /Who lives in your home/);
});

test('an answer to a name question never flips the language', async () => {
  const { say, state } = await launch();
  await say('hi can you help with the school lunch form');
  await say('no we dont get any of that');
  await say('juana reyes');
  await say('me, my husband efraín reyes 39 and julián 15');
  assert.equal(state.pathway!.lang, 'en');
});

test('a side message the old router cannot help with goes back to the form (agent level)', async () => {
  const { Agent } = await import('../src/agent/agent.js');
  const { RulesIntentEngine } = await import('../src/agent/intent/rules.js');
  const { MockCalendarProvider } = await import('../src/integrations/calendar.js');
  const { MockMealsProvider } = await import('../src/integrations/meals.js');
  const { MockSis } = await import('../src/integrations/sis.js');
  const { createSeedDb, provisionFamily } = await import('../src/seed.js');
  const { registerLaunchPathways } = await import('../src/pathways/index.js');
  const { pathways } = await import('../src/pathways/registry.js');
  registerLaunchPathways(pathways);
  const db = createSeedDb();
  db.parents.push({ id: 'parent-side', phone: '15555550111', email: '', firstName: 'Ana', lastName: 'Lee', studentIds: [] });
  provisionFamily(db, 'parent-side', { children: [{ name: 'Emma', grade: '3rd' }], school: 'Katherine Finchy Elementary School', district: 'Palm Springs Unified School District', schoolType: 'public', needs: [], challenges: [] });
  const agent = new Agent({
    intentEngine: new RulesIntentEngine(),
    sis: new MockSis(db),
    calendar: new MockCalendarProvider(),
    meals: new MockMealsProvider({}),
    db,
    defaultParentId: 'parent-side',
    requireVerification: false,
    email: { send: async () => ({ id: 'mock' }) } as never,
    pathwayUnderstander: null,
  });
  await agent.startPathway('side-conv', 'ca.psusd.linq', undefined, { announce: false });
  await agent.handle('side-conv', 'lunch income form please');
  const r = await agent.handle('side-conv', 'what is the weather on mars?');
  assert.doesNotMatch(r.text, /not sure I can help with that|What do you need\?/);
  assert.match(r.text, /CalFresh/);
});
