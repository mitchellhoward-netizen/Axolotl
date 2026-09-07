import assert from 'node:assert';
import {
  districtIdFromName,
  registerDistrict,
  resolveDistrict,
  getResearchedDistrict,
  getResearchedDistrictById,
  researchDistrictProfile,
  type DistrictProfile,
} from '../src/knowledge/districts.js';
import { answerSchoolInfo, busProcessSummary, HOMELESS_DEFINITION } from '../src/knowledge/school-info.js';
import { contextFromProfile, detectBarriers, barrierByCategory } from '../src/knowledge/barriers.js';
import { resolveAnyDistrict, resolveAnySchool } from '../src/knowledge/discovery.js';
import { createSeedDb, provisionalParent, provisionFamily } from '../src/seed.js';
import { auditEntitlements } from '../src/knowledge/entitlements.js';
import { inferCategory } from '../src/knowledge/research.js';
import { buildDraftNodes } from '../src/knowledge/graph.js';
import type { LlmClient } from '../src/agent/llm.js';

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

console.log('any-school / any-student (researched district is authoritative)');

// ── Stable district identity (no hardcoded Soquel) ────────────────────────────
ok('district id is stable (derived from name, never random)', () => {
  assert.strictEqual(districtIdFromName('Lincoln Elementary Seattle WA'), 'district-lincoln-elementary-seattle-wa');
  assert.strictEqual(districtIdFromName('Lincoln Elementary Seattle WA'), districtIdFromName('Lincoln Elementary Seattle WA'));
});

ok('resolveDistrict is honest (known:false) for an un-researched district — no invented contacts', () => {
  const d = resolveDistrict('Riverview Middle');
  assert.strictEqual(d.known, false);
  assert.strictEqual(d.type, 'unknown');
  assert.strictEqual(d.name, 'Riverview Middle');
  assert.strictEqual(d.liaison, undefined);
});

// ── Research populates the authoritative profile ─────────────────────────────
const profile: DistrictProfile = registerDistrict({
  id: 'district-lincoln-elementary-seattle-wa',
  name: 'Lincoln Elementary School District',
  short: 'LESD',
  elementary: 'Lincoln Elementary',
  liaison: { name: 'Jordan Reyes', role: 'District Homeless Liaison', phone: '(206) 555-0100', email: 'jreyes@lesd.org' },
  busPasses: { name: 'Sam Tran', phone: '(206) 555-0111' },
  schools: '• Lincoln Elementary — Principal Diana Lee, (206) 555-0100\n• Lakeview Elementary — (206) 555-0120',
  type: 'public',
});

ok('registerDistrict caches the researched profile (resolved from the same name)', () => {
  const resolved = resolveDistrict('Lincoln Elementary');
  assert.strictEqual(resolved.known, true);
  assert.strictEqual(resolved.type, 'public');
  assert.strictEqual(resolved.liaison?.email, 'jreyes@lesd.org');
  const byId = getResearchedDistrictById('district-lincoln-elementary-seattle-wa');
  assert.strictEqual(byId?.short, 'LESD');
});

ok('resolveAnyDistrict keys the same id (not the Soquel seed)', () => {
  const d = resolveAnyDistrict('Lincoln Elementary Seattle WA');
  assert.strictEqual(d.id, 'district-lincoln-elementary-seattle-wa');
  assert.strictEqual(d.resolved, true);
  assert.strictEqual(d.liaison?.phone, '(206) 555-0100');
});

ok('researchDistrictProfile with an LLM registers a known profile', async () => {
  const mockLlm = {
    enabled: true,
    researchDistrict: async (name: string) => ({
      name,
      short: 'BUSD',
      liaison: { name: 'Ava Kim', role: 'Liaison', phone: '(555) 200-1000', email: 'ava@busd.org' },
      busPasses: { name: 'Leo Park', phone: '(555) 200-1100' },
      schools: '• Bayview Elementary',
      type: 'public',
      known: true,
    }),
  } as unknown as LlmClient;
  const d = await researchDistrictProfile('Bayview Elementary San Diego CA', mockLlm);
  assert.strictEqual(d.known, true);
  assert.strictEqual(d.liaison?.email, 'ava@busd.org');
  assert.strictEqual(getResearchedDistrict('Bayview Elementary San Diego CA')?.busPasses?.name, 'Leo Park');
});

