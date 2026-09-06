import assert from 'node:assert';
import { routeTool, modelFor, frontierModel } from '../src/agent/model-policy.js';

let passed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

console.log('model routing');

ok('routeTool classifies deterministic tools', () => {
  assert.strictEqual(routeTool('web_search'), 'deterministic');
  assert.strictEqual(routeTool('get_law'), 'deterministic');
  assert.strictEqual(routeTool('search_school_graph'), 'deterministic');
});

ok('routeTool classifies browser actuation as small', () => {
  assert.strictEqual(routeTool('browser_act'), 'small');
  assert.strictEqual(routeTool('browser_extract'), 'small');
});

ok('routeTool defaults unknown tools to frontier', () => {
  assert.strictEqual(routeTool('send_email'), 'frontier');
  assert.strictEqual(routeTool('save_evidence'), 'frontier');
});

ok('modelFor returns the right tier spec', () => {
  const f = frontierModel();
  assert.strictEqual(typeof f.model, 'string');
  assert.strictEqual(modelFor('browser_act').model, process.env.SMALL_MODEL ?? f.model);
});

console.log(`\n${passed} passed`);
