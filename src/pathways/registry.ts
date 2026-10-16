import type { FactKey } from '../family/facts.js';
import type { LaneKind, LaneRunner, Pathway, Text } from './types.js';

/**
 * Where pathways and lanes are registered, by id and by kind. The engine looks a pathway up
 * here when a session starts, and picks the first registered lane in the pathway's order of
 * preference when the parent says yes.
 *
 * Empty on purpose for now: each pathway module (e.g. src/pathways/ca-pvusd-uba.ts) and each
 * lane (src/lanes/*.ts) registers itself, and tests build their own registry.
 */

/**
 * What the engine can use beyond the `Pathway` contract. All optional; without them the engine
 * still works (form order, ids as labels, precheck just before the proposal). Kept beside the
 * pathway, not in types.ts, so the contract doesn't change; see the notes in the report.
 */
export interface PathwayHints {
  /** The facts `precheck` needs. When they are all in, precheck runs (before more questions).
   * Without this, precheck runs once the form has nothing missing, before the proposal. */
  precheckFacts?: FactKey[];
  /** Answers that end the form: when `when(value)` holds, precheck will say the family is
   * already covered, so no other question is needed. `prior` is how likely that answer is
   * (default 0.3). This is what makes "do you get CalFresh?" the first question. */
  shortCircuit?: Record<FactKey, { when: (value: unknown) => boolean; prior?: number }>;
  /** Facts asked together in one message, with the combined question. Keys may be patterns. */
  groups?: Array<{ keys: FactKey[]; ask?: Text }>;
  /** Form field id → the label the parent sees in the proposal. */
  labels?: Record<string, Text>;
  /** Why we ask a sensitive fact, in plain words. Keys may be patterns. */
  why?: Record<FactKey, Text>;
  /** Extra words that name a fact in a parent's message ("cupones" for CalFresh). */
  cues?: Record<FactKey, RegExp>;
  /** A parent's message that starts this pathway when no session is active. */
  trigger?: RegExp;
  /** What the form is and why, said in the first message of a session (with "do I have to?"). */
  intro?: Text;
  /** The form's name in a sentence ("Palm Springs Unified's Income Form"). Default: its title. */
  introName?: Text;
  /** The household mode: the parent's name, who lives at home, each adult's income, each
   * child's status and the address are asked in that order and read by household.ts. Member
   * ids follow the archive (p, q, c1…, g1…). */
  people?: boolean;
  /** Side questions about the form, answered in place ("does this affect my immigration
   * status?"). Matched on question sentences (or any sentence, with `statement`), accents off. */
  faq?: FaqEntry[];
  /** What a good answer looks like, for "I didn't catch that" and "what do you mean?". */
  examples?: Record<FactKey, Text>;
  /** Where to find a fact the parent doesn't have at hand ("it's on your CalFresh letter"). */
  where?: Record<FactKey, Text>;
  /** The household question for each child's status (foster, homeless, migrant). */
  flagAsk?: Record<string, Text>;
  /** Field labels by the field id's last part ("dob" → "date of birth"), shown after whose it is. */
  fieldLabels?: Record<string, Text>;
  /** Optional facts the form has a place for, asked once before the proposal. */
  optional?: FactKey[];
}

export interface FaqEntry {
  id: string;
  match: RegExp;
  answer: Text;
  /** Also answer when it's said, not asked ("my son is sick tomorrow"). */
  statement?: boolean;
}

interface Entry {
  pathway: Pathway;
  hints: PathwayHints;
}

export class PathwayRegistry {
  private readonly byId = new Map<string, Entry>();
  private readonly lanes = new Map<LaneKind, LaneRunner>();

  registerPathway(pathway: Pathway, hints: PathwayHints = {}): this {
    this.byId.set(pathway.id, { pathway, hints });
    return this;
  }

  registerLane(lane: LaneRunner): this {
    this.lanes.set(lane.kind, lane);
    return this;
  }

  pathway(id: string): Pathway | undefined {
    return this.byId.get(id)?.pathway;
  }

  hints(id: string): PathwayHints {
    return this.byId.get(id)?.hints ?? {};
  }

  lane(kind: LaneKind): LaneRunner | undefined {
    return this.lanes.get(kind);
  }

  /** The first lane we have, in the pathway's order of preference. */
  laneFor(pathway: Pathway): LaneRunner | undefined {
    for (const kind of pathway.lanes) {
      const lane = this.lanes.get(kind);
      if (lane) return lane;
    }
    return undefined;
  }

  list(): Pathway[] {
    return [...this.byId.values()].map((e) => e.pathway);
  }

  /** The pathway whose trigger this message matches, if exactly one does. */
  match(text: string): Pathway | undefined {
    const hits = [...this.byId.values()].filter((e) => e.hints.trigger?.test(text));
    return hits.length === 1 ? hits[0]!.pathway : undefined;
  }
}

/** The process-wide registry the agent uses. */
export const pathways = new PathwayRegistry();
