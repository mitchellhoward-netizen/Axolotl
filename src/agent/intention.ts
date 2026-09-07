import type { FamilyProfile } from '../domain/types.js';

/**
 * Axolotl Intelligence Layer — belief-over-goal + information-gain policy.
 *
 * Grounded in (verified) findings:
 *  - Active Task Disambiguation (Kobalczyk, ICLR 2025): task ambiguity via the objective
 *    indicator 1{h ⊨ R}; BED EIG; **even-partition** is the information-gain-maximizing
 *    question under a uniform prior over H.
 *  - HypoSearch (2026-09): divergent states → hypothesis generation → bounded branches →
 *    comparative aggregation; exploration failures dominate (~78% on BrowseComp).
 *  - DualStake (2026-09): calibrate confidence on **evidence** (E-Conf), not answer.
 *  - Severance (2026-07): structured ignorance — an explicit inventory of the family
 *    dimensions we have NOT confirmed, marked `[unknown]`, with the `decisionFlip` subset.
 *  - Active Inference as Context Acquisition (2026-06): value-of-information rule — acquire
 *    context only when the expected reduction in relevant uncertainty justifies its cost;
 *    `stop`/`commit`/`handoff` are first-class actions.
 *
 * This is intentionally a pure, deterministic core so it can be unit-tested without an LLM or
 * browser. Hypothesis *generation* is injected by the caller (LLM/research); the belief state,
 * info-gain scoring, and the ask/research/stop policy live here.
 */

// ------------------------------------------------------------------ structured ignorance

export type FamilyDimension =
  | 'residency'
  | 'grade'
  | 'school'
  | 'schoolType'
  | 'incomeEligibility'
  | 'language'
  | 'iep504'
  | 'docsOnHand'
  | 'existingEnrollment';

export interface FamilyUnknown {
  dimension: FamilyDimension;
  /** true if the profile already confirms this dimension. */
  known: boolean;
  value?: string;
  /** Absence of this dimension could CHANGE which program/entitlement a family qualifies for. */
  decisionFlip: boolean;
  /** Sensitive (housing/residency) — for displaced families we hand off rather than interrogate. */
  sensitive: boolean;
  /** The clarifying question to ask if we need this dimension. */
  askPrompt: string;
}

/** Priority order for choosing which decision-flip unknown to ask about first (highest first). */
const DIMENSION_PRIORITY: FamilyDimension[] = [
  'residency',
  'schoolType',
  'school',
  'grade',
  'incomeEligibility',
  'iep504',
  'existingEnrollment',
  'docsOnHand',
  'language',
];

const DIMENSION_SPECS: Record<FamilyDimension, { decisionFlip: boolean; sensitive?: boolean; askPrompt: string }> = {
  residency: {
    decisionFlip: true,
    sensitive: true,
    askPrompt: 'Which district or city do you live in now? That determines which enrollment portal and programs apply.',
  },
  schoolType: {
    decisionFlip: true,
    askPrompt: 'Is your child in a public, private, or charter school? Public-school benefits depend on that.',
  },
  school: {
    decisionFlip: true,
    askPrompt: 'Which school does your child go to (or the one nearest you)?',
  },
  grade: {
    decisionFlip: true,
    askPrompt: "What grade is your child in? Program eligibility often depends on it.",
  },
  incomeEligibility: {
    decisionFlip: true,
    askPrompt: 'Do you receive SNAP/CalFresh or does your household income fall under the free-or-reduced-price meal limit?',
  },
  iep504: {
    decisionFlip: true,
    askPrompt: 'Does your child have an IEP or a 504 plan? Special-education services follow a different path.',
  },
  existingEnrollment: {
    decisionFlip: false,
    askPrompt: 'Is your child already enrolled at a school in this district?',
  },
  docsOnHand: {
    decisionFlip: false,
    sensitive: true,
    askPrompt: 'Do you have proof of residency (like a utility bill or lease) and the child’s birth certificate handy?',
  },
  language: {
    decisionFlip: false,
    askPrompt: 'Which language should I send forms and notices in — English or Spanish?',
  },
};

