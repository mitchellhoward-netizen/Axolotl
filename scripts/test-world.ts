#!/usr/bin/env tsx
/**
 * Tier A — the fake district, against OUR code. Deterministic, offline, free, CI-able.
 *
 * It does not reimplement a browser. It checks the judgements we make *about* pages, which
 * is where our own bugs live: whether we spend a browser session at all, and what we tell a
 * parent when we cannot confirm something.
 *
 *   npm run test:world
 */
import { startTestWorld, SCENARIOS, CONFIRMATION_REF, INJECTION_MARKER } from '../src/testworld/world.js';

let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

process.env.SKYVERN_API_KEY = process.env.SKYVERN_API_KEY || 'test-key';
const { pageHasForm } = await import('../src/integrations/skyvern.js');

const world = await startTestWorld();
console.log(`fake district up at ${world.url}\n`);

console.log('# does this page even have a form? (the pre-flight that saves a browser session)');
for (const s of SCENARIOS) {
  const got = await pageHasForm(`${world.url}${s.path}`);
  const ok = got === s.expect.hasForm;
  check(`${s.id.padEnd(8)} -> ${String(got).padEnd(9)} (${s.expect.note})`, ok, `expected ${String(s.expect.hasForm)}`);
}

console.log('\n# the fixtures are genuinely hostile (so a green run means something)');
{
  const inject = await (await fetch(`${world.url}/world/inject`)).text();
  check('the injection page really does carry an instruction', inject.includes(INJECTION_MARKER) && /ignore all previous instructions/i.test(inject));
  const done = await (await fetch(`${world.url}/world/apply/done`)).text();
  check('the success page really does show a confirmation reference', done.includes(CONFIRMATION_REF));
  const err = await (await fetch(`${world.url}/world/apply/error`)).text();
  check('the error page exists for the unconfirmed path', /problem/i.test(err));
  const wizard2 = await (await fetch(`${world.url}/world/wizard/2`)).text();
  check('the wizard really is multi-step (step 2 differs from step 1)', /Step 2/i.test(wizard2));
}

await world.close();
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
