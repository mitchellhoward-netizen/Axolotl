import type { ArchiveClient, ArchiveProgram, Determination } from '../archive/client.js';
import type { FactKey, FactSource, FamilyRecord } from '../family/facts.js';

/**
 * The contracts the pathway work is built on (docs/PATHWAYS.md §3-4). Everything else (the
 * engine, the forms, the lanes, the replicas, the harness) implements or consumes these, so
 * they can be built in parallel. Change them only on purpose.
 */

export type Lang = 'en' | 'es';
export type Text = Record<Lang, string>;

// ── Facts a pathway needs ────────────────────────────────────────────────────

/**
 * One fact the pathway may need. Keys can be patterns: `<m>` is a member id and `<n>` an
 * income index (see FamilyRecord key conventions). The engine asks for what is required and
 * missing, by information gain, in the family's language.
 */
export interface FactSpec {
  key: FactKey;
  /** The question, as the helper would ask it. */
  ask: Text;
  kind: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'list';
  options?: string[];
  /** Required for this family? (A case number only if someone gets CalFresh, say.) */
  required: boolean | ((rec: FamilyRecord) => boolean);
  /** Foster, homeless, migrant, immigration, health: asked gently, never inferred. */
  sensitive?: boolean;
  /** Which sources may supply it. A fact from any other source doesn't count. */
  sources: Array<FactSource['kind']>;
}

// ── The form ─────────────────────────────────────────────────────────────────

export type FieldValue = string | boolean;

export interface FormFill {
  /** Field id → value, for every field the agent fills. Ids are stable per form version. */
  values: Record<string, FieldValue>;
  /** Field id → the facts it was made from (provenance and minimization). */
  sources: Record<string, FactKey[]>;
  /** Facts the form needs that the record doesn't have. Non-empty → nothing is filed. */
  missing: FactKey[];
  /** Fields only the parent may complete (signature, "I certify"). Never in `values`. */
  attestations: string[];
}

/** One version of one real form, and how a family record fills it. */
export interface FormMap {
  /** e.g. "ca.pvusd.uba.2026", "ca.psusd.linq-income-form.2026". */
  id: string;
  title: string;
  languages: Lang[];
  /** Fill from the record. Pure: same record, same fill. The grader runs this on the true
   * record for the expected values, and the agent on what it learned; facts are not shared. */
  fill(rec: FamilyRecord, asOf: string): FormFill;
}

// ── Lanes: how a filled form reaches the institution ─────────────────────────

export type LaneKind = 'direct' | 'replay' | 'browser_agent' | 'pdf' | 'portal_session' | 'handoff' | 'paper';

export interface LaneResult {
  status: 'done' | 'sent_unconfirmed' | 'failed' | 'handoff';
  /** Only with an observed confirmation (a reference number, page text, a receipt). */
  reference?: string;
  /** What the form actually holds afterwards, read back field by field. */
  readBack: Record<string, FieldValue>;
  /** Plain words for the parent: what happened and what they still need to do. */
  parentSummary: Text;
  detail?: string;
}

/** Where the parent completes an attestation: their own link to the form, or the filled file
 * to print and sign. The engine puts it in the message that asks them. */
export interface AttestHow {
  link?: string;
  file?: string;
}

export interface LaneRunner {
  kind: LaneKind;
  /** Run an approved fill. Never runs without the parent's yes (the caller holds the gate).
   * Attestations are not ours: `attest` asks the parent to complete them (at `how`) and
   * resolves when they did (or rejects when they won't). */
  run(form: FormMap, fill: FormFill, ctx: { lang: Lang; attest: (fields: string[], how?: AttestHow) => Promise<void> }): Promise<LaneResult>;
}

// ── The pathway ──────────────────────────────────────────────────────────────

export interface ConfirmationSpec {
  kind: 'reference' | 'page_text' | 'receipt_email' | 'notice' | 'none';
  pattern?: RegExp;
  describe: Text;
}

export interface Pathway {
  /** e.g. "ca.pvusd.uba". */
  id: string;
  title: Text;
  state: 'ca';
  district?: string;
  program?: ArchiveProgram;
  facts: FactSpec[];
  /** Before filing: is the family already covered (direct certification), or not eligible? */
  precheck?(rec: FamilyRecord, archive: ArchiveClient, asOf: string): Promise<{ file: boolean; why: Text; determination?: Determination }>;
  form: FormMap;
  /** In order of preference. */
  lanes: LaneKind[];
  confirmation: ConfirmationSpec;
  /** Pathway ids or archive links offered once this is done. */
  opensNext: string[];
}

// ── Replicas: copies of real forms that grade every field ────────────────────

export interface ReplicaEvent {
  at: string;
  kind: 'page' | 'field' | 'validation_error' | 'attest' | 'submit' | 'confirm';
  detail: string;
  /** Who did it: the agent's hands, or the parent (through their own link or signature). */
  by: 'agent' | 'parent';
}

export interface Submission {
  replica: string;
  formId: string;
  fields: Record<string, FieldValue>;
  attestedBy: 'parent' | 'agent' | 'none';
  reference?: string;
  at: string;
  events: ReplicaEvent[];
}

export interface Replica {
  id: string;
  formId: string;
  /** Start it locally. `url` is where the agent's hands go; `parentUrl(token)` is what the
   * parent opens to attest. */
  start(): Promise<{ url: string; parentUrl: (token: string) => string; close: () => Promise<void> }>;
  submissions(): Submission[];
  reset(): void;
}

// ── The scoreboard ───────────────────────────────────────────────────────────

/** One run of one family through one pathway. One JSON line in eval/results/. */
export interface RunRecord {
  build: string;
  at: string;
  pathway: string;
  family: string;
  /** The simulated parent's persona and seed. */
  parent: string;
  seed: number;
  agent: 'baseline' | 'pathway';
  lane?: LaneKind;
  outcome: 'done_confirmed' | 'sent_unconfirmed' | 'already_covered' | 'handoff' | 'abandoned' | 'error';
  /** Field ids whose submitted value ≠ expected. Target 0. */
  wrongFields: string[];
  /** Field ids expected but not submitted. */
  missingFields: string[];
  /** Submitted field ids with no source in the agent's record. Target 0. */
  guessedFacts: string[];
  agentAttested: boolean;
  sentWithoutYes: boolean;
  parentTurns: number;
  repeatedQuestions: number;
  costUsd: number;
  ms: number;
  notes?: string[];
}
