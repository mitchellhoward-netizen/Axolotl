import assert from 'node:assert';
import { verifyEvidence, assessKnowledgeNode, statusCaveat } from '../src/agent/verify.js';
import { isOfficialUrl, sourceTypeFromUrl } from '../src/domain/evidence.js';
import type { EvidenceRecord } from '../src/domain/evidence.js';
import type { KnowledgeNode } from '../src/domain/knowledge.js';

let passed = 0;
let failed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${(e as Error).message}`);
  }
}

function rec(partial: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    id: 'ev-test',
    claim: 'claim',
    sourceUrl: 'https://www2.ed.gov/policy/x',
    sourceTitle: 'ED policy',
    sourceType: 'policy',
    retrievedAt: new Date().toISOString(),
    official: true,
    confidence: 0.9,
    status: 'discovered',
    corroboratedBy: [],
    ...partial,
  };
}

console.log('evidence + verification logic');

ok('confirmed when official + current + corroborated', () => {
  const v = verifyEvidence(rec({ corroboratedBy: ['ev-2'] }));
  assert.strictEqual(v.status, 'confirmed');
  assert.strictEqual(v.pass, true);
});

ok('verified when official + current', () => {
  const v = verifyEvidence(rec({}));
  assert.strictEqual(v.status, 'verified');
  assert.strictEqual(v.pass, true);
});

ok('plausible when non-official', () => {
  const v = verifyEvidence(rec({ sourceUrl: 'https://example.com/blog', official: false }));
  assert.strictEqual(v.status, 'plausible');
  assert.strictEqual(v.pass, false);
});

ok('stale when past TTL', () => {
  const v = verifyEvidence(rec({ retrievedAt: '2025-01-01T00:00:00Z' }));
  assert.strictEqual(v.status, 'stale');
  assert.strictEqual(v.pass, false);
});

ok('contradictory always fails', () => {
  const v = verifyEvidence(rec({ status: 'contradictory', corroboratedBy: ['ev-2'] }));
  assert.strictEqual(v.status, 'contradictory');
  assert.strictEqual(v.pass, false);
});

ok('discovered when no source URL', () => {
  const v = verifyEvidence(rec({ sourceUrl: '' }));
  assert.strictEqual(v.status, 'discovered');
  assert.strictEqual(v.pass, false);
});

ok('isOfficialUrl detects gov/edu/k12', () => {
  assert.strictEqual(isOfficialUrl('https://www2.ed.gov/x'), true);
  assert.strictEqual(isOfficialUrl('https://example.edu/x'), true);
  assert.strictEqual(isOfficialUrl('https://www.suesd.k12.ca.us/x'), true);
  assert.strictEqual(isOfficialUrl('https://example.com/x'), false);
});

ok('sourceTypeFromUrl infers pdf/form/policy', () => {
  assert.strictEqual(sourceTypeFromUrl('https://x/AR3541.pdf'), 'pdf');
  assert.strictEqual(sourceTypeFromUrl('https://docs.google.com/forms/d/e/x'), 'form');
  assert.strictEqual(sourceTypeFromUrl('https://x/board-policy-5117'), 'policy');
});

ok('assessKnowledgeNode maps draft/verified/corroborated', () => {
  const draft: KnowledgeNode = {
    id: 'n', category: 'TRANSPORTATION', title: 't', summary: 's',
    sources: [{ title: 'a', url: 'https://x.com' }], jurisdiction: 'district', status: 'draft', confidence: 0.5, createdAt: '',
  };
  assert.strictEqual(assessKnowledgeNode(draft), 'plausible');

  const verified: KnowledgeNode = {
    ...draft, status: 'verified', lastVerifiedAt: new Date().toISOString(),
    sources: [{ title: 'a', url: 'https://www.suesd.k12.ca.us/x' }, { title: 'b', url: 'https://www2.ed.gov/x' }],
  };
  assert.strictEqual(assessKnowledgeNode(verified), 'confirmed');
});

ok('statusCaveat is empty for verified/confirmed', () => {
  assert.strictEqual(statusCaveat('confirmed'), '');
  assert.notStrictEqual(statusCaveat('plausible'), '');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
