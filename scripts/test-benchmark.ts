import assert from 'node:assert';
import { scoreRun, toTrajectoryData, SAMPLE_TASKS, type RunTrace } from '../src/eval/benchmark.js';

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

const task = SAMPLE_TASKS[0]!;

const fullTrace: RunTrace = {
  queries: ['soquel bus', 'soquel bus', 'soquel mckinney vento'],
  discoveredSources: [
    'https://www.suesd.org/mckinney-vento',
    'https://docs.google.com/forms/d/e/example',
    'https://example.com/decoy',
  ],
  usefulSources: ['https://www.suesd.org/mckinney-vento'],
  evidence: [
    { sourceUrl: 'https://www.suesd.org/mckinney-vento', status: 'confirmed' },
    { sourceUrl: 'https://example.com/decoy', status: 'plausible' },
  ],
  failures: [{ error: '404', recovered: true }, { error: 'login wall', recovered: false }],
  toolCalls: 20,
  costUsd: 0.42,
  latencyMs: 18000,
  humanInterventions: 1,
};

console.log('benchmark scoring');

ok('scores a well-covered run with separated metrics', () => {
  const m = scoreRun(task, fullTrace);
  assert.ok(Math.abs(m.queryNovelty - 2 / 3) < 1e-9); // 3 queries, 2 unique → 1 - 1/3
  assert.strictEqual(m.searchSuccess, 1);
  assert.strictEqual(m.discoveryRecall, 0.5); // 1 of 2 authoritative sources
  assert.strictEqual(m.formDiscovery, 1); // form URL discovered
  assert.strictEqual(m.verificationRate, 0.5); // 1 of 2 evidence verified/confirmed
  assert.strictEqual(m.recoveryRate, 0.5); // 1 of 2 failures recovered
  assert.strictEqual(m.humanInterventionRate, 0.05); // 1 / 20
  assert.strictEqual(m.toolCalls, 20);
});

ok('scores an empty run as zeros (no NaN)', () => {
  const m = scoreRun(task, {
    queries: [], discoveredSources: [], usefulSources: [], evidence: [], failures: [],
    toolCalls: 0, costUsd: 0, latencyMs: 0, humanInterventions: 0,
  });
  assert.strictEqual(m.discoveryRecall, 0);
  assert.strictEqual(m.recoveryRate, 0);
  assert.strictEqual(m.queryNovelty, 1);
  assert.strictEqual(m.searchSuccess, 0);
});

ok('toTrajectoryData emits a training/eval episode', () => {
  const t = toTrajectoryData(task, fullTrace);
  assert.strictEqual(t.task_id, 'sb-001');
  assert.strictEqual(t.category, 'transportation');
  assert.ok(Array.isArray(t.queries));
  assert.ok(t.metrics.discoveryRecall >= 0);
});

console.log(`\n${passed} passed`);
