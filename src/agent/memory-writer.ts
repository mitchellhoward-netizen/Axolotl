import {
  type FamilyMemory,
  type Initiative,
  type InitiativeStatus,
} from '../domain/memory.js';
import {
  baseFamilyMemory,
  loadFamilyMemory,
  mintMemoryWriteProof,
  persistFamilyMemory,
} from '../integrations/family-memory.js';

/**
 * The single validating writer for family memory (MEMORY-COMPARISON §4.4).
 *
 * Why this exists: the answering agent used to write memory buckets through tool calls that
 * took whatever string the model produced and persisted it directly. That is how buckets
 * accumulate noise, and it is why a consolidation pass (§4.2) was needed at all. The
 * substantive change is *who can create state*: nothing else in the codebase can reach
 * `persistFamilyMemory`, so a write that skips validation is now a typecheck failure rather
 * than a silent success.
 *
 * What this module will NOT do, by construction:
 *   - It never stages an action, queues a step, or asks for consent. It only rewrites memory.
 *   - It never marks anything `completed`. Memory records what a parent *reported*; provider
 *     confirmation is a different concept that lives on tasks (`outcome.state === 'completed'`)
 *     and is never inferred from a sentence here.
 *   - It never deletes. Forgetting is `deleteFamilyData` (with its audit receipt) or the
 *     retention sweep — never a rewrite that quietly drops a row.
 *
 * Attribution is mandatory. Every item must name the human turn it came from, mirroring
 * `rememberFact`'s rule in `personal-context.ts`: a model cannot promote its own inference
 * into a family's record, and an unattributed item is not writable.
 */

/** Cap on a single memory phrase. Long enough for a real sentence, short enough to stay a label. */
export const MAX_MEMORY_ITEM = 200;

/** Who supplied the item. Deliberately excludes anything content-derived — see `assertWritable`. */
export type MemoryWriteKind = 'person_report' | 'school_profile';

export interface MemoryProvenance {
  /**
   * Identifies the turn this came from.
   *
   * Deliberately NOT called `messageId`: the agent never receives one. `saveMessage` is a bare
   * `insert` with no `select`, so the `message` row id is never read back, and inventing an id
   * that looks like a foreign key but is not would be a lie in the data. This is an attribution
   * key — the conversation plus the parent's own sentence — enough to point a human back at the
   * turn it came from. Use `turnRefFor` to build it.
   */
  turnRef: string;
  kind: MemoryWriteKind;
}

/**
 * Build the attribution key for a turn from the conversation id and the parent's own message.
 * Contains no message content beyond a short digest, so it is not a second copy of the thread.
 */
export function turnRefFor(conversationId: string, parentText: string): string {
  const text = String(parentText ?? '');
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `${conversationId || 'unknown'}#${(h >>> 0).toString(36)}`;
}

export type MemoryRejection =
  | 'empty'
  | 'too_long'
  | 'unattributed'
  | 'content_supplied'
  | 'duplicate'
  | 'unknown_initiative';

/** A refused write. Distinct from a thrown provider error: this is validation, not failure. */
export class MemoryWriteRejected extends Error {
  constructor(
    readonly reason: MemoryRejection,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryWriteRejected';
  }
}

/**
 * Content derived from a form, a school's own document, or a page we scraped is NOT the parent
 * telling us something. Repeating it back does not launder it: this refuses regardless of
 * provenance kind, because the item's *origin* is the untrusted content, not the parent.
 */
function assertWritable(item: string, provenance: MemoryProvenance): string {
  const value = String(item ?? '').trim();
  if (!value) throw new MemoryWriteRejected('empty', 'Refusing to record an empty item.');
  if (value.length > MAX_MEMORY_ITEM) {
    throw new MemoryWriteRejected('too_long', `Refusing to record ${value.length} chars (max ${MAX_MEMORY_ITEM}).`);
  }
  if (!provenance?.turnRef) {
    throw new MemoryWriteRejected('unattributed', 'Refusing to record an item with no originating turn.');
  }
  const kind = provenance.kind as string;
  if (kind !== 'person_report' && kind !== 'school_profile') {
    throw new MemoryWriteRejected(
      'content_supplied',
      `Refusing to record content-supplied memory (kind=${kind}). A form or document is not the parent.`,
    );
  }
  return value;
}

