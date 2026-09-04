import { planSteps } from './planner.js';
import { StepExecutor } from './executor.js';
import { buildAdapters } from './registry.js';
import { Scheduler } from '../scheduler.js';
import type { ExecutionContext } from './types.js';

/** Prove channel-agnosticism: request_mckinney_transport via BOTH call and email. */
async function main(): Promise<void> {
  const family = {
    parentName: 'Mitch Howard',
    children: [{ name: 'Patrick', grade: '1' }],
    school: 'Soquel Elementary School',
    district: 'Soquel Union Elementary School District',
    needs: ['transportation'],
    challenges: ['low income'],
    notes: 'Lives far; the bus route to the other home no longer serves.',
  };
  const counterparty = { role: 'HOMELESS_LIAISON' as const, name: 'Demo Liaison', email: 'demo-liaison@example.com', phone: '+15550001111' };

  const steps = planSteps({ intent: 'request_mckinney_transport', family, student: 'Patrick', counterparty });
  console.log('Planned steps:', steps.map((s) => s.channel).join(' + '));

  const executor = new StepExecutor(buildAdapters());
  const scheduler = new Scheduler();
  const actions: string[] = [];
  const ctx: ExecutionContext = {
    mode: 'demo',
    demoClockScale: 1440,
    resolveCounterparty: (r) => ({ role: r, name: 'Demo Liaison', email: 'demo-liaison@example.com', phone: '+15550001111' }),
    logAction: async (_c, a) => { actions.push(a.channel); return 'a' + actions.length; },
    scheduleFollowUp: async (c, at, verify, p) => scheduler.schedule(c, at, verify, p),
    messageParent: async (t) => console.log('  [parent]', t),
  };

  // Consent gate: executing a consequential step before consent must throw.
  try {
    await executor.run(steps[0]!, ctx);
    console.log('✗ consent gate did NOT throw');
  } catch (e) {
    console.log('✓ consent gate:', (e as Error).name);
  }

  // Parent says YES → each step moves to 'executing' and runs through the SAME executor.
  const results = [];
  for (const s of steps) results.push(await executor.run({ ...s, status: 'executing' }, ctx));
  console.log('Results:', results.map((r) => `${r.action.channel}=${r.status}`).join('  |  '));
  console.log('Actions logged:', actions.join(', '), '| follow-ups scheduled:', scheduler.pendingCount());

  // Unprompted follow-up + verify (demo clock): advance past the due time and fire.
  const later = new Date(Date.now() + 5 * 60 * 1000); // 5 "demo" minutes later
  await scheduler.run(later, async (t) => console.log('  [follow-up fired]', t));
  console.log('Remaining follow-ups after fire:', scheduler.pendingCount());
}

main().catch((e) => {
  console.error('demo-steps failed:', e);
  process.exit(1);
});
