#!/usr/bin/env tsx
/**
 * Recall: the bounded window, the family's own aliases, and the honesty rules about what was
 * actually searched.
 *
 *   npm run test:memory
 *
 * No database: the Supabase env vars are cleared BEFORE the modules load (dotenv does not
 * override already-set variables), so every persistence call here is a no-op and this test
 * can never write to a real family's data.
 *
 * The honesty checks are the point of the file. "I found nothing" must never be printed when
 * what actually happened was "I searched the last 40 messages" or "the older history was
 * unreachable" — that is the difference between a memory you can trust and one that quietly
 * forgets.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_ANON_KEY = '';
// Below the floor on purpose: HISTORY_WINDOW must clamp it up, so a typo in the env var can
// never shrink recall's reach to something useless.
process.env.HISTORY_WINDOW_MESSAGES = '10';

const { harvestAliases, expandQuery, matchesTerms, rankAliases } = await import('../src/agent/aliases.js');
const { recallHistory } = await import('../src/agent/recall.js');
const { InMemoryStore, HISTORY_WINDOW } = await import('../src/agent/memory.js');
const { saveAliases, listAliases } = await import('../src/integrations/memory-alias-store.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); }
};
const m = (role: 'user' | 'assistant', content: string) => ({ role, content });
const PASTA: Parameters<typeof rankAliases>[0] = [{ a: 'pasta', b: 'noodles', source: 'parent' }];

// A stand-in for the Postgres search: substring over rows, newest last, like the real one.
const searchOf = (rows: ReturnType<typeof m>[], opts: { truncated?: boolean } = {}) => {
  let calls = 0;
  const fn = async (needle: string) => {
    calls++;
    const hits = rows.filter((r) => r.content.toLowerCase().includes(needle.toLowerCase()));
    return { hits, totalMatches: hits.length, truncated: opts.truncated === true };
  };
  return { fn, calls: () => calls };
};

console.log('# the window is bounded, and says how much it is not holding');
check('a below-floor HISTORY_WINDOW_MESSAGES is clamped up, not obeyed', HISTORY_WINDOW === 40, `got ${HISTORY_WINDOW}`);
{
  const store = new InMemoryStore();
  store.ensure('c1', 'fam1'); // no Supabase -> persistence is a no-op
  for (let i = 0; i < 45; i++) store.appendHistory('c1', 'user', `message ${i}`);
  const w = store.historyWindow('c1');
  check('the in-memory window stops at the limit', w.loaded === HISTORY_WINDOW, `loaded ${w.loaded}`);
  check('the dropped messages are counted, not silently forgotten', w.trimmed === 5, `trimmed ${w.trimmed}`);
  check('the newest message is the one kept', store.getHistory('c1').at(-1)?.content === 'message 44');
  check('the oldest is the one dropped', store.getHistory('c1')[0]?.content === 'message 5');
  check('a rehydrate cannot re-inflate the window', (() => {
    store.setHistory('c1', Array.from({ length: 100 }, (_, i) => m('user', `m${i}`)));
    return store.historyWindow('c1').loaded === HISTORY_WINDOW;
  })());
}

console.log('\n# aliases come from the parent\'s words — never generated');
check('"X, also called Y" is read as an equivalence',
  JSON.stringify(harvestAliases('"pasta", also called noodles')) === JSON.stringify([{ a: 'pasta', b: 'noodles', source: 'parent' }]),
  JSON.stringify(harvestAliases('"pasta", also called noodles')));
check('"by X I mean Y" is read', harvestAliases('by noodles I mean the pasta place').length === 1);
check('"we call it X" needs a subject to attach to', harvestAliases('we call it the yellow card').length === 0);
check('"we call it X" attaches to the subject when we have one',
  harvestAliases('we call it the yellow card', 'bus pass')[0]?.b === 'bus pass');
check('every harvested alias is parent-sourced',
  harvestAliases('"pasta", also called noodles').every((p) => p.source === 'parent'));
check('an ordinary sentence invents nothing', harvestAliases('can you email his teacher about the reading log?').length === 0);
check('a sentence-long "alias" is rejected', harvestAliases('"the thing we talked about yesterday on the phone about buses", also called x').length === 0);

console.log('\n# a model-generated alias can never outrank the parent\'s');
{
  const ranked = rankAliases([{ a: 'pasta', b: 'macaroni', source: 'model' }, ...PASTA]);
  check('parent-sourced aliases sort first', ranked[0]?.b === 'noodles');
  check('the model alias still exists, just lower', ranked[1]?.b === 'macaroni');
  check('expansion prefers the parent\'s word', expandQuery('pasta', ranked)[1] === 'noodles', JSON.stringify(expandQuery('pasta', ranked)));
  check('expansion is capped', expandQuery('pasta', [...PASTA, { a: 'pasta', b: 'ziti', source: 'model' }, { a: 'pasta', b: 'penne', source: 'model' }, { a: 'pasta', b: 'rigatoni', source: 'model' }]).length <= 4);
  check('an unrelated query is not expanded', expandQuery('bus route', PASTA).length === 1);
}

console.log('\n# matching is case-insensitive substring, over the expanded terms');
check('case does not matter', matchesTerms('The Noodles Place', ['noodles']));
check('an empty term never matches everything', !matchesTerms('anything at all', ['']));
check('no terms, no match', !matchesTerms('anything at all', []));

console.log('\n# recall finds the family\'s own vocabulary');
{
  const window = [m('user', 'the noodles place called about pickup on friday'), m('assistant', 'noted')];
  const out = await recallHistory('pasta', { window, trimmed: 0, aliases: PASTA });
  check('a query in the parent\'s other word finds the message', out.includes('noodles place'), out);
  check('the expansion is disclosed so a wrong alias is visible', out.includes('Also searched: "noodles"'), out);
  check('a hit is attributed to whoever said it', out.includes('Parent:'), out);
}

console.log('\n# "nothing found" is never printed when the search was partial');
{
  const window = [m('user', 'hello')];
  const partial = await recallHistory('zzz', { window, trimmed: 120, aliases: [] });
  check('the window size that was searched is stated', partial.includes('the last 1 messages'), partial);
  check('the unsearched older messages are stated', partial.includes('120 older ones are not loaded'), partial);
  check('it does not claim to have searched the conversation', !partial.includes('whole conversation'), partial);
}
{
  const window = [m('user', 'sports physical form is due')];
  const full = await recallHistory('physical', { window, trimmed: 0, aliases: [] });
  check('a complete search does not add a caveat', !full.includes('not loaded') && !full.includes('couldn\'t reach'), full);
}

console.log('\n# an unreachable database degrades loudly, not silently');
{
  const window = [m('user', 'sports physical form is due')];
  const out = await recallHistory('zzz', {
    window,
    trimmed: 300,
    aliases: [],
    searchPersisted: async () => { throw new Error('network down'); },
  });
  check('the fallback is disclosed', out.includes("couldn't reach the older history"), out);
  check('it still answers from what it could read', out.includes('the last 1 messages'), out);
}
{
  const window = [m('user', 'the bus pass is at the office')];
  const out = await recallHistory('bus pass', {
    window, trimmed: 50, aliases: [],
    searchPersisted: async () => { throw new Error('network down'); },
  });
  check('a hit is still returned when the older history is unreachable', out.includes('bus pass'), out);
  check('the disclosure rides along with the hit', out.includes("couldn't reach"), out);
}

console.log('\n# when the database is searched, it searches the WHOLE conversation');
{
  const window = [m('user', 'hello')];
  const older = [m('user', 'the speech eval from october said she qualifies'), m('assistant', 'filed')];
  const s = searchOf([...older, ...window]);
  const out = await recallHistory('speech eval', { window, trimmed: 2, aliases: [], searchPersisted: s.fn });
  check('a message older than the window is found', out.includes('speech eval from october'), out);
  check('no "not loaded" caveat when the old history was searched', !out.includes('not loaded'), out);
  check('every expanded term was searched', s.calls() === 1, `calls ${s.calls()}`);
}
{
  const window = [m('user', 'the noodles place called')];
  const s = searchOf([...window, m('assistant', 'about pasta night')]);
  const out = await recallHistory('pasta', { window, trimmed: 10, aliases: PASTA, searchPersisted: s.fn });
  check('each expanded term is searched separately', s.calls() === 2, `calls ${s.calls()}`);
  check('both the window hit and the database hit come back', out.includes('noodles place') && out.includes('pasta night'), out);
}

console.log('\n# the overlapping window does not double the hits');
{
  const rows = [m('user', 'the noodles place called')];
  const s = searchOf(rows);
  const out = await recallHistory('noodles', { window: rows, trimmed: 5, aliases: [], searchPersisted: s.fn });
  check('a hit in both the window and the database is printed once',
    out.split('the noodles place called').length - 1 === 1, out);
  check('one hit is reported as one', out.includes('One match'), out);
}

console.log('\n# a capped result says it was capped');
{
  const rows = Array.from({ length: 9 }, (_, i) => m('user', `reading log ${i}`));
  const s = searchOf(rows, { truncated: true });
  const out = await recallHistory('reading log', { window: [], trimmed: 0, aliases: [], searchPersisted: s.fn, limit: 4 });
  check('only the limit is returned', out.split('reading log').length - 1 === 4, out);
  check('the cap is disclosed', out.includes('more matches'), out);
}
{
  const rows = Array.from({ length: 9 }, (_, i) => m('user', `reading log ${i}`));
  const out = await recallHistory('reading log', { window: rows, trimmed: 0, aliases: [], limit: 3 });
  check('the newest matches are the ones kept', out.includes('reading log 8') && !out.includes('reading log 0'), out);
  check('the header counts what is actually shown', out.includes('3 matches'), out);
}

console.log('\n# recall reads, and only reads');
{
  const src = read('src/agent/recall.ts');
  const writes = ['saveMessage', 'appendHistory', 'clearMessages', 'saveAliases', 'persistFamilyMemory', 'advance('];
  const found = writes.filter((w) => src.includes(w));
  check('the recall module imports no write path and no action path', found.length === 0, found.join(', '));
  const agent = read('src/agent/agent.ts');
  check('the recall tool is wired to the real thing', agent.includes('recallHistory(query') && agent.includes('searchPersisted:'));
  check('the recall tool reads the family\'s aliases', agent.includes('listAliases(parentId)'));
}
{
  const out = await recallHistory('   ', { window: [m('user', 'hi')], trimmed: 0, aliases: [] });
  check('an empty query asks for one instead of searching', out.includes('word or two'), out);
  const s = searchOf([m('user', 'hi')]);
  await recallHistory('', { window: [], trimmed: 0, aliases: [], searchPersisted: s.fn });
  check('an empty query issues no search at all', s.calls() === 0);
}
{
  const long = `physical form ${'x'.repeat(400)}`;
  const out = await recallHistory('physical form', { window: [m('user', long)], trimmed: 0, aliases: [] });
  check('a very long message is clipped with a visible marker', out.includes('…') && out.length < long.length, `${out.length} vs ${long.length}`);
}

console.log('\n# the table the code writes and deletes actually exists, with the right key');
{
  const sql = read('db/memory-alias.sql');
  check('the table is created', /create table if not exists memory_alias/i.test(sql));
  check('it is keyed by family, so deletion can reach it', /primary key \(family_id, alias, canonical\)/i.test(sql));
  check('every column the code writes exists in the DDL',
    ['family_id', 'alias', 'canonical', 'source'].every((c) => new RegExp(`\\b${c}\\b`, 'i').test(sql)));
  check('RLS is on', /enable row level security/i.test(sql));
  check('service_role only', /service_role/i.test(sql));
  // The live database did NOT have this table when the code shipped (PostgREST PGRST205), so
  // the two paths a human or a script actually runs must both carry it — otherwise the table
  // exists in the repo and nowhere else.
  check('the outstanding-SQL bundle the human pastes creates it', /create table if not exists memory_alias/i.test(read('db/APPLY-NOW.sql')));
  check('the apply script applies it', read('scripts/apply-new-tables.ts').includes("'memory-alias.sql'"));
}

console.log('\n# deletion covers the aliases');
{
  const identity = read('src/integrations/identity.ts');
  check('the full delete removes them', identity.includes("count('memory_alias', 'family_id'"));
  check('a fresh re-onboard removes them too', identity.includes("from('memory_alias').delete()"));
}

console.log('\n# without a database the alias store is a no-op, not a crash');
{
  let threw = false;
  try {
    await saveAliases('fam1', PASTA, 'parent');
    await saveAliases('', PASTA, 'parent');
    await saveAliases('fam1', [], 'parent');
    const list = await listAliases('fam1');
    check('listing with no database returns nothing rather than inventing', Array.isArray(list) && list.length === 0);
  } catch (e) { threw = true; check('no throw', false, (e as Error).message); }
  if (!threw) check('no throw', true);
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
