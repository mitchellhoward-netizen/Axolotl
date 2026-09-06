import 'dotenv/config';
import { browserAssessPage, browserOpen, browserFill, browserClose } from '../src/integrations/browser.js';

/**
 * End-to-end proof of the sign-up loop against the real CKC Soquel afterschool form:
 *   navigate → verify it's the right form (browser_assess) → fill text (browser_fill)
 *   → assert the fill is verified. NEVER submits.
 *
 * Run: npm run test:signup   (needs BROWSER_BACKEND=stagehand + BROWSERBASE_API_KEY)
 */
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd6KaS8fLGLY8T_QuRJkcYh2fmrwvfb0PJs67W2Ius9MbLTFQ/viewform';
const TARGET = 'afterschool soquel';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';

  // 1. Assess: confirm it's a real form for the right school.
  const assess = await browserAssessPage(FORM_URL, TARGET);
  assert(assess.ok, 'browser_assess failed');
  assert(assess.data.hasForm, `Expected a form, got 0 fields (${assess.data.problem ?? assess.data.signals.join(',')})`);
  assert(!assess.data.blank, 'Page is blank');
  console.log(`[signup] assess VERIFIED: "${assess.data.title}" (${assess.data.fieldCount} fields)`);

  // 2. Navigate + fill (deterministic), assert verified.
  await browserOpen(FORM_URL);
  await new Promise((r) => setTimeout(r, 7000));
  const fill = await browserFill([
    { label: 'Email', value: 'test@example.com' },
    { label: 'Child First Name', value: 'Maya' },
    { label: 'Child Last Name', value: 'Smith' },
    { label: 'Guardian First & Last Name', value: 'Jane Parent' },
    { label: 'Guardian Phone Number', value: '5551234567' },
  ]);
  assert(fill.ok, `browser_fill failed: ${!fill.ok ? fill.reason : ''}`);
  assert(fill.data.verified === true, `Fill not verified: filled ${fill.data.filled}/${5}; mismatches ${JSON.stringify(fill.data.mismatches)}`);
  console.log(`[signup] fill VERIFIED: ${fill.data.filled} fields`);

  console.log('[signup] PASS ✓ — navigate → verify → fill works end-to-end (no submit).');
  await browserClose();
}

main().catch((e) => {
  console.error('[signup] FAIL:', (e as Error)?.message ?? e);
  process.exit(1);
});
