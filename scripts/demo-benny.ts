#!/usr/bin/env tsx
/**
 * Benny demo — print the conversation that the live iMessage director sends.
 * Same script as the real thing (src/demo/script.ts); just renders it to the console.
 *
 *   npm run demo:benny
 */
import { startDemoServer } from '../src/demo/server.js';
import { buildDemoScript, resolveFollowThrough } from '../src/demo/script.js';
import type { ConnectorContext } from '../src/benefits/connectors.js';

const server = await startDemoServer();
const ctx: ConnectorContext = { owner: 'member-maya', credential: 'demo-credential', signal: new AbortController().signal };
const script = await buildDemoScript(ctx);

console.log('\n════════════════════════  Benny · iMessage  ════════════════════════════\n');
for (const turn of script.turns) {
  for (const line of turn.benny) console.log(`Benny\n${line}\n`);
  if (turn.reply) console.log(`        You\n${turn.reply}\n`);
}
console.log(`Benny\n${script.introFollowThrough}\n`);
const lines = await resolveFollowThrough(script.followThrough, ctx);
for (const line of lines) console.log(`Benny\n${line}\n`);
console.log(`Benny\n${script.summary}\n`);
console.log('════════════════════════════════════════════════════════════════════════\n');
console.log('fictional demo — no real accounts, providers, or money');

await server.close();
