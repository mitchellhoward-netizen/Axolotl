#!/usr/bin/env tsx
/**
 * Benny demo — director test (no iMessage line needed). Drives the live director with a
 * fake `send` and fast auto-advance, then asserts every beat landed as a bubble and the
 * claims flipped to "paid". This is the same code path the iMessage loop uses.
 *
 *   npm run test:demo-director
 */
import { BennyDemo } from '../src/demo/director.js';

const out: string[] = [];
const demo = new BennyDemo(async (t) => { out.push(t); }, 40, 2); // fast auto-advance
await demo.start();

const deadline = Date.now() + 15_000;
while (demo.active && Date.now() < deadline) await new Promise((r) => setTimeout(r, 40));

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}`); } };
const all = out.join('\n');

ok('sent more than a handful of bubbles', out.length >= 12);
ok('beat 1: physical coverage', /physical before enrollment/i.test(all) && /in-network/i.test(all));
ok('beat 1: booked the provider', /Dr\. Camila Reyes/i.test(all));
ok('beat 2: FSA use-it-or-lose-it', /use it or lose it/i.test(all) && /glasses/i.test(all));
ok('beat 3: books stipend', /books/i.test(all) && /haven't used any/i.test(all));
ok('beat 4: pure-life absence + SEND', /just life/i.test(all) && /SEND/i.test(all));
ok('approval codes were issued', /\bYES [0-9A-F]{6}\b/.test(all));
ok('follow-through: FSA claim paid', /vision claim paid/i.test(all));
ok('follow-through: books paid', /wellness-books claim paid/i.test(all));
ok('follow-through: appointment confirmed', /Appointment confirmed/i.test(all));
ok('closing two-maps line', /two maps/i.test(all));

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed (${out.length} bubbles)`);
process.exit(fail === 0 ? 0 : 1);
