import assert from 'node:assert';
import { makeSkillKey, parameterize, type Skill } from '../src/domain/skill.js';
import { isSkillStale, verifySkillLeaves, distillSkill, skillSummary, saveSkill, findSkillFor, listSkills } from '../src/agent/skills.js';
import { seedSuesdResourceGraph } from '../src/knowledge/resource-graph.js';
import type { Step } from '../src/agent/steps/types.js';
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

function skill(partial: Partial<Skill>): Skill {
  const now = new Date().toISOString();
  return {
    id: 'skill-x', name: 'Bus request', key: 'transportation::district-suesd',
    description: 'd', whenToUse: '', steps: [], evidenceDeps: [],
    status: 'active', approved: true, version: 1, createdAt: now, updatedAt: now, lastVerifiedAt: now,
    ...partial,
  };
}

const seedNodes = seedSuesdResourceGraph().nodes;

console.log('skills / procedural memory logic');

ok('makeSkillKey normalizes intent + jurisdiction', () => {
  assert.strictEqual(makeSkillKey('Transportation', 'District-SUESD'), 'transportation::district-suesd');
});

ok('parameterize substitutes placeholders', () => {
  assert.strictEqual(parameterize('Hi {child} at {school}', { child: 'Patrick', school: 'Soquel' }), 'Hi Patrick at Soquel');
});

ok('isSkillStale flags old / stale / deprecated', () => {
  assert.strictEqual(isSkillStale(skill({})), false);
  assert.strictEqual(isSkillStale(skill({ lastVerifiedAt: '2025-01-01T00:00:00Z' })), true);
  assert.strictEqual(isSkillStale(skill({ status: 'stale' })), true);
  assert.strictEqual(isSkillStale(skill({ lastVerifiedAt: undefined })), true);
});

ok('verifySkillLeaves flags missing + stale leaves', () => {
  const fresh = verifySkillLeaves(skill({ evidenceDeps: ['suesd-transport-form'] }), seedNodes);
  assert.strictEqual(fresh.ok, true);

  const missing = verifySkillLeaves(skill({ evidenceDeps: ['nope'] }), seedNodes);
  assert.deepStrictEqual(missing.staleLeaves, ['nope']);
  assert.strictEqual(missing.ok, false);

  const oldNode: ResourceNode = { ...seedNodes[0]!, id: 'old-form', lastVerifiedAt: '2025-01-01T00:00:00Z' };
  const stale = verifySkillLeaves(skill({ evidenceDeps: ['old-form'] }), [oldNode]);
  assert.deepStrictEqual(stale.staleLeaves, ['old-form']);
});

ok('distillSkill generalizes the child name to {child}', () => {
  const step: Step = {
    id: 'e1', caseId: 'c1', intent: 'request_mckinney_transport', channel: 'email',
    counterparty: { role: 'HOMELESS_LIAISON', email: 'x@y.org' },
    payload: { channel: 'email', subject: 'Transportation for Patrick', body: 'I am the parent of Patrick at Soquel Elementary School.' },
    successCondition: { describe: 'Email sent', kind: 'reference_received' },
    requiresConsent: true, status: 'planned',
  };
  const s = distillSkill({
    intent: 'transportation', jurisdiction: 'district-suesd', description: 'Bus request', steps: [step],
    family: { children: [{ name: 'Patrick', grade: '3' }], needs: [], challenges: [] },
  });
  const body = s.steps[0]?.args.body ?? '';
  assert.ok(body.includes('{child}'));
  assert.ok(!body.includes('Patrick'));
  assert.strictEqual(s.key, 'transportation::district-suesd');
});

ok('skillSummary renders name + steps', () => {
  const s = skill({ steps: [{ order: 1, tool: 'send_email', args: {}, note: 'Email sent' }] });
  const summary = skillSummary(s);
  assert.ok(summary.includes('send_email'));
  assert.ok(summary.includes('Bus request'));
});

ok('store round-trips save → find', async () => {
  const s = skill({ id: 'skill-roundtrip', key: 'meals::district-suesd', name: 'Meals app' });
  await saveSkill(s);
  const found = await findSkillFor('meals', 'district-suesd');
  assert.ok(found);
  assert.strictEqual(found?.id, 'skill-roundtrip');
  const all = await listSkills();
  assert.ok(all.some((x) => x.id === 'skill-roundtrip'));
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 20);
