import assert from 'node:assert';
import { browserBackend, browserOpen } from '../src/integrations/browser.js';
import { BrowserAdapter } from '../src/agent/steps/adapters/browser.js';
import type { Step, ExecutionContext } from '../src/agent/steps/types.js';

// Force the "off" path deterministically — the real `.env` may enable the browser.
process.env.BROWSER_BACKEND = 'none';
delete process.env.BROWSERBASE_API_KEY;

let passed = 0;
let failed = 0;
function ok(name: string, fn: () => void | Promise<void>) {
  Promise.resolve(fn())
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((e) => {
      failed++;
      console.error(`  ✗ ${name}: ${(e as Error).message}`);
    });
}

console.log('browser layer (env-gated, no browser in sandbox)');

ok('browserBackend defaults to none', () => {
  assert.strictEqual(browserBackend(), 'none');
});

ok('browserOpen returns not-configured without BROWSER_BACKEND=stagehand', async () => {
  const r = await browserOpen('https://example.com');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'browser not configured');
});

ok('BrowserAdapter degrades gracefully when browser is off', async () => {
  const adapter = new BrowserAdapter();
  const step: Step = {
    id: 'b1', caseId: 'c1', intent: 'fill_form', channel: 'browser',
    counterparty: { role: 'OTHER' },
    payload: { channel: 'browser', url: 'https://example.com', fields: [{ label: 'name', value: 'Patrick' }] },
    successCondition: { describe: 'Filled', kind: 'manual' },
    requiresConsent: true, status: 'executing',
  };
  const ctx: ExecutionContext = {
    mode: 'demo', demoClockScale: 1440,
    resolveCounterparty: (r) => ({ role: r, name: 'Demo', email: 'd@example.com' }),
    logAction: async () => 'a',
    scheduleFollowUp: async () => {},
    messageParent: async () => {},
  };
  const res = await adapter.execute(step, ctx);
  assert.strictEqual(res.status, 'failed');
  assert.strictEqual(res.note, 'browser not configured');
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 20);
