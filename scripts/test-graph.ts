import assert from 'node:assert';
import { buildChain, searchSchoolGraph, chainSummary, seedSuesdResourceGraph, SUESD_ID } from '../src/knowledge/resource-graph.js';

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

const { nodes, edges } = seedSuesdResourceGraph();

console.log('resource graph logic');

ok('buildChain collects leaf artifacts from a program', () => {
  const chain = buildChain(nodes, edges, 'suesd-bus-eligibility');
  assert.ok(chain.nodes.length >= 7);
  assert.strictEqual(chain.forms.length, 1);
  assert.strictEqual(chain.forms[0]?.id, 'suesd-transport-form');
  assert.strictEqual(chain.contacts.length, 2);
  assert.strictEqual(chain.eligibility.length, 1);
  assert.strictEqual(chain.policies.length, 1);
  assert.strictEqual(chain.applications.length, 1);
});

ok('buildChain traverses school→district→department→program', () => {
  const chain = buildChain(nodes, edges, 'school-soquel');
  const types = chain.nodes.map((n) => n.type);
  assert.ok(types.includes('district'));
  assert.ok(types.includes('department'));
  assert.ok(types.includes('program'));
  assert.ok(types.includes('form'));
});

ok('searchSchoolGraph matches a TRANSPORTATION category', async () => {
  const chain = await searchSchoolGraph(SUESD_ID, 'TRANSPORTATION');
  assert.ok(chain);
  assert.strictEqual(chain.startId, 'suesd-bus-eligibility');
  assert.strictEqual(chain.forms.length, 1);
  assert.ok(chain.contacts.some((c) => c.id === 'suesd-liaison'));
});

ok('searchSchoolGraph returns null for an empty district', async () => {
  const chain = await searchSchoolGraph('district-unknown', 'TRANSPORTATION');
  assert.strictEqual(chain, null);
});

ok('chainSummary mentions form + contact', () => {
  const chain = buildChain(nodes, edges, 'suesd-bus-eligibility');
  const s = chainSummary(chain);
  assert.ok(s.includes('Form:'));
  assert.ok(s.includes('Contact:'));
  assert.ok(s.includes('Transportation Request Form'));
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 20);
