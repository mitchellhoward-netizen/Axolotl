import assert from 'node:assert';
import { assessRights } from '../src/knowledge/rights.js';
import { auditEntitlements, discoveryQuestions } from '../src/knowledge/entitlements.js';
import type { FamilyProfile } from '../src/domain/types.js';

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

function profile(schoolType?: FamilyProfile['schoolType']): FamilyProfile {
  return {
    children: [{ name: 'Sophie' }],
    needs: ['transportation'],
    challenges: ['homeless/transitional housing'],
    schoolType,
  };
}

console.log('school-type gating (no public-school over-claim)');

ok('assessRights: public → asserts McKinney-Vento', () => {
  assert.ok(assessRights(profile('public'), 'public').length > 0);
  assert.ok(assessRights(profile(), 'public').some((r) => /McKinney-Vento/.test(r.law)));
});

ok('assessRights: private → asserts nothing', () => {
  assert.strictEqual(assessRights(profile('private'), 'private').length, 0);
  assert.strictEqual(assessRights(profile('unknown'), 'unknown').length, 0);
});

ok('assessRights: undefined schoolType → backward-compatible (full)', () => {
  assert.ok(assessRights(profile()).length > 0);
});

ok('auditEntitlements: public → non-empty', () => {
  assert.ok(auditEntitlements(profile('public')).length > 0);
});

ok('auditEntitlements: private/unknown → empty', () => {
  assert.strictEqual(auditEntitlements(profile('private')).length, 0);
  assert.strictEqual(auditEntitlements(profile('unknown')).length, 0);
});

ok('auditEntitlements: undefined → backward-compatible (non-empty)', () => {
  assert.ok(auditEntitlements(profile()).length > 0);
});

ok('discoveryQuestions: private → empty', () => {
  assert.strictEqual(discoveryQuestions(profile('private')).length, 0);
  assert.ok(discoveryQuestions(profile('public')).length > 0);
});

console.log(`\n${passed} passed`);