function profileValue(profile: FamilyProfile, dimension: FamilyDimension): { known: boolean; value?: string } {
  switch (dimension) {
    case 'residency':
      return profile.location ? { known: true, value: profile.location } : { known: false };
    case 'schoolType':
      return profile.schoolType && profile.schoolType !== 'unknown'
        ? { known: true, value: profile.schoolType }
        : { known: false };
    case 'school':
      return profile.school ? { known: true, value: profile.school } : { known: false };
    case 'grade':
      return profile.children[0]?.grade
        ? { known: true, value: profile.children[0].grade }
        : { known: false };
    case 'incomeEligibility': {
      const got = (profile.getting ?? []).join(' ').toLowerCase();
      const needs = (profile.needs ?? []).join(' ').toLowerCase();
      const hasMeals = /meal|lunch|breakfast|snap|calfresh|free.{0,3}reduc/.test(got + ' ' + needs);
      return hasMeals ? { known: true, value: 'likely-eligible' } : { known: false };
    }
    case 'iep504': {
      // "speech" or "special needs" is a NEED, not a confirmed IEP/504 status. Only treat it as
      // known if the family explicitly reports an IEP or 504 — otherwise it stays a decision-flip
      // unknown (exactly the fuzzy case: needing speech services doesn't mean they have an IEP).
      const c = (profile.challenges ?? []).join(' ').toLowerCase();
      const hasIep = /\b(iep|504)\b/.test(c);
      return hasIep ? { known: true, value: 'has-iep-504' } : { known: false };
    }
    case 'existingEnrollment':
      return profile.school ? { known: true, value: profile.school } : { known: false };
    case 'docsOnHand':
      return { known: false };
    case 'language':
      return profile.locale ? { known: true, value: profile.locale } : { known: false };
  }
}

/** Build the structured-ignorance inventory for a family (Severance schema, family-domain). */
export function structuredIgnorance(profile: FamilyProfile): FamilyUnknown[] {
  return (Object.keys(DIMENSION_SPECS) as FamilyDimension[]).map((dimension) => {
    const spec = DIMENSION_SPECS[dimension]!;
    const { known, value } = profileValue(profile, dimension);
    return { dimension, known, value, decisionFlip: spec.decisionFlip, sensitive: spec.sensitive ?? false, askPrompt: spec.askPrompt };
  });
}

/**
 * The decision-flip unknowns we have NOT yet confirmed. Pass `allowSensitive = false` in a
 * displaced/homeless/housing-sensitive context so the agent never interrogates residency/housing.
 */
export function unknownDecisionFlips(unknowns: FamilyUnknown[], allowSensitive = true): FamilyUnknown[] {
  return unknowns
    .filter((u) => u.decisionFlip && !u.known && (allowSensitive || !u.sensitive))
    .sort((a, b) => DIMENSION_PRIORITY.indexOf(a.dimension) - DIMENSION_PRIORITY.indexOf(b.dimension));
}

/** Pick the clarifying question targeting the highest-value decision-flip unknown (or null if none). */
export function askFromUnknowns(unknowns: FamilyUnknown[], allowSensitive = true): string | null {
  const flip = unknownDecisionFlips(unknowns, allowSensitive);
  return flip[0]?.askPrompt ?? null;
}

// ------------------------------------------------------------------ belief state / hypotheses

export type SubClaimKind = 'formUrl' | 'deadline' | 'eligibility' | 'contact' | 'docs';

export interface SubClaim {
  kind: SubClaimKind;
  value?: string;
  /** Has this piece of grounding been confirmed against an authoritative source? */
  attested: boolean;
  source?: string;
}

