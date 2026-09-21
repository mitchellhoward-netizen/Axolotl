/**
 * The single validating writer (§4.4) and the consolidation pass (§4.2).
 *
 * These two ship together on purpose: the writer stops new noise, the pass removes the noise
 * already stored. Testing them separately would miss the thing that matters — that neither can
 * create state a parent did not bring, and that everything either of them writes is still
 * covered by deletion.
 *
 * Run: npm run test:memory-writer
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  MAX_MEMORY_ITEM,
  MemoryWriteRejected,
  persistDerivedMemory,
  recordGetting,
  resetMemoryWriterQueues,
  setInitiativeStatus,
  startInitiative,
  turnRefFor,
} from '../src/agent/memory-writer.js';
import { planConsolidation } from '../src/agent/memory-consolidate.js';
import { loadFamilyMemory, resetFamilyMemoryCache } from '../src/integrations/family-memory.js';
import { deleteFamilyData } from '../src/integrations/identity.js';
import { getSupabase } from '../src/integrations/db.js';
import type { FamilyMemory } from '../src/domain/memory.js';
import type { PersonalFact } from '../src/domain/personal-context.js';

const PERSON = { kind: 'person_report' as const, turnRef: 'conv-1#abc' };

let seq = 0;
/** Every family this suite creates, so the suite can leave the real database as it found it. */
const created = new Set<string>();
function freshFamily(): string {
  const id = `test-family-${process.pid}-${Date.now().toString(36)}-${seq++}`;
  created.add(id);
  return id;
}

/**
 * These tests exercise the real writer, which writes to the real database when one is
 * configured — so the suite must clean up after itself rather than leaving synthetic families
 * behind for the next `consolidate:memory` run to trip over.
 */
after(async () => {
  const c = getSupabase();
  if (!c || !created.size) return;
  const { error } = await c.from('family_memory').delete().in('guardian_id', [...created]);
  if (error) console.warn('[test-memory-writer] cleanup failed:', error.message);
});

function fact(over: Partial<PersonalFact> & { statement: string }): PersonalFact {
  return {
    id: over.id ?? `f-${Math.random().toString(36).slice(2)}`,
    subject: over.subject ?? 'Patrick',
    category: over.category ?? 'school',
    statement: over.statement,
    ...(over.supersedes ? { supersedes: over.supersedes } : {}),
    ...(over.validUntil ? { validUntil: over.validUntil } : {}),
    source: over.source ?? { kind: 'person_report', messageId: `m-${Math.random().toString(36).slice(2)}`, observedAt: new Date(0).toISOString() },
  } as PersonalFact;
}

// ───────────────────────────── the writer (§4.4) ─────────────────────────────

test('recordGetting stores the item and is idempotent across spelling', async () => {
  const g = freshFamily();
  await recordGetting(g, 'Free meals', PERSON);
  await recordGetting(g, '  free   MEALS ', PERSON); // same thing, different whitespace/case
  const memory = await loadFamilyMemory(g);
  assert.deepEqual(memory?.getting, ['Free meals'], 'a repeat must not become a second entry');
});

test('recordGetting refuses empty, oversized, unattributed, and content-supplied items', async () => {
  const g = freshFamily();

  await assert.rejects(() => recordGetting(g, '   ', PERSON), (e: Error) => e instanceof MemoryWriteRejected && (e as MemoryWriteRejected).reason === 'empty');
  await assert.rejects(() => recordGetting(g, 'x'.repeat(MAX_MEMORY_ITEM + 1), PERSON), (e: MemoryWriteRejected) => e.reason === 'too_long');
  await assert.rejects(
    () => recordGetting(g, 'a bus pass', { kind: 'person_report', turnRef: '' }),
    (e: MemoryWriteRejected) => e.reason === 'unattributed',
  );
  // A form's own text is not the parent telling us something. Repeating it back does not launder it.
  await assert.rejects(
    () => recordGetting(g, 'a bus pass', { kind: 'content-supplied' as never, turnRef: 'conv-1#abc' }),
    (e: MemoryWriteRejected) => e.reason === 'content_supplied',
  );

  assert.equal(await loadFamilyMemory(g), undefined, 'a refused write must persist nothing at all');
});

