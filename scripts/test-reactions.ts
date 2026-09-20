#!/usr/bin/env tsx
/**
 * Reaction policy: sparing, contextual, and never on a hard message.
 *   npm run test:reactions
 */
import { pickReaction, allowReaction, reactionFor, resetReactionsForTest } from '../src/agent/reactions.js';

let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

console.log('# reacts when the emoji adds something the words do not');
check('thanks -> ❤️', pickReaction({ text: 'thank you so much!' }) === '❤️');
check('good news -> 🎉', pickReaction({ text: 'we got in! she was accepted' }) === '🎉');
check('parent did their bit -> ✅', pickReaction({ text: 'I signed it and sent it back' }) === '✅');
check('asking us to act with the school -> 🎒', pickReaction({ text: 'can you email the school about his teacher?' }) === '🎒');
check('transport -> 🚌', pickReaction({ text: 'is there a bus route for him?' }) === '🚌');
check('meals -> 🍎', pickReaction({ text: 'what do I do about his lunch account?' }) === '🍎');
check('paperwork -> 🧾', pickReaction({ text: 'there is a permission slip due friday' }) === '🧾');
check('reading -> 📚', pickReaction({ text: 'she needs two books for the reading log' }) === '📚');

console.log('\n# the default is SILENCE (this is what the old version got wrong)');
check('a plain logistics question gets no reaction', pickReaction({ text: 'what time does school start?' }) === null);
check('an unrelated message gets no reaction', pickReaction({ text: 'hello' }) === null);
check('nothing is picked at random for unknown text', pickReaction({ text: 'hmm' }) === null && pickReaction({ text: 'ok so what now' }) === null);
check('empty gets no reaction', pickReaction({ text: '   ' }) === null);

console.log('\n# never on a hard message');
for (const t of [
  'the school wants to evaluate him for an IEP',
  'she has a 504 plan and needs accommodations',
  'he was diagnosed with asthma last week',
  'we are staying in a shelter right now',
  'he needs free lunch because we cannot afford food',
  'there is a custody hearing next week',
  'he is being bullied on the bus',
  'she has been really anxious and depressed',
  'the school had a lockdown today',
]) {
  check(`no emoji on: "${t.slice(0, 42)}…"`, pickReaction({ text: t }) === null, String(pickReaction({ text: t })));
}

console.log('\n# never on a bare approval or decline, and never beside a consent gate');
check('"yes" gets no reaction', pickReaction({ text: 'yes' }) === null);
check('"sounds good" gets no reaction', pickReaction({ text: 'sounds good' }) === null);
check('"no thanks" gets no reaction', pickReaction({ text: 'no thanks' }) === null);
check('a staged consent gate suppresses the reaction', pickReaction({ text: 'the permission slip is signed, thank you', stagedConsent: true }) === null);

console.log('\n# sparing: one per window, never the same twice in a row');
{
  resetReactionsForTest();
  const t0 = 1_800_000_000_000;
  check('first is allowed', allowReaction('c1', '❤️', t0) === true);
  check('second inside the window is refused', allowReaction('c1', '🎉', t0 + 60_000) === false);
  check('...and another conversation is unaffected', allowReaction('c2', '🎉', t0 + 60_000) === true);
  check('after the window, allowed again', allowReaction('c1', '🎉', t0 + 21 * 60_000) === true);
  check('but never the SAME emoji twice in a row', allowReaction('c1', '🎉', t0 + 42 * 60_000) === false);
  check('a different one is fine', allowReaction('c1', '🎒', t0 + 42 * 60_000) === true);
}
{
  resetReactionsForTest();
  const t0 = 1_800_000_000_000;
  check('reactionFor is silence when the picker says silence', reactionFor('c3', { text: 'what time is it?' }, t0) === null);
  // Note: a bare "thanks!" earns NOTHING by design (the receipt covers it) — so this uses a
  // gratitude phrase with substance, which is what actually picks an emoji.
  check('reactionFor reacts once, then stays quiet', reactionFor('c3', { text: 'thank you so much for sorting the permission slip' }, t0) === '❤️' && reactionFor('c3', { text: 'thanks again for the permission slip' }, t0 + 1000) === null);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
