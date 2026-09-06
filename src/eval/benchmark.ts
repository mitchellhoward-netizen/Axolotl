import { isOfficialUrl } from '../domain/evidence.js';

/**
 * SchoolBureaucracyBench — evaluation harness. Measures the component skills
 * SEPARATELY (no single binary "task success"), on a fixed-corpus + ground-truth
 * bundle, per `school-agent-research/06-benchmark.md`. The deterministic scorer
 * below computes what needs no judge; answer/eligibility *correctness* is a hook
 * for an LLM judge or human grading (stubbed — see `judgeAnswer`).
 */

export interface GroundTruth {
  /** Authoritative source URLs the agent should discover. */
  authoritativeSources: string[];
  answer: string;
  eligibility?: { eligible: boolean; rule: string; sourceId: string };
  formUrl?: string;
  deadline?: string;
  contact?: string;
}

export interface BenchmarkTask {
  id: string;
  category: string;
  parentUtterance: string;
  jurisdiction: { district: string; state?: string };
  difficulty: 'easy' | 'medium' | 'hard';
  traps: string[];
  groundTruth: GroundTruth;
}

export interface RunTrace {
  /** Normalized queries issued. */
  queries: string[];
  discoveredSources: string[];
  usefulSources: string[];
  evidence: Array<{ sourceUrl: string; status: string }>;
  failures: Array<{ error: string; recovered: boolean }>;
  toolCalls: number;
  costUsd: number;
  latencyMs: number;
  humanInterventions: number;
}

export interface BenchmarkMetrics {
  queryNovelty: number; // 1 - (duplicate queries / total)
  searchSuccess: number; // 0|1 — a query surfaced a ground-truth source
  discoveryRecall: number; // |discovered ∩ authoritative| / |authoritative|
  authoritativePrecision: number; // |official discovered| / |discovered|
  evidenceRecall: number; // |evidence from authoritative| / |authoritative|
  verificationRate: number; // |verified/confirmed evidence| / |evidence|
  formDiscovery: number; // 0|1 — the ground-truth form URL was discovered
  recoveryRate: number; // recovered / total failures
  humanInterventionRate: number; // interventions / tool calls
  toolCalls: number;
  costUsd: number;
  latencyMs: number;
}

function frac(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

export function scoreRun(task: BenchmarkTask, trace: RunTrace): BenchmarkMetrics {
  const authoritative = new Set(task.groundTruth.authoritativeSources.map((u) => u.trim()));
  const discovered = new Set(trace.discoveredSources.map((u) => u.trim()));
  const discoveredAuth = [...discovered].filter((u) => authoritative.has(u));

  const uniqueQueries = new Set(trace.queries).size;
  const queryNovelty = trace.queries.length === 0 ? 1 : 1 - (trace.queries.length - uniqueQueries) / trace.queries.length;

  const officialDiscovered = [...discovered].filter((u) => isOfficialUrl(u));
  const evidenceFromAuth = trace.evidence.filter((e) => authoritative.has(e.sourceUrl));
  const verifiedEvidence = trace.evidence.filter((e) => e.status === 'verified' || e.status === 'confirmed');

  const recovered = trace.failures.filter((f) => f.recovered).length;

  return {
    queryNovelty,
    searchSuccess: discoveredAuth.length > 0 ? 1 : 0,
    discoveryRecall: frac(discoveredAuth.length, authoritative.size),
    authoritativePrecision: frac(officialDiscovered.length, discovered.size),
    evidenceRecall: frac(evidenceFromAuth.length, authoritative.size),
    verificationRate: frac(verifiedEvidence.length, trace.evidence.length),
    formDiscovery: task.groundTruth.formUrl && discovered.has(task.groundTruth.formUrl) ? 1 : 0,
    recoveryRate: frac(recovered, trace.failures.length),
    humanInterventionRate: frac(trace.humanInterventions, trace.toolCalls),
    toolCalls: trace.toolCalls,
    costUsd: trace.costUsd,
    latencyMs: trace.latencyMs,
  };
}

/** A judge for answer/eligibility correctness — plug an LLM judge or human here. */
export function judgeAnswer(_task: BenchmarkTask, _answer: string): { answerCorrect: boolean; eligibilityCorrect: boolean } {
  // Stub: wire an LLM judge (or human grading) that compares `_answer` against
  // `task.groundTruth.answer` / `eligibility`. Kept deterministic for now.
  return { answerCorrect: false, eligibilityCorrect: false };
}

/**
 * Convert a run trace into a training/eval episode (ITER supervision +
 * BrowserForge-style episode data). Includes failures — recovery supervision
 * comes from failures.
 */
export function toTrajectoryData(task: BenchmarkTask, trace: RunTrace) {
  return {
    task_id: task.id,
    utterance: task.parentUtterance,
    category: task.category,
    jurisdiction: task.jurisdiction,
    queries: trace.queries,
    discovered: trace.discoveredSources,
    useful: trace.usefulSources,
    evidence: trace.evidence,
    failures: trace.failures,
    metrics: scoreRun(task, trace),
  };
}

/** A couple of real-shaped fixtures; the full 100-task corpus is a follow-up. */
export const SAMPLE_TASKS: BenchmarkTask[] = [
  {
    id: 'sb-001',
    category: 'transportation',
    parentUtterance: 'My kid needs a bus.',
    jurisdiction: { district: 'Soquel Union Elementary School District', state: 'CA' },
    difficulty: 'medium',
    traps: ['decoy school with the same name', 'outdated policy PDF'],
    groundTruth: {
      authoritativeSources: ['https://www.suesd.org/mckinney-vento', 'https://www.suesd.org/transportation-request'],
      answer: 'Transportation to the school of origin under McKinney-Vento; apply via the Transportation Request form.',
      eligibility: { eligible: true, rule: 'homeless/displaced (McKinney-Vento)', sourceId: 'suesd-bus-eligibility-rule' },
      formUrl: 'https://docs.google.com/forms/d/e/example',
      contact: 'Carissa Lemos, (831) 464-5631',
    },
  },
  {
    id: 'sb-002',
    category: 'meals',
    parentUtterance: 'We need help with food.',
    jurisdiction: { district: 'Soquel Union Elementary School District', state: 'CA' },
    difficulty: 'easy',
    traps: [],
    groundTruth: {
      authoritativeSources: ['https://www.fns.usda.gov/cn/free-reduced-price-meals'],
      answer: 'Free/reduced-price meals under the National School Lunch Program; homeless students are automatically eligible.',
      eligibility: { eligible: true, rule: 'NSLP / automatic for homeless', sourceId: 'suesd-meals' },
    },
  },
];