test('startInitiative collapses an existing label instead of duplicating it, keeping the original since', async () => {
  const g = freshFamily();
  const first = await startInitiative(g, 'Speech services', PERSON);
  const since = first.initiatives[0]!.since;
  const second = await startInitiative(g, 'speech  SERVICES', PERSON);

  assert.equal(second.initiatives.length, 1, 'a re-raised focus is one focus, not two');
  assert.equal(second.initiatives[0]!.since, since, 'the family has been waiting since the first ask');
});

test('setInitiativeStatus refuses an unknown initiative rather than silently reporting success', async () => {
  const g = freshFamily();
  await assert.rejects(
    () => setInitiativeStatus(g, 'initiative-does-not-exist', 'done'),
    (e: MemoryWriteRejected) => e.reason === 'unknown_initiative',
  );
  const memory = await startInitiative(g, 'Bus pass', PERSON);
  const id = memory.initiatives[0]!.id;
  const done = await setInitiativeStatus(g, id, 'done');
  assert.equal(done.initiatives[0]!.status, 'done');
});

test('concurrent writes to one family do not lose updates', async () => {
  // The regression this guards: every mutator is a read-modify-write of one row, so without
  // serialization two in-flight tool calls both load the pre-write value and one is clobbered.
  const g = freshFamily();
  resetMemoryWriterQueues();
  const items = Array.from({ length: 25 }, (_, i) => `item ${i}`);
  await Promise.all(items.map((item) => recordGetting(g, item, PERSON)));
  const memory = await loadFamilyMemory(g);
  assert.equal(memory?.getting.length, 25, 'all 25 concurrent records must survive');
  assert.deepEqual([...memory!.getting].sort(), [...items].sort());
});

test('turnRefFor is deterministic, distinguishes turns, and carries no message content', () => {
  const a = turnRefFor('conv-9', 'my kid needs speech services');
  const b = turnRefFor('conv-9', 'my kid needs speech services');
  const c = turnRefFor('conv-9', 'a different sentence');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a.includes(' '), 'the ref must not embed the raw sentence');
});

test('persistDerivedMemory carries consolidation output through, rather than erasing it', async () => {
  // A read-modify-write that rebuilt the shape from scratch would silently drop these on the
  // next unrelated memory write — the consolidation pass's work would vanish without a trace.
  const g = freshFamily();
  const memory: FamilyMemory = {
    needs: ['speech'],
    getting: ['speech'],
    initiatives: [],
    issueSummary: [],
    consolidatedAt: '2026-01-01T00:00:00.000Z',
    contradictions: [{ subject: 'household', category: 'family', statements: [], flaggedAt: '2026-01-01T00:00:00.000Z' }],
  };
  await persistDerivedMemory(g, memory);
  await recordGetting(g, 'a bus pass', PERSON); // an unrelated later write
  const after = await loadFamilyMemory(g);
  assert.equal(after?.consolidatedAt, '2026-01-01T00:00:00.000Z', 'consolidatedAt survived an unrelated write');
  assert.equal(after?.contradictions?.length, 1, 'flagged contradictions survived an unrelated write');
});

// ────────────────────────── consolidation (§4.2) ──────────────────────────

test('planConsolidation merges duplicate getting entries and drops empties', () => {
  const { memory, report } = planConsolidation({
    memory: { needs: [], getting: ['Free meals', 'free  meals', '', 'Bus pass'], initiatives: [], issueSummary: [] },
    now: 1000,
  });
  assert.deepEqual(memory.getting, ['Free meals', 'Bus pass']);
  assert.equal(report.gettingMerged, 2);
  assert.equal(report.changed, true);
});

test('planConsolidation collapses duplicate initiative labels and never closes an active focus', () => {
  const { memory, report } = planConsolidation({
    memory: {
      needs: [],
      getting: [],
      issueSummary: [],
      initiatives: [
        { id: 'a', label: 'Speech', since: '2026-01-01T00:00:00.000Z', status: 'paused' },
        { id: 'b', label: 'speech', since: '2026-03-01T00:00:00.000Z', status: 'active' },
      ],
    },
    now: 1000,
  });
  assert.equal(memory.initiatives.length, 1);
  assert.equal(report.initiativesDeduped, 1);
  assert.equal(memory.initiatives[0]!.id, 'b', 'the most recently raised instance survives');
  assert.equal(memory.initiatives[0]!.status, 'active', 'a cleanup job must never close a focus the family is waiting on');
});

