#!/usr/bin/env tsx
/**
 * Benny demo — print the interactive conversation the live iMessage director produces.
 * The opening run is the whole point: the school's inbox read → the one requirement that
 * needs a parent → in-network booking → an FSA filing → the completed forms returned to
 * the school. Then it keeps going, because the same loop covers the rest of the plan.
 * Drives the REAL director (same code as the deployed agent) with a scripted run, so the
 * console preview and iMessage can't drift.
 *
 *   npm run demo:benny
 */
import { BennyDemo } from '../src/demo/director.js';

const out: Array<{ from: 'Benny' | '        You'; text: string }> = [];
const demo = new BennyDemo(
  async (t) => { out.push({ from: 'Benny', text: t }); },
  undefined, // keyword router for a deterministic print
  { nudgeMs: 0, followUpMs: 0, bubbleDelayMs: 0, idleEndMs: 0 },
);
const say = async (t: string) => { out.push({ from: '        You', text: t }); await demo.onMessage(t); };

await demo.start();
for (const m of [
  'yes',                                                   // book both school-required visits in-network
  'yes',                                                   // file the dental with the plan + return the forms
  'am I using my benefits correctly? anything I haven’t used up?',
  'yes',                                                   // file the FSA
  'yes',                                                   // confirm the claim
  'buy Love in the Time of Cholera by Gabriel Garcia Marquez',
  'yes',                                                   // buy it + file with Ramp
  'can you also tell the school Leo’s out Tuesday?',
  'SEND',                                                  // send the note
  'what’s left?',                                          // status
]) await say(m);
await new Promise((r) => setTimeout(r, 26_500));           // let the FSA claim settle
await say('did my claim get paid?');                       // on-demand follow-through

console.log('\n════════════════════════  Benny · iMessage  ════════════════════════════\n');
for (const m of out) console.log(`${m.from}\n${m.text}\n`);
console.log('════════════════════════════════════════════════════════════════════════\n');
console.log('fictional demo — no real accounts, providers, or money');
process.exit(0);
