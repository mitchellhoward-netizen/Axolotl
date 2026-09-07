import 'dotenv/config';
import assert from 'node:assert/strict';
import {
  browserOpen,
  browserWait,
  browserClickControl,
  browserFill,
  browserClose,
} from '../src/integrations/browser.js';
import { StepExecutor, ConsentRequiredError } from '../src/agent/steps/executor.js';
import { SubmitAdapter } from '../src/agent/steps/adapters/submit.js';
import type { ChannelAdapter } from '../src/agent/steps/adapter.js';
import type { Step, ExecutionContext, Channel } from '../src/agent/steps/types.js';

/**
 * Prove the consent-gated submit loop through the STEP system (what the brain
 * drives, not a raw browserSubmit): fill → propose submit → consent gate throws
 * before YES → parent YES → SubmitAdapter submits → response link returned.
 */

const URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfRnWKflaGL76N0UG9r222aktVFaiB0bLQejxv0MYlSvNw6xQ/viewform';

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';

  // 1. Fill (as the brain's browser tools would).
  await browserOpen(URL);
  await browserWait(9000);
  await browserClickControl("Yes, I'll be there", 'radio');
  await browserClickControl('Friend', 'radio');
  await browserFill([
    { label: 'What are the names of people attending?', value: 'Jane Parent' },
    { label: 'Comments and/or questions', value: 'Looking forward to it!' },
  ]);
  await browserWait(1500);

  // 2. The step the submit_form tool proposes.
  const step: Step = {
    id: 'submit-1',
    caseId: 'form',
    intent: 'submit_form',
    channel: 'submit',
    counterparty: { role: 'OTHER' },
    payload: { channel: 'submit', url: URL },
    successCondition: { describe: 'Form submitted', kind: 'reference_received' },
    requiresConsent: true,
    status: 'awaiting_consent',
  };

  const executor = new StepExecutor({ submit: new SubmitAdapter() } as unknown as Record<Channel, ChannelAdapter>);
  const ctx: ExecutionContext = {
    mode: 'demo',
    demoClockScale: 1440,
    resolveCounterparty: (r) => ({ role: r }),
    logAction: async () => 'a1',
    scheduleFollowUp: async () => {},
    messageParent: async () => {},
  };

  // 3. Consent gate throws before the parent says YES.
  await assert.rejects(() => executor.run(step, ctx), ConsentRequiredError);
  console.log('✓ consent gate: submit throws before parent YES');

  // 4. Parent says YES → the SAME step runs through the executor → submits.
  const result = await executor.run({ ...step, status: 'executing' }, ctx);
  console.log('✓ submit executed:', result.status);
  assert.strictEqual(result.status, 'done', `expected done, got ${result.status}`);
  assert.match(result.parentSummary, /response/i, 'parentSummary should mention the response link');
  console.log('  summary:', result.parentSummary.replace(/\n/g, ' ').slice(0, 160));

  console.log('\nSubmit loop (fill → propose → consent → YES → submit → response link): PASS');
  await browserClose();
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