test('planConsolidation flags the same thing recorded as both a need and as secured, without resolving it', () => {
  const { memory, report } = planConsolidation({
    memory: { needs: ['Speech services'], getting: ['speech services'], initiatives: [], issueSummary: [] },
    now: 1000,
  });
  assert.equal(report.contradictionsFlagged, 1);
  const [c] = memory.contradictions!;
  assert.equal(c!.statements.length, 2, 'both sides are kept');
  assert.ok(!('chosen' in (c as object)), 'there is nowhere to record a winner — by construction');
  // Neither bucket is emptied: "secured some" does not mean "no longer needs any".
  assert.deepEqual(memory.needs, ['Speech services']);
  assert.deepEqual(memory.getting, ['speech services']);
});

test('planConsolidation flags competing facts but treats an explicit correction as settled', () => {
  const original = fact({ id: 'f1', statement: 'IEP meeting is Tuesday' });
  const correction = fact({ id: 'f2', statement: 'IEP meeting is Thursday', supersedes: 'f1' });
  const competing = fact({ id: 'f3', statement: 'The IEP meeting was cancelled' });

  const { memory, report } = planConsolidation({ facts: [original, correction, competing], now: 1000 });
  assert.equal(report.contradictionsFlagged, 1, 'one disagreement: f2 vs f3');
  const [c] = memory.contradictions!;
  assert.deepEqual(c!.statements.map((s) => s.factId).sort(), ['f2', 'f3'], 'the superseded f1 is a correction, not a disagreement');
  assert.equal(report.supersededFacts, 1);
});

test('planConsolidation reports superseded and expired facts but deletes nothing', () => {
  const facts = [
    fact({ id: 'live', statement: 'still true' }),
    fact({ id: 'old', statement: 'replaced', supersedes: undefined }),
    fact({ id: 'exp', statement: 'a deadline that passed', validUntil: '2020-01-01T00:00:00.000Z' }),
    fact({ id: 'future', statement: 'a deadline ahead', validUntil: '2030-01-01T00:00:00.000Z' }),
  ];
  const snapshot = structuredClone(facts);

  const { report } = planConsolidation({ facts, now: Date.parse('2026-01-01T00:00:00.000Z') });
  assert.equal(report.expiredFacts, 1, 'only the past deadline is expired');
  assert.equal(report.supersededFacts, 0);

  // §5.5: forgetting must carry an audit receipt, so the pass only ever reports.
  assert.deepEqual(facts, snapshot, 'the pass must not mutate the facts it was given');
});

test('planConsolidation reports a repeated fact as a signal, not an automatic promotion', () => {
  const facts = [fact({ statement: 'Patrick is allergic to peanuts' }), fact({ statement: 'patrick is allergic to peanuts' })];
  const { report } = planConsolidation({ facts, now: 1000 });
  assert.equal(report.repeatedFacts, 1, 'stated twice — surfaced for a human');
});

test('planConsolidation is idempotent: a second pass over its own output changes nothing', () => {
  const input = {
    memory: { needs: ['Speech'], getting: ['speech', 'Free meals', 'free meals'], initiatives: [], issueSummary: [] } as FamilyMemory,
    now: 1000,
  };
  const first = planConsolidation(input);
  assert.equal(first.report.changed, true);

  const second = planConsolidation({ memory: first.memory, now: 2000 });
  assert.equal(second.report.changed, false, 'safe to run on a schedule');
  assert.equal(second.report.contradictionsFlagged, 0, 'an already-flagged contradiction is not re-flagged');
  assert.equal(second.memory.contradictions!.length, first.memory.contradictions!.length, 'and not duplicated');
});

test('planConsolidation keeps a previously flagged contradiction even when its cause is gone', () => {
  // Otherwise a known disagreement would silently vanish the moment its inputs left the set.
  const prior: FamilyMemory = {
    needs: [], getting: [], initiatives: [], issueSummary: [],
    contradictions: [{ subject: 'household', category: 'family', statements: [{ factId: 'x', statement: 'a', messageId: 'm', observedAt: '2026-01-01T00:00:00.000Z' }], flaggedAt: '2026-01-01T00:00:00.000Z' }],
  };
  const { memory, report } = planConsolidation({ memory: prior, now: 9999 });
  assert.equal(memory.contradictions!.length, 1);
  assert.equal(report.contradictionsFlagged, 0);
});

