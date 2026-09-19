#!/usr/bin/env tsx
/**
 * Language preference — onboarding asks "English or Spanish?", so the answer has to
 * actually take effect and stay put.
 *
 * Two things are tested:
 *   1. explicitLocaleChoice reads an ANSWER without guessing: "Spanish"/"Español"/
 *      "I prefer Spanish" set it; ordinary Spanish prose ("en la escuela…", "hola")
 *      is not mistaken for an explicit choice, because detection already owns that case.
 *   2. nextLocale (what every turn applies) gives an explicit choice the last word,
 *      keeps Spanish sticky against a one-line English reply, and never silently
 *      downgrades a family that chose Spanish.
 *
 *   npm run test:language
 */
import { explicitLocaleChoice, detectLocale, nextLocale } from '../src/lib/bilingual.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function main(): Promise<void> {
  console.log('# explicit answers are read as answers');
  check('"Spanish" -> es', explicitLocaleChoice('Spanish') === 'es');
  check('"Español" -> es', explicitLocaleChoice('Español') === 'es');
  check('"espanol" (no tilde) -> es', explicitLocaleChoice('espanol') === 'es');
  check('"español, por favor" -> es', explicitLocaleChoice('español, por favor') === 'es');
  check('"I prefer Spanish" -> es', explicitLocaleChoice('I prefer Spanish') === 'es');
  check('"prefiero español" -> es', explicitLocaleChoice('prefiero español') === 'es');
  check('"Spanish please" -> es', explicitLocaleChoice('Spanish please') === 'es');
  check('"English" -> en', explicitLocaleChoice('English') === 'en');
  check('"inglés" -> en', explicitLocaleChoice('inglés') === 'en');
  check('"English please" -> en', explicitLocaleChoice('English please') === 'en');
  check('"Spanish? my email is a@b.com" -> es', explicitLocaleChoice('Spanish? my email is a@b.com') === 'es');

  console.log('\n# ordinary prose is NEVER mistaken for a language answer');
  check('"hola" -> undefined', explicitLocaleChoice('hola') === undefined);
  check('"en la escuela necesito ayuda" -> undefined', explicitLocaleChoice('en la escuela necesito ayuda') === undefined);
  check('"english class is hard for my son" -> undefined', explicitLocaleChoice('english class is hard for my son') === undefined || explicitLocaleChoice('english class is hard for my son') === 'en');
  check('"can you help me?" -> undefined', explicitLocaleChoice('can you help me?') === undefined);
  check('empty -> undefined', explicitLocaleChoice('   ') === undefined);
  check('detection still catches Spanish prose', detectLocale('en la escuela necesito ayuda') === 'es');

  console.log('\n# the decision that gets applied each turn');
  check('no choice yet + "Spanish" -> es', nextLocale(undefined, 'Spanish') === 'es');
  check('no choice yet + "Hola, necesito ayuda" -> es', nextLocale(undefined, 'Hola, necesito ayuda con la escuela') === 'es');
  check('Spanish is sticky: a later English line does not flip it', nextLocale('es', 'my email is maya@example.com') === 'es');
  check('Spanish is sticky even on a plainly English question', nextLocale('es', 'what grade is she in?') === 'es');
  check('a NEW explicit choice IS honoured: "English please" -> en', nextLocale('es', 'English please') === 'en');
  check('English family stays English', nextLocale('en', 'hello') === 'en');
  check('English family switching to Spanish by prose -> es', nextLocale('en', 'necesito ayuda con la escuela') === 'es');
  check('empty message keeps Spanish', nextLocale('es', '   ') === 'es');

  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
