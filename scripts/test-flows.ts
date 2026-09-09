/**
 * Step 2 guardrail: when conversational flows (McKinney-Vento / attendance) are
 * routed through the brain (BRAIN_FLOWS), the brain must receive a SITUATION FLAG
 * that (a) surfaces the displaced-family rights and (b) preserves the sensitive-
 * dimension carve-out — it must NEVER be prompted to ask for residency/proof-of-
 * residency. The old deterministic sub-machines remain the default (flag off).
 */
import { computeSituation } from '../src/agent/agent.js';
import { systemPrompt } from '../src/agent/tools.js';
import type { ConversationState } from '../src/agent/state.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${name}`);
  } else {
    fail++;
    console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  }
}

const casing = { step: 'student', studentIds: [] } as const;

function stateWith(challenges?: string[], mckinney?: boolean, attendance?: boolean): ConversationState {
  return {
    phase: 'clarifying',
    collected: {},
    profile: challenges ? { children: [{ name: 'Pat' }], school: 'Main St', challenges, needs: [], notes: '' } : undefined,
    mckinney: mckinney ? { step: 'student', studentIds: [] } : undefined,
    attendance: attendance ? { step: 'barrier', child: 'Pat' } : undefined,
  };
}

async function main() {
  // Displaced (housing challenge) → McKinney flag WITHOUT residency/docs probing.
  const displaced = computeSituation(stateWith(['we are staying in a shelter','my daughter needs help'], false));
  check('displaced challenge builds a situation flag', /McKinney-Vento/i.test(displaced ?? ''));
  check('carve-out: never ask where they live', /Do NOT ask where they live|proof-of-residency/i.test(displaced ?? ''));
  check('carve-out: offers transportation + immediate enrollment', /transportation and immediate enrollment/i.test(displaced ?? ''));

  // Active mckinney flow flag.
  const mck = computeSituation(stateWith(undefined, true));
  check('active mckinney flow builds the displaced flag', /McKinney-Vento/i.test(mck ?? ''));

  // Attendance flow flag.
  const att = computeSituation(stateWith(undefined, false, true));
  check('active attendance flow builds the attendance flag', /attendance\/barriers/i.test(att ?? ''));

  // No flow → no situation flag.
  const none = computeSituation(stateWith(['math support'], false));
  check('no flow => no situation flag', none === undefined);

  // The brain's system prompt actually renders the situation block.
  const sp = systemPrompt({ profile: { children: [{ name: 'Pat' }] }, situation: displaced });
  check('systemPrompt renders SITUATION FLAG', /SITUATION FLAG/.test(sp) && /proof-of-residency/.test(sp));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('flows test error:', (e as Error)?.message ?? e);
  process.exit(1);
});