test('planConsolidation creates no state outside memory — it cannot invent a consent-relevant field', () => {
  const { memory } = planConsolidation({
    memory: { needs: [], getting: ['x'], initiatives: [], issueSummary: [], notes: 'n' },
    now: 1000,
  });
  const allowed = new Set(['needs', 'getting', 'initiatives', 'issueSummary', 'notes', 'consolidatedAt', 'contradictions']);
  for (const key of Object.keys(memory)) {
    assert.ok(allowed.has(key), `unexpected key "${key}" — the pass may only rewrite memory`);
  }
  // No action, step, consent or completion concept may appear in its output.
  const serialized = JSON.stringify(memory);
  for (const forbidden of ['"status":"completed"', '"consent', '"step"', '"action"']) {
    assert.ok(!serialized.includes(forbidden), `the pass must not emit ${forbidden}`);
  }
});

// ───────────────────── deletion coverage (the acceptance test) ─────────────────────

test('nothing the writer or the pass produces can escape deleteFamilyData', async () => {
  // Structural proof, because it must hold even with no database configured.
  // 1. The only table either of them writes is family_memory.
  const source = readFileSync(new URL('../src/agent/memory-writer.ts', import.meta.url), 'utf8');
  assert.ok(!/from\(['"](?!family_memory)/.test(source), 'the writer must not touch any other table');
  // 2. deleteFamilyData still names family_memory. If someone drops that line, this fails.
  const identity = readFileSync(new URL('../src/integrations/identity.ts', import.meta.url), 'utf8');
  assert.match(identity, /count\(\s*'family_memory'\s*,\s*'guardian_id'/, 'family_memory must stay in the deletion path');
  // 3. No new table: the consolidation output is confined to the FamilyMemory row.
  assert.ok(!/create table|new table/i.test(readFileSync(new URL('../src/agent/memory-consolidate.ts', import.meta.url), 'utf8')));
});

test('deleteFamilyData actually removes consolidated memory (database)', async (t) => {
  const c = getSupabase();
  if (!c) {
    t.skip('no database configured — run via: railway run --service get-axolotl-agent -- npm run test:memory-writer');
    return;
  }
  const guardianId = freshFamily();
  resetFamilyMemoryCache();
  // Write state that only exists BECAUSE of this work: a consolidation stamp and a flagged
  // contradiction, plus a merged bucket.
  const { memory } = planConsolidation({
    memory: { needs: ['speech'], getting: ['speech', 'speech'], initiatives: [], issueSummary: [] },
    now: Date.now(),
  });
  await persistDerivedMemory(guardianId, memory);

  const before = await c.from('family_memory').select('guardian_id').eq('guardian_id', guardianId).maybeSingle();
  assert.ok(before.data, 'precondition: the consolidated row exists');

  await deleteFamilyData(guardianId, { conversationId: `conv-${guardianId}` });

  const after = await c.from('family_memory').select('guardian_id').eq('guardian_id', guardianId).maybeSingle();
  assert.equal(after.data, null, 'nothing the pass wrote may survive deletion');
});

// ──────────────── enforcement: the writer is the only door (§4.4) ────────────────

test('only the writer imports the family-memory write path', () => {
  // This is the claim §4.4 makes. It is enforced by convention plus this guard, not by the
  // type system alone — so if a future caller adds a direct write, this test is what fails.
  const srcDir = new URL('../src', import.meta.url).pathname;
  const offenders: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith('.ts')) continue;
      if (full.endsWith('memory-writer.ts') || full.endsWith('family-memory.ts')) continue;
      const text = readFileSync(full, 'utf8');
      if (/persistFamilyMemory|mintMemoryWriteProof/.test(text)) offenders.push(full.replace(srcDir, 'src'));
    }
  };
  walk(srcDir);

  assert.deepEqual(offenders, [], `these bypass the validating writer: ${offenders.join(', ')}`);
});
