import assert from 'node:assert/strict';
import { saveFormRecipe, getFormRecipe } from '../src/integrations/form-recipes.js';

async function main(): Promise<void> {
  const recipe = {
    url: 'https://example.com/form',
    title: 'Test form',
    fills: [{ label: 'First Name' }, { label: 'Last Name' }],
    controls: [{ label: 'Yes, I will attend', kind: 'radio' as const }, { label: 'Terms', kind: 'checkbox' as const }],
    selects: [{ name: 'data[family]', option: 'Biological/Adoptive' }],
    notes: 'fill first, then check terms, then submit',
  };
  await saveFormRecipe(recipe);

  const got = await getFormRecipe('https://example.com/form');
  assert.ok(got, 'recipe should be retrievable');
  assert.strictEqual(got.title, 'Test form');
  assert.strictEqual(got.fills.length, 2);
  assert.strictEqual(got.controls.length, 2);
  assert.strictEqual(got.controls[0]!.label, 'Yes, I will attend');
  assert.strictEqual(got.controls[0]!.kind, 'radio');
  assert.strictEqual(got.selects.length, 1);
  assert.strictEqual(got.selects[0]!.name, 'data[family]');
  assert.strictEqual(got.selects[0]!.option, 'Biological/Adoptive');
  assert.strictEqual(got.notes, 'fill first, then check terms, then submit');
  assert.strictEqual(await getFormRecipe('https://example.com/missing'), undefined, 'unknown url → undefined');

  console.log('Form recipe save/get round-trip: PASS');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
