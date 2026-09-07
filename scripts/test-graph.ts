import assert from 'node:assert';
import { buildChain, searchSchoolGraph, chainSummary, saveResource, saveResourceEdge } from '../src/knowledge/resource-graph.js';
import type { ResourceNode } from '../src/domain/graph.js';

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

const NOW = new Date().toISOString();
const DISTRICT = 'district-test';
function node(id: string, type: ResourceNode['type'], title: string, category?: string): ResourceNode {
  return {
    id,
    type,
    districtId: DISTRICT,
    category,
    title,
    summary: title,
    canonicalUrl: `https://example.com/${id}`,
    sources: [{ title, url: `https://example.com/${id}` }],
    status: 'draft',
    confidence: 0.6,
    discoveredAt: NOW,
  };
}

// A generic (non-Soquel) transportation chain for any district.
const nodes: ResourceNode[] = [
  node('test-district', 'district', 'Test District'),
  node('test-school', 'school', 'Test Elementary'),
  node('test-transport', 'department', 'Transportation'),
  node('test-bus', 'program', 'Bus Eligibility', 'TRANSPORTATION'),
  node('test-bus-rule', 'eligibility', 'Bus eligibility'),
  node('test-mv-policy', 'policy', 'McKinney-Vento Act'),
  node('test-mv-request', 'application', 'Transportation Request'),
  node('test-bus-form', 'form', 'Transportation Request Form'),
  node('test-liaison', 'contact', 'Homeless liaison'),
];
const edges = [
  { from: 'test-school', to: 'test-district', type: 'belongs_to' as const },
  { from: 'test-district', to: 'test-transport', type: 'has_department' as const },
  { from: 'test-transport', to: 'test-bus', type: 'runs' as const },
  { from: 'test-bus', to: 'test-bus-rule', type: 'has_eligibility' as const },
  { from: 'test-bus', to: 'test-mv-policy', type: 'cites' as const },
  { from: 'test-bus', to: 'test-mv-request', type: 'applied_via' as const },
  { from: 'test-mv-request', to: 'test-bus-form', type: 'uses_form' as const },
  { from: 'test-mv-request', to: 'test-liaison', type: 'has_contact' as const },
];

console.log('resource graph logic');

ok('buildChain collects leaf artifacts from a program', () => {
  const chain = buildChain(nodes, edges, 'test-bus');
  assert.ok(chain.nodes.length >= 6);
  assert.strictEqual(chain.forms.length, 1);
  assert.strictEqual(chain.forms[0]?.id, 'test-bus-form');
  assert.strictEqual(chain.contacts.length, 1);
  assert.strictEqual(chain.eligibility.length, 1);
  assert.strictEqual(chain.policies.length, 1);
  assert.strictEqual(chain.applications.length, 1);
});

ok('buildChain traverses school→district→department→program', () => {
  const chain = buildChain(nodes, edges, 'test-school');
  const types = chain.nodes.map((n) => n.type);
  assert.ok(types.includes('district'));
  assert.ok(types.includes('department'));
  assert.ok(types.includes('program'));
  assert.ok(types.includes('form'));
});

ok('searchSchoolGraph returns null for an empty district', async () => {
  const chain = await searchSchoolGraph('district-unknown', 'TRANSPORTATION');
  assert.strictEqual(chain, null);
});

ok('searchSchoolGraph matches a TRANSPORTATION category after saving', async () => {
  for (const n of nodes) await saveResource(n);
  for (const e of edges) await saveResourceEdge(e);
  const chain = await searchSchoolGraph(DISTRICT, 'TRANSPORTATION');
  assert.ok(chain);
  assert.strictEqual(chain.startId, 'test-bus');
  assert.strictEqual(chain.forms.length, 1);
  assert.ok(chain.contacts.some((c) => c.id === 'test-liaison'));
});

ok('chainSummary mentions form + contact', () => {
  const chain = buildChain(nodes, edges, 'test-bus');
  const s = chainSummary(chain);
  assert.ok(s.includes('Form:'));
  assert.ok(s.includes('Contact:'));
  assert.ok(s.includes('Transportation Request Form'));
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 20);
