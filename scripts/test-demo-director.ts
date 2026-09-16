#!/usr/bin/env tsx
/**
 * Benny demo — interactive director test (no iMessage line, no LLM needed).
 *
 * Drives the real director with scripted user messages through the deterministic
 * keyword router, asserting the spine end-to-end — the school's requirement → in-network
 * booking → FSA filing → the completed form returned to the school — plus natural
 * steering (audit, FSA, books, EAP, absence, status, paid).
 *
 *   npm run test:demo-director
 */
import { BennyDemo } from '../src/demo/director.js';

const out: Array<{ from: 'you' | 'benny'; text: string }> = [];
const demo = new BennyDemo(
  async (t) => { out.push({ from: 'benny', text: t }); },
  undefined, // keyword router (deterministic)
  { nudgeMs: 0, followUpMs: 3000, bubbleDelayMs: 1, idleEndMs: 0 },
);

const say = async (text: string) => { out.push({ from: 'you', text }); await demo.onMessage(text); };
const benny = () => out.filter((m) => m.from === 'benny').map((m) => m.text);
const all = () => benny().join('\n');

await demo.start();

// drive the conversation
await say('yes');                                        // book both school-required visits
await say('yes');                                        // file the dental with the plan + return the forms
await say('am I using my benefits correctly? is there anything I haven’t used up?');
await say('yes');                                        // file the FSA
await say('yes');                                        // confirm the claim
await say('I’m burned out — can you find me a therapist?');
await say('yes');                                        // request the EAP session
await say('buy Love in the Time of Cholera by Gabriel Garcia Marquez');
await say('ship it to 456 Oak Ave, Santa Cruz, CA 95060');  // change the shipping address
await say('yes');                                        // buy it + file with Ramp
await say('can you also tell the school Leo’s out Tuesday?');
await say('SEND');                                       // send the note
await say('what’s left?');                               // status
await new Promise((r) => setTimeout(r, 26_500));         // let the claim settle
await say('did my claim get paid?');                     // on-demand follow-through
await say('stop');

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}`); } };
const text = all();

// ── the spine: school requirement → in-network care → plan filing → form returned ──
ok('opening reads the real school inbox', /8 messages from Soquel Elementary this week/i.test(text));
ok('triage cuts the inbox down to the one thing that needs a parent', /7 of them are FYI/i.test(text) && /The one that needs you: Kindergarten health requirements/i.test(text));
ok('the school requirement is matched against the plan (priced, in-network)', /Dr\. Camila Reyes/.test(text) && /Dr\. Elena Sato, DDS/.test(text) && /\$0 in-network as preventive care/i.test(text) && /\$85\.00 after your plan's rate/i.test(text));
ok('nothing is booked before the first approval', !/✅/.test(benny().slice(0, 2).join('\n')));
ok('both school-required visits booked in-network', /✅ Booked both, in-network/i.test(text) && /Physical — Dr\. Camila Reyes, Thu 3:40 PM/i.test(text) && /Dental exam — Dr\. Elena Sato, Fri 1:20 PM/i.test(text));
ok('the school trigger becomes a real plan filing', /Filed with your plan — \$85\.00 against your FSA/i.test(text));
ok('the completed forms go back to the school', /Sent Soquel Elementary both completed forms/i.test(text) && /SCH-/.test(text));
ok('the chain is the same loop, not a one-off script', /nothing left for you to chase/i.test(text));

// ── the rest of the loop: audit, FSA, EAP, books, absence, status ─────────────
ok('audit answers the natural question', /I checked your plan/i.test(text) && /FSA —/i.test(text) && /Books —/i.test(text) && /EAP —/i.test(text));
ok('audit prioritizes the FSA', /the one I'?d act on is the FSA/i.test(text));
ok('FSA filed', /Filed — .*FSA/i.test(text));
ok('EAP offers real in-network therapists + availability', /in-network therapists with evening openings/i.test(text) && /Dana Whitfield/.test(text) && /Tue 6:00 PM/.test(text));
ok('EAP actually requests the appointment', /✅ Requested — .*Dana Whitfield/i.test(text));
ok('book is found by name', /Love in the Time of Cholera/i.test(text));
ok('book returns a tappable listing link', /https:\/\/bookshop\.org\//i.test(text));
ok('names the funding source (stipend)', /stipend covers it/i.test(text));
ok('confirms the shipping address on file', /ship it to your address on file/i.test(text));
ok('accepts a changed shipping address', /shipping to 456 Oak Ave/i.test(text) && !/ship to ship it to/i.test(text));
ok('book is actually purchased', /✅ Ordered — .*Love in the Time of Cholera/i.test(text));
ok('reimbursement filed in Ramp', /Filed with Ramp/i.test(text));
ok('absence: pure-life note sent', /no benefit needed/i.test(text) && /Sent to the school/i.test(text));
ok('status summarizes', /Done so far:/i.test(text) || /Still open:/i.test(text));
ok('follow-through: claim shows PAID on demand', /glasses claim paid/i.test(text));
ok('books expense honestly still pending', /books submitted/i.test(text));
ok('stop ends the session', /Ending the demo/i.test(text));

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed (${benny().length} benny bubbles)`);
process.exit(fail === 0 ? 0 : 1);