// ── School-info answered from the researched profile (never invents) ──────────
ok('answerSchoolInfo answers liaison/bus/schools from the researched profile', () => {
  assert.ok(answerSchoolInfo(profile, 'who is the homeless liaison')?.includes('Jordan Reyes'));
  assert.match(answerSchoolInfo(profile, 'bus passes') ?? '', /Sam Tran/);
  assert.match(answerSchoolInfo(profile, 'list the schools') ?? '', /Lakeview/);
});

ok('answerSchoolInfo returns undefined (honest) for what the profile lacks', () => {
  assert.strictEqual(answerSchoolInfo(profile, 'what is the principal\'s phone'), undefined);
  assert.strictEqual(answerSchoolInfo(profile, 'what time does the bell ring'), undefined);
});

ok('answerSchoolInfo returns the generic McKinney-Vento definition for a definition ask', () => {
  assert.strictEqual(answerSchoolInfo(profile, 'what does homeless mean under mckinney'), HOMELESS_DEFINITION);
});

// ── Bus process + barriers use the researched contacts ────────────────────────
ok('busProcessSummary uses the researched liaison/bus-pass contacts', () => {
  const s = busProcessSummary(profile, 'Lincoln Elementary', 'Emma');
  assert.ok(s.includes('Jordan Reyes'));
  assert.ok(s.includes('jreyes@lesd.org'));
  assert.ok(s.includes('Sam Tran'));
});

ok('barriers resolve against the researched school/liaison, not a hardcoded district', () => {
  const ctx = contextFromProfile(profile);
  const b = detectBarriers('we can\'t get to school, we lost our housing', ctx)[0]!;
  assert.strictEqual(b.category, 'transportation');
  assert.match(b.contact, /Jordan Reyes/);
  assert.strictEqual(b.email, 'jreyes@lesd.org');
  assert.match(b.draft, /Lincoln Elementary/);
});

ok('barrierByCategory honors an unresearched district honestly (no invented name)', () => {
  const b = barrierByCategory('transportation');
  assert.ok(b);
  assert.match(b.contact, /the district homeless liaison/);
  assert.strictEqual(b.email, undefined);
});

// ── Any student: students come from parent-provided children (no Soquel) ──────
ok('provisionFamily builds students from parent-provided children + resolved school (no seed)', () => {
  const db = createSeedDb();
  assert.strictEqual(db.schools.length, 0); // no hardcoded school left
  const parent = provisionalParent(db, '+15551234567')!;
  const out = provisionFamily(db, parent.id, {
    children: [{ name: 'Emma', grade: '3' }, { name: 'Liam', grade: '1' }],
    school: 'Maple Elementary',
    district: 'Maple School District',
    location: 'Seattle, WA',
    needs: [],
    challenges: [],
  });
  assert.ok(out);
  assert.strictEqual(out.studentIds.length, 2);
  const school = db.schools[0]!;
  assert.strictEqual(school.name, 'Maple Elementary');
  assert.strictEqual(school.district, 'Maple School District');
  assert.strictEqual(db.students.length, 2);
  assert.ok(db.students.every((s) => s.schoolId === school.id));
  assert.ok(db.students.every((s) => s.homeroomTeacherId === '')); // no invented teacher
});

ok('resolveAnySchool returns a stable (non-Soquel) ref for an unknown school', () => {
  const s = resolveAnySchool('Redwood Academy Portland OR');
  assert.strictEqual(s.name, 'Redwood Academy Portland OR');
  assert.strictEqual(s.resolved, false);
});

// ── The mission: entitlement→delta surfaced for after-school/enrichment ──────
ok('MISSION: free before/after-school programs are surfaced as an entitlement-delta', () => {
  const audit = auditEntitlements({
    children: [{ name: 'Emma', grade: '3' }],
    school: 'Lincoln Elementary',
    needs: ['after school programs'],
    challenges: [],
    schoolType: 'public',
  });
  assert.ok(audit.some((a) => a.entitlement.id === 'free-enrichment'));
  const gapText = audit.find((a) => a.entitlement.id === 'free-enrichment');
  assert.match(gapText?.entitlement.action ?? '', /sign up/i);
});

ok('MISSION: after-school free-text maps to ACTIVITIES research', () => {
  assert.strictEqual(inferCategory('give me the after school programs for free'), 'ACTIVITIES');
});

ok('MISSION: the generic ACTIVITIES node is actionable (not just "check with the office")', () => {
  const nodes = buildDraftNodes('district-x', 'Maple Elementary', 'Maple School District');
  const act = nodes.find((n) => n.category === 'ACTIVITIES');
  assert.ok(act);
  assert.match(act.summary, /fee/i);
  assert.match(act.summary, /form/i);
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 20);