export interface Hypothesis {
  id: string;
  claim: string;
  program?: string;
  /** A soft direction label (HypoSearch): a direction to explore, NOT a claim to prove. */
  direction: string;
  subClaims: SubClaim[];
  /** 0..1 — belief that this hypothesis is the right one (which program/form applies). */
  belief: number;
  /** 0..1 — evidence-confidence (DualStake E-Conf): how well-attested the grounding is. */
  evidenceConfidence: number;
  /**
   * What this hypothesis ASSUMES along decision-flip dimensions. Used to compute the information
   * gain of a clarifying question: a question that splits the hypotheses by their differing
   * assumptions is informative (TAD even-partition rule). A hypothesis with no stated assumption
   * for a dimension clusters into a '?' bucket and thus lowers that question's EIG.
   */
  assumptions?: Partial<Record<FamilyDimension, string>>;
}

export type IntentionStatus = 'divergent' | 'concentrated' | 'committed' | 'unresolvable';

export interface Intention {
  message: string;
  profile: FamilyProfile;
  unknowns: FamilyUnknown[];
  hypotheses: Hypothesis[];
  status: IntentionStatus;
  divergenceReason?: string;
  /** Human-readable trace of why this status/decision (for transparency, and later Ask-F1 labels). */
  reasoning: string;
}