/** Case- and whitespace-insensitive key, so "Free meals" and "free  meals" are one item. */
function keyOf(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Per-guardian serialization.
 *
 * Every mutator below is a read-modify-write of one row. Two concurrent tool calls for the
 * same family would otherwise both load the pre-write value and the second would clobber the
 * first — a lost update that looks like "it forgot what I told it". Queuing per guardian makes
 * the read-modify-write atomic within this process, which is where the writes originate.
 */
const queues = new Map<string, Promise<unknown>>();

function serialize<T>(guardianId: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(guardianId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run on success or failure, so one rejection cannot stall the queue
  queues.set(
    guardianId,
    next.catch(() => undefined),
  );
  return next;
}

/** Test-only: drop the serialization queues between cases. */
export function resetMemoryWriterQueues(): void {
  queues.clear();
}

async function read(guardianId: string): Promise<FamilyMemory> {
  return baseFamilyMemory(await loadFamilyMemory(guardianId));
}

async function write(guardianId: string, memory: FamilyMemory): Promise<FamilyMemory> {
  await persistFamilyMemory(guardianId, memory, mintMemoryWriteProof());
  return memory;
}

/**
 * Record something the family now has (free meals, a bus pass, a 504 plan).
 * Idempotent: recording the same item twice is a no-op, not a second entry.
 */
export async function recordGetting(
  guardianId: string,
  item: string,
  provenance: MemoryProvenance,
): Promise<FamilyMemory> {
  const value = assertWritable(item, provenance);
  return serialize(guardianId, async () => {
    const cur = await read(guardianId);
    if (cur.getting.some((g) => keyOf(g) === keyOf(value))) return cur; // idempotent
    cur.getting = [...cur.getting, value];
    return write(guardianId, cur);
  });
}

function initiativeId(): string {
  return `initiative-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Open a focus the advocate will drive. Re-opening an existing label replaces it rather than
 * duplicating it — a family with four "speech services" initiatives is the noise §4.2 exists
 * to remove, so the writer never creates that state in the first place.
 */
export async function startInitiative(
  guardianId: string,
  label: string,
  provenance: MemoryProvenance,
): Promise<FamilyMemory> {
  const value = assertWritable(label, provenance);
  return serialize(guardianId, async () => {
    const cur = await read(guardianId);
    const initiative: Initiative = {
      id: initiativeId(),
      label: value,
      since: new Date().toISOString(),
      status: 'active',
    };
    const existing = cur.initiatives.find((i) => keyOf(i.label) === keyOf(value));
    // Preserve `since` for a re-opened focus: the family has been waiting since the first ask.
    if (existing) initiative.since = existing.since;
    cur.initiatives = [...cur.initiatives.filter((i) => keyOf(i.label) !== keyOf(value)), initiative];
    return write(guardianId, cur);
  });
}

/**
 * Mark an initiative done or paused. Not new content, so it carries no provenance — but it
 * must name a real initiative. The old implementation silently no-op'd on an unknown id,
 * which reports success for a change that never happened.
 */
export async function setInitiativeStatus(
  guardianId: string,
  id: string,
  status: InitiativeStatus,
): Promise<FamilyMemory> {
  return serialize(guardianId, async () => {
    const cur = await read(guardianId);
    if (!cur.initiatives.some((i) => i.id === id)) {
      throw new MemoryWriteRejected('unknown_initiative', `No initiative ${id} for this family.`);
    }
    cur.initiatives = cur.initiatives.map((i) => (i.id === id ? { ...i, status } : i));
    return write(guardianId, cur);
  });
}

/**
 * Persist a memory object derived from the profile + cases (the hydration path).
 *
 * This is the one write that is not parent-attributed, because it re-derives state the
 * family already recorded elsewhere rather than accepting new content. It goes through the
 * same writer so there is exactly one door to `family_memory`.
 */
export async function persistDerivedMemory(guardianId: string, memory: FamilyMemory): Promise<FamilyMemory> {
  return serialize(guardianId, () => write(guardianId, baseFamilyMemory(memory)));
}
