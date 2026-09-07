import 'dotenv/config';
import assert from 'node:assert/strict';
import { browserOpen, browserWait, browserFill, browserClickControl, browserReset, browserClose } from '../src/integrations/browser.js';
import { saveFormRecipe, getFormRecipe } from '../src/integrations/form-recipes.js';

const GFORM = 'https://docs.google.com/forms/d/e/1FAIpQLSfRnWKflaGL76N0UG9r222aktVFaiB0bLQejxv0MYlSvNw6xQ/viewform';

// This is the structure the agent would SAVE after its first successful fill.
const recipe = {
  url: GFORM,
  title: 'Patrick school test',
  fills: [
    { label: 'What are the names of people attending?' },
    { label: 'Comments and/or questions' },
  ],
  controls: [
    { label: "Yes, I'll be there", kind: 'radio' as const },
    { label: 'Friend', kind: 'radio' as const },
  ],
  selects: [],
};

async function main(): Promise<void> {
  process.env.BROWSER_BACKEND = 'stagehand';

  // 1. The agent fills once and saves the recipe (discovery).
  await saveFormRecipe(recipe);
  const got = await getFormRecipe(GFORM);
  assert.ok(got, 'recipe should be retrievable');
  console.log('recipe saved:', got.fills.length, 'fills,', got.controls.length, 'controls');

  // 2. Later: reset the browser (fresh session) and REPLAY the recipe with new values.
  await browserReset();
  await browserOpen(GFORM);
  await browserWait(9000);
  const values: Record<string, string> = {
    'What are the names of people attending?': 'Maya Parent',
    'Comments and/or questions': 'replay test',
  };
  // Replay the recipe structure (what the brain does after get_form_recipe).
  await browserFill(got.fills.map((f) => ({ label: f.label, value: values[f.label] ?? '' })).filter((f) => f.value));
  for (const c of got.controls) await browserClickControl(c.label, c.kind);
  await browserWait(1500);

  const check = await browserFill([
    { label: 'What are the names of people attending?', value: 'Maya Parent' },
    { label: 'Comments and/or questions', value: 'replay test' },
  ]);
  assert.ok(check.ok, `re-fill verify failed: ${check.reason ?? ''}`);
  console.log(`replay fill: verified=${check.data.verified}, filled=${check.data.filled}`);

  await browserClose();
  console.log('\nRecipe replay (learn once → fill forever): PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