/** Normalize beliefs to a distribution and return Shannon entropy (bits). */
export function beliefEntropy(hypotheses: Hypothesis[]): number {
  const total = hypotheses.reduce((s, h) => s + h.belief, 0);
  if (total <= 0 || hypotheses.length === 0) return 0;
  let entropy = 0;
  for (const h of hypotheses) {
    const p = h.belief / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Evidence-confidence required for a hypothesis to be treated as committed (DualStake: real grounding, not belief). */
export const EVIDENCE_COMMIT_THRESHOLD = 0.6;
/** Belief dominance threshold for picking a directional leader when evidence is weak (miscalibrated LLM prior). */
export const BELIEF_DOMINANCE = 0.65;

/**
 * The hypothesis we COMMIT to is the best-EVIDENCED one (highest evidence-confidence above the
 * commit threshold) — NOT the highest raw LLM belief. LLM beliefs are miscalibrated (DualStake),
 * whereas attestation is real; so evidence, not belief concentration, gates the commitment.
 */
export function committedHypothesis(hypotheses: Hypothesis[]): Hypothesis | null {
  if (hypotheses.length === 0) return null;
  const best = [...hypotheses].sort((a, b) => b.evidenceConfidence - a.evidenceConfidence)[0]!;
  return best.evidenceConfidence >= EVIDENCE_COMMIT_THRESHOLD ? best : null;
}

/** The candidate to act on: the committed (best-evidenced) hypothesis, else the directional belief leader. */
export function concentrated(hypotheses: Hypothesis[], beliefThreshold = BELIEF_DOMINANCE): Hypothesis | null {
  const commit = committedHypothesis(hypotheses);
  if (commit) return commit;
  const total = hypotheses.reduce((s, h) => s + h.belief, 0) || 1;
  const best = [...hypotheses].sort((a, b) => b.belief - a.belief)[0]!;
  return best.belief / total >= beliefThreshold ? best : null;
}

export function divergence(hypotheses: Hypothesis[], beliefThreshold = BELIEF_DOMINANCE): IntentionStatus {
  if (hypotheses.length === 0) return 'unresolvable';
  if (committedHypothesis(hypotheses)) return 'committed';
  if (concentrated(hypotheses, beliefThreshold)) return 'concentrated';
  if (hypotheses.length >= 2) return 'divergent';
  return 'concentrated';
}

// ------------------------------------------------------------------ information gain (BED / even-partition)

/**
 * Expected information gain of a question, under a **uniform prior over H** (TAD's uniformity
 * assumption). A question's answers partition H into buckets; EIG = H(prior) − E[H(posterior)].
 * Max when the answer buckets are **equal-sized** (TAD Corollary 1).
 */
export function eigForPartition(bucketSizes: number[], total: number): number {
  if (total <= 0) return 0;
  const priorEntropy = Math.log2(total);
  let expectedPosterior = 0;
  for (const n of bucketSizes) {
    if (n <= 0) continue;
    const p = n / total;
    // Posterior after landing in a bucket is uniform over that bucket => log2(n).
    expectedPosterior += p * Math.log2(n);
  }
  return Math.max(0, priorEntropy - expectedPosterior);
}

export interface CandidateAction {
  kind: 'ask' | 'research';
  label: string;
  /** Friction for asking; tokens/minutes for research (the ACI cost term). */
  cost: number;
  /** How this action splits the hypothesis space (bucket = hypotheses giving the same answer/evidence). */
  partitionSizes: number[];
}

export interface ScoredAction extends CandidateAction {
  eig: number;
  /** eig normalized by cost — the "is it worth it" signal. */
  score: number;
}

/** Score each candidate action by `eig − cost`; the even-partition rule drives `eig`. */
export function scoreActions(actions: CandidateAction[], total: number): ScoredAction[] {
  return actions.map((a) => {
    const eig = eigForPartition(a.partitionSizes, total);
    return { ...a, eig, score: eig - a.cost };
  });
}

/**
 * Build the candidate clarifying questions from the UNCONFIRMED decision-flip unknowns, each scored
 * by how well it discriminates the current hypothesis space. We group the hypotheses by the value
 * each ASSUMES for the dimension, and a question only counts if that split is non-trivial (eig > 0).
 * These are *family-private* facts that research cannot resolve, so the value-of-information policy
 * prefers them over research when present.
 */
export function buildAskCandidates(
  unknowns: FamilyUnknown[],
  hypotheses: Hypothesis[],
  askCost: number,
  allowSensitive = true,
): CandidateAction[] {
  const out: CandidateAction[] = [];
  for (const u of unknownDecisionFlips(unknowns, allowSensitive)) {
    const buckets = new Map<string, number>();
    for (const h of hypotheses) {
      const key = h.assumptions?.[u.dimension] ?? '?';
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const sizes = [...buckets.values()];
    const eig = eigForPartition(sizes, hypotheses.length);
    // Only a genuinely discriminating (≥2 buckets, eig > 0) question is worth considering.
    if (buckets.size < 2 || eig <= 0) continue;
    out.push({ kind: 'ask', label: u.askPrompt, cost: askCost, partitionSizes: sizes });
  }
  return out;
}

// ------------------------------------------------------------------ value-of-information decision (ACI)

export interface IntentionDecision {
  action: 'ask' | 'research' | 'commit' | 'handoff';
  reason: string;
  question?: string;
  researchQuery?: string;
  evidenceNeeded?: SubClaimKind[];
  scored: ScoredAction[];
}

export interface PolicyOptions {
  /** value-of-information threshold — acquiring context is only worth it if eig > cost by this much. */
  minValue: number;
  /** budget of context actions left this turn. */
  budgetUsed: number;
  budgetCap: number;
  askCost: number;
  /** For an 'ask', the fallback decision-flip question if no candidate action is better. */
  decisionFlipQuestion?: string | null;
  /** When false, sensitive dimensions (housing/residency) are excluded from ask candidates. */
  allowSensitive?: boolean;
  evidenceNeeded?: SubClaimKind[];
  /** If provided, used as the research query when grounding a concentrated-but-unattested hypothesis. */
  groundQuery?: string;
}

/** The sub-clam kinds that are not yet attested (the grounding we must confirm before commit). */
export function unAttestedKinds(h: Hypothesis): SubClaimKind[] {
  return h.subClaims.filter((s) => !s.attested).map((s) => s.kind);
}

/** A research query that grounds a concentrated hypothesis (DualStake: evidence-confidence for commit). */
export function groundingQueryFor(h: Hypothesis): string {
  const needed = unAttestedKinds(h);
  return `${h.claim} — verify the ${needed.join(', ') || 'details'}`;
}

/**
 * ACI value-of-information decision over the shared hypothesis space.
 *
 * Branches on the belief status (HypoSearch + DualStake + ACI):
 *  - **committed**  → belief concentrated & grounding attested → **commit**.
 *  - **concentrated** → belief concentrated but evidence weak → **research to GROUND** the winning
 *    hypothesis' sub-claims (evidence-confidence must reach the commit threshold); discriminating
 *    EIG is ~0 here, so this is a grounding action, not a discriminating one.
 *  - **divergent**  → several plausible directions. Prefer an unconfirmed **family-private
 *    decision-flip** ask (research can't resolve a private fact about the family); if none, choose
 *    the highest `eig − cost` **research** action to discriminate; else ask a decision-flip.
 *  - **unresolvable** / budget exhausted / nothing clears the threshold → **handoff** (never
 *    fabricate a URL or deadline).
 */
export function decide(
  intention: Intention,
  researchActions: CandidateAction[],
  opts: PolicyOptions,
): IntentionDecision {
  const { hypotheses, unknowns } = intention;
  const status = divergence(hypotheses);
  const count = hypotheses.length;
  const best = concentrated(hypotheses);

  if (status === 'committed' && best) {
    return {
      action: 'commit',
      reason: `Belief concentrated on "${best.claim}" with grounded evidence — committing.`,
      scored: [],
    };
  }

  if (opts.budgetUsed >= opts.budgetCap) {
    return {
      action: 'handoff',
      reason: 'Context-acquisition budget exhausted; asking the parent rather than guessing.',
      question: opts.decisionFlipQuestion ?? undefined,
      scored: [],
    };
  }

  // Concentrated but not yet attested -> ground the winning hypothesis so we can commit (DualStake).
  if (status === 'concentrated' && best) {
    const needed = unAttestedKinds(best);
    return {
      action: 'research',
      reason: `Belief concentrated on "${best.claim}" but evidence is not yet attested — grounding before commit.`,
      researchQuery: opts.groundQuery ?? groundingQueryFor(best),
      evidenceNeeded: needed,
      scored: [],
    };
  }

  // Priority: a family-private decision-flip ask over research, because research can't answer it.
  const askCandidates = buildAskCandidates(unknowns, hypotheses, opts.askCost, opts.allowSensitive ?? true);
  const scoredAsks = scoreActions(askCandidates, count);
  const bestAsk = scoredAsks
    .filter((a) => a.score > opts.minValue)
    .sort((a, b) => b.score - a.score)[0];
  if (bestAsk) {
    return {
      action: 'ask',
      reason: `Unconfirmed family-private decision-flip factor — ask the most informative one first (eig ${bestAsk.eig.toFixed(2)} − cost ${bestAsk.cost}).`,
      question: bestAsk.label,
      scored: scoredAsks,
    };
  }

  // No private decision-flip ask remains informative -> ground public info via research.
  const scored = scoreActions(researchActions, count);
  const bestResearch = scored
    .filter((a) => a.score > opts.minValue)
    .sort((a, b) => b.score - a.score)[0];

  if (bestResearch) {
    return {
      action: 'research',
      reason: `Research query has the highest value-of-information (eig ${bestResearch.eig.toFixed(2)} − cost ${bestResearch.cost}). ` +
        `Gathering grounding for ${bestResearch.label}.`,
      researchQuery: bestResearch.label,
      evidenceNeeded: opts.evidenceNeeded,
      scored,
    };
  }

  // No action is worth its cost. If a decision-flip unknown remains, ask it; else honest handoff.
  if (opts.decisionFlipQuestion) {
    return {
      action: 'ask',
      reason: `No action clears the information threshold, but a decision-flip unknown remains: ${opts.decisionFlipQuestion}`,
      question: opts.decisionFlipQuestion,
      scored: [],
    };
  }
  return {
    action: 'handoff',
    reason: 'Residual uncertainty is not worth the cost of acquiring more context; telling the parent honestly rather than guessing.',
    scored: [],
  };
}

// ------------------------------------------------------------------ Ask-F1 instrumentation (HiL-Bench)

/**
 * Measures the ask layer, per HiL-Bench's **Ask-F1** — the harmonic mean of *question-precision*
 * (of the questions we asked, how many were necessary/relevant, not spam) and *blocker-recall*
 * (of the true blockers, how many we surfaced). This is how we stop over-asking and start catching
 * the blockers that genuinely block the family.
 */
export class AskF1Tracker {
  private asked = 0;
  private relevant = 0;
  private blockersTotal = 0;
  private blockersSurfaced = 0;

  /** Record that we asked a clarifying question. */
  recordAsk(relevant: boolean): void {
    this.asked++;
    if (relevant) this.relevant++;
  }
  /** Record a ground-truth blocker (a real obstacle the family faces). */
  recordBlocker(surfaced: boolean): void {
    this.blockersTotal++;
    if (surfaced) this.blockersSurfaced++;
  }
  /** question-precision: of the questions asked, the fraction that were actually necessary. */
  get precision(): number {
    return this.asked === 0 ? 0 : this.relevant / this.asked;
  }
  /** blocker-recall: of the true blockers, the fraction we surfaced. */
  get recall(): number {
    return this.blockersTotal === 0 ? 0 : this.blockersSurfaced / this.blockersTotal;
  }
  /** Ask-F1: harmonic mean of precision and recall (0 if either is 0). */
  get askF1(): number {
    const p = this.precision;
    const r = this.recall;
    return p + r === 0 ? 0 : (2 * p * r) / (p + r);
  }
  get summary(): string {
    return `asked=${this.asked} relevant=${this.relevant} precision=${this.precision.toFixed(2)} ` +
      `blockers=${this.blockersTotal} surfaced=${this.blockersSurfaced} recall=${this.recall.toFixed(2)} Ask-F1=${this.askF1.toFixed(2)}`;
  }
}

/** Assemble the belief state from a message + profile + a hypothesis set (hypotheses come from caller/LLM). */
export function buildIntention(
  message: string,
  profile: FamilyProfile,
  hypotheses: Hypothesis[],
): Intention {
  const unknowns = structuredIgnorance(profile);
  const status = divergence(hypotheses);
  const best = concentrated(hypotheses);
  const divFlips = unknownDecisionFlips(unknowns);

  const reasoning = status === 'committed'
    ? `Committed to "${best?.claim}" (evidence-confident).`
    : status === 'divergent'
      ? `Divergent state: ${hypotheses.length} plausible directions, no dominant one. ` +
        `Unconfirmed decision-flip dimensions: ${divFlips.map((u) => u.dimension).join(', ') || 'none'}.`
      : status === 'concentrated'
        ? `Belief concentrated on "${best?.claim}" but evidence not yet attested — ground it before committing.`
        : 'No plausible hypotheses; cannot resolve from current evidence.';

  return {
    message,
    profile,
    unknowns,
    hypotheses,
    status,
    divergenceReason: status === 'divergent' ? `entropy ${beliefEntropy(hypotheses).toFixed(2)} bits over ${hypotheses.length} directions` : undefined,
    reasoning,
  };
}

// ------------------------------------------------------------------ LLM hypothesis mapping + grounding

export interface RawHypothesis {
  claim: string;
  direction: string;
  program?: string;
  assumptions?: Record<string, string>;
  belief: number;
}

/**
 * Map LLM-generated hypotheses (the "solution space") onto the `Intention` Hypothesis shape.
 * Sub-claims start unattested (evidence-confidence is 0 until research grounds them), and each
 * hypothesis is expected to need at least a form URL + deadline + eligibility/contact to commit.
 */
export function hypothesesFromLLM(raw: RawHypothesis[]): Hypothesis[] {
  return raw.map((r, i) => {
    const subClaims = [
      { kind: 'formUrl' as const, attested: false },
      { kind: 'deadline' as const, attested: false },
      { kind: 'eligibility' as const, attested: false },
      { kind: 'contact' as const, attested: false },
    ];
    return {
      id: `llm-${i}`,
      claim: r.claim,
      direction: r.direction,
      program: r.program,
      subClaims,
      belief: r.belief,
      evidenceConfidence: 0,
      assumptions: r.assumptions as Hypothesis['assumptions'],
    };
  });
}

/**
 * Ground the leading hypothesis by attesting its sub-claims from real research. `researchFn` is
 * injected (the agent supplies a function that runs the browser/knowledge graph); it returns
 * grounded claim results. This is the DualStake "evidence confidence" step: a hypothesis may be
 * strongly believed, but can only COMMIT once its grounding (form URL, deadline, contact) is real.
 */
export function groundIntention(
  intention: Intention,
  researchFn: (claim: string, kinds: SubClaimKind[]) => Promise<Partial<Record<SubClaimKind, { value: string; source: string }> | null>>,
): Promise<Intention> {
  const best = concentrated(intention.hypotheses);
  if (!best) return Promise.resolve(intention); // nothing dominant to ground
  const needed = unAttestedKinds(best);
  return researchFn(best.claim, needed).then((grounded) => {
    if (!grounded) return intention;
    const byId = new Map(intention.hypotheses.map((h) => [h.id, h]));
    const target = byId.get(best.id);
    if (!target) return intention;
    const next = { ...target, subClaims: target.subClaims.map((s) => s.attested ? s : { ...s, attested: !!grounded[s.kind], value: grounded[s.kind]?.value, source: grounded[s.kind]?.source }) };
    const attestedCount = next.subClaims.filter((s) => s.attested).length;
    next.evidenceConfidence = next.subClaims.length ? attestedCount / next.subClaims.length : 0;
    byId.set(next.id, next);
    const hypotheses = [...byId.values()];
    return buildIntention(intention.message, intention.profile, hypotheses);
  });
}

export interface EvidenceNode {
  title?: string;
  summary?: string;
  url?: string;
}

const DEADLINE_RE = /(?:by|before|due|deadline|on|until)\s+(?:\w+\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?/i;
const CONTACT_RE = /[\w.+-]+@[\w-]+\.[\w.]+|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const ELIGIBILITY_RE = /\bfree\b.{0,3}\band\b.{0,3}\breduced\b|\bfree\/reduced\b|\bsnap\b|\bcalfresh\b|\bfood\s+(?:stamps|assistance)\b|\bincome\b.{0,12}eligib|18[0-9]%\s*(?:of|\bthe\b)?\s*.*?\bfederal\s+poverty\b|\bfederal\s+poverty|low.{0,6}income/i;

/**
 * Attest each requested sub-claim kind ONLY from evidence that genuinely supports THAT kind.
 * A single node is never permitted to attest every kind: `deadline`, `contact`, and `eligibility`
 * require the evidence to actually contain a date, an email/phone, or an eligibility signal
 * respectively. `formUrl` uses a real node URL. Any kind without genuine evidence is left out, so
 * the hypothesis can only reach `committed` on real grounding (and under-commits otherwise).
 */
export function extractGrounding(
  nodes: EvidenceNode[],
  kinds: SubClaimKind[],
): Partial<Record<SubClaimKind, { value: string; source: string }>> | null {
  if (!nodes.length) return null;
  const out: Partial<Record<SubClaimKind, { value: string; source: string }>> = {};
  const top = nodes[0]!;
  if (kinds.includes('formUrl') && top.url) out.formUrl = { value: top.url, source: top.title ?? top.url };

  const scan = (re: RegExp): { value: string; source: string } | null => {
    for (const n of nodes) {
      const text = `${n.summary ?? ''} ${n.title ?? ''}`;
      const m = text.match(re);
      if (m?.[0]) return { value: m[0], source: n.title || text };
    }
    return null;
  };

  if (kinds.includes('deadline')) {
    const d = scan(DEADLINE_RE);
    if (d) out.deadline = d;
  }
  if (kinds.includes('contact')) {
    const c = scan(CONTACT_RE);
    if (c) out.contact = c;
  }
  if (kinds.includes('eligibility')) {
    const e = scan(ELIGIBILITY_RE);
    if (e) out.eligibility = e;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Deterministic hypothesis generator — a STAND-IN for LLM "solution generation". In production the
 * caller generates these from the fuzzy message + profile with an LLM (the model's strength, per
 * TAD's load-shifting insight); this stub lets the belief/policy layer run and be tested offline
 * before the LLM hook is wired. Return [] when the message isn't genuinely multi-hypothesis.
 */
export function hypothesize(message: string, profile: FamilyProfile): Hypothesis[] {
  const t = message.toLowerCase();
  const known = (d: string) => t.includes(d);

  // Enrollment / relocation — several paths hang on schoolType + prior enrollment.
  if (known('moved') || known('move') || known('enroll') || known('relocat') || known('transfer') || known('new school') || known('register')) {
    return [
      h('enroll-new', 'New-student online enrollment (district portal)', 'New-student online enrollment via the district portal.', subCl('formUrl', 'contact'), 0.5, 0.1, { schoolType: 'public', existingEnrollment: 'no' }),
      h('enroll-transfer', 'Transfer for a child already enrolled elsewhere', 'Change-of-residency transfer (child already enrolled in a school).', subCl('formUrl', 'deadline'), 0.3, 0.1, { schoolType: 'public', existingEnrollment: 'yes' }),
      h('enroll-alt', 'Alternative school / charter / private path', 'Charter, private, or alternative-school enrollment.', subCl('eligibility'), 0.2, 0.1, { schoolType: 'charter-or-private' }),
    ];
  }

  // Special education / speech — the key unknown is whether an IEP already exists.
  if (known('speech') || known('special') || known('therap') || known('iep') || known('504') || known('evaluation') || known('services')) {
    return [
      h('sped-eval', 'Request a speech/language IEP evaluation', 'Special-education assessment request (child has no IEP yet).', subCl('formUrl', 'contact'), 0.35, 0.1, { iep504: 'no-iep' }),
      h('sped-iep', 'Ask for services under an existing IEP', 'Add speech as a service under the child’s existing IEP.', subCl('formUrl', 'deadline'), 0.4, 0.1, { iep504: 'has-iep' }),
      h('sped-504', 'Pursue a 504 / Student Study Team', '504 plan or Student Study Team (an alternative to an IEP).', subCl('contact'), 0.25, 0.1, { iep504: 'no-iep' }),
    ];
  }

  // Meals / income eligibility.
  if (known('lunch') || known('breakfast') || known('meal') || known('food') || known('free') || known('reduc') || known('snap') || known('calfresh')) {
    return [
      h('meals-snap', 'Directly eligible via SNAP/CalFresh', 'Categorical eligibility through SNAP/CalFresh.', subCl('eligibility'), 0.4, 0.1, { incomeEligibility: 'snap' }),
      h('meals-income', 'Income-based free/reduced-price', 'Household-income-based free/reduced lunch.', subCl('eligibility', 'formUrl'), 0.4, 0.1, { incomeEligibility: 'income' }),
      h('meals-none', 'Not eligible', 'Household exceeds the income threshold.', subCl('eligibility'), 0.2, 0.1, { incomeEligibility: 'not' }),
    ];
  }

  return [];
}

function h(id: string, claim: string, direction: string, subClaims: SubClaim[], belief: number, evidenceConfidence: number, assumptions: Hypothesis['assumptions']): Hypothesis {
  return { id, claim, direction, subClaims, belief, evidenceConfidence, assumptions };
}
function subCl(...kinds: SubClaimKind[]): SubClaim[] {
  return kinds.map((kind) => ({ kind, attested: false }));
}

/**
 * Resolve a fuzzy message into an actionable decision, or null if it isn't genuinely ambiguous.
 * A convenient single call for the agent's "unknown intent" seam: surfaces the most informative ask
 * (or an honest handoff) instead of giving up with a canned "I don't understand".
 */
export function resolveFuzzyMessage(
  message: string,
  profile: FamilyProfile,
  opts?: Partial<PolicyOptions>,
): { decision: IntentionDecision; intention: Intention } | null {
  const hypotheses = hypothesize(message, profile);
  if (hypotheses.length < 2) return null; // not genuinely multi-hypothesis
  const intention = buildIntention(message, profile, hypotheses);
  const policy: PolicyOptions = {
    minValue: 0.05,
    budgetUsed: 0,
    budgetCap: 3,
    askCost: 0.4,
    decisionFlipQuestion: askFromUnknowns(intention.unknowns),
    ...opts,
  };
  return { decision: decide(intention, [], policy), intention };
}
