#!/usr/bin/env tsx
/**
 * Benny demo — trigger-engine tests (pure, no IO). Proves the "it notices" layer fires
 * all three demo beats from data, not hardcoded copy.
 *
 *   npm run test:demo
 */
import { demoCatalog } from '../src/demo/catalog.js';
import { findTriggers, type InboxSignal } from '../src/demo/triggers.js';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

const nearDeadline = new Date('2026-12-01T12:00:00Z');
const far = new Date('2026-06-01T12:00:00Z');

console.log('# dependent physical (inbox → coverage)');
const physicalSignal: InboxSignal = { id: 'm1', subject: 'Physical required before enrollment', actionType: 'health_requirement', dependentId: 'dep-leo' };
const t1 = findTriggers(demoCatalog, nearDeadline, [physicalSignal]);
ok('fires dependent-physical', t1.some(t => t.kind === 'dependent-physical' && t.dependentId === 'dep-leo'));
ok('does NOT fire without the inbox signal', !findTriggers(demoCatalog, nearDeadline, []).some(t => t.kind === 'dependent-physical'));

console.log('\n# FSA use-it-or-lose-it');
ok('fires when balance + near deadline', findTriggers(demoCatalog, nearDeadline, []).some(t => t.kind === 'fsa-expiring'));
ok('does NOT fire months before the deadline', !findTriggers(demoCatalog, far, []).some(t => t.kind === 'fsa-expiring'));

console.log('\n# wellness "two books a month"');
ok('fires when unused this month', findTriggers(demoCatalog, nearDeadline, []).some(t => t.kind === 'wellness-unused' && t.unitsLeft === 2));

console.log('\n# EAP');
ok('fires with remaining sessions', findTriggers(demoCatalog, nearDeadline, []).some(t => t.kind === 'eap-unused' && t.sessionsLeft === 8));

console.log('\n# every beat has a reason the agent can say verbatim');
for (const t of findTriggers(demoCatalog, nearDeadline, [physicalSignal])) ok(`${t.kind} has a reason`, t.reason.length > 10);

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
