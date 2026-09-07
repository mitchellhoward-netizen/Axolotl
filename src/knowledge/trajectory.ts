/**
 * Trajectory-aware search state (the ITER lesson, made concrete).
 *
 * The researcher records every query, fetched document, and learned term here.
 * The session enforces a budget, dedupes queries, tracks which docs were useful,
 * detects "stuck", and generates recovery queries. This module is PURE LOGIC (no
 * network I/O) so it is unit-testable offline and independent of the LLM/browser
 * backends — it is the "researcher's spine".
 */

export interface SearchBudget {
  maxSearches: number;
  maxFetches: number;
  maxSteps: number;
  /** Consecutive steps that produced no new/useful source before we call it stuck. */
  maxNoProgress: number;
}

export const DEFAULT_BUDGET: SearchBudget = {
  maxSearches: 10,
  maxFetches: 14,
  maxSteps: 30,
  maxNoProgress: 5,
};

export type StepKind = 'search' | 'recover' | 'fetch';

export interface TrajectoryStep {
  kind: StepKind;
  /** The query (search/recover) or URL (fetch). */
  subject: string;
  reason: string;
  newSources: number;
  usefulSources: number;
  learnedTerms: string[];
}

export interface FetchedDoc {
  url: string;
  /** True when the fetched page yielded at least one grounded knowledge node. */
  useful: boolean;
}

export class SearchSession {
  readonly budget: SearchBudget;
  readonly originalQuestion: string;
  readonly steps: TrajectoryStep[] = [];
  /** Lowercased normalized query keys already issued (dedup). */
  readonly issuedQueries = new Set<string>();
  readonly seenUrls = new Set<string>();
  readonly usefulUrls: string[] = [];
  readonly learnedTerms = new Set<string>();
  /** Uncovered target labels (categories or goal hints), maintained by the caller. */
  gaps: string[] = [];

  searchesUsed = 0;
  fetchesUsed = 0;
  private noProgressStreak = 0;
  stopped = false;
  stopReason?: string;

  constructor(originalQuestion: string, budget: SearchBudget = DEFAULT_BUDGET) {
    this.originalQuestion = originalQuestion;
    this.budget = budget;
  }

  // ── budget / lifecycle ────────────────────────────────────────────────────────

  get stepsUsed(): number {
    return this.steps.length;
  }

  canSearch(): boolean {
    return !this.stopped && this.searchesUsed < this.budget.maxSearches && this.stepsUsed < this.budget.maxSteps;
  }

  canFetch(): boolean {
    return !this.stopped && this.fetchesUsed < this.budget.maxFetches && this.stepsUsed < this.budget.maxSteps;
  }

  /** Register a query. Returns the normalized key, or null if duplicate / over budget. */
  issueQuery(query: string): string | null {
    const key = normalizeQuery(query);
    if (!key || this.issuedQueries.has(key)) return null;
    if (!this.canSearch()) return null;
    this.issuedQueries.add(key);
    this.searchesUsed++;
    return key;
  }

  hasSeen(url: string): boolean {
    return this.seenUrls.has(normalizeUrl(url));
  }

  /** Record a fetched doc (and bump the fetch budget). Ignores calls over budget. */
  markFetched(doc: FetchedDoc): void {
    if (!this.canFetch()) return;
    const key = normalizeUrl(doc.url);
    if (!key) return;
    this.seenUrls.add(key);
    this.fetchesUsed++;
    if (doc.useful && !this.usefulUrls.includes(doc.url)) this.usefulUrls.push(doc.url);
  }

  recordStep(step: TrajectoryStep): void {
    this.steps.push(step);
    if (step.newSources === 0 && step.usefulSources === 0) {
      this.noProgressStreak++;
    } else {
      this.noProgressStreak = 0;
    }
  }

  addLearnedTerms(terms: Iterable<string>): void {
    for (const t of terms) {
      const v = t.trim();
      if (v && v.length <= 80 && !this.learnedTerms.has(v.toLowerCase())) this.learnedTerms.add(v);
    }
  }

  isStuck(): boolean {
    return this.noProgressStreak >= this.budget.maxNoProgress;
  }

  /** Whether the loop should terminate, with a human-readable reason. */
  evaluateStop(gapsRemaining: number): { stop: boolean; reason?: string } {
    if (this.stopped) return { stop: true, reason: this.stopReason };
    if (gapsRemaining <= 0) return { stop: true, reason: 'covered' };
    if (this.searchesUsed >= this.budget.maxSearches && this.fetchesUsed >= this.budget.maxFetches) {
      return { stop: true, reason: 'budget' };
    }
    if (this.isStuck()) return { stop: true, reason: 'stuck' };
    return { stop: false };
  }

  stop(reason: string): void {
    this.stopped = true;
    this.stopReason = reason;
  }

  /** Exact-phrase and (optionally) domain-restricted recovery queries. */
  recoveryQueries(seed: string, domain?: string): string[] {
    const q = seed.trim();
    if (!q) return [];
    const exact = `"${q.replace(/"/g, '')}"`;
    const out = [exact];
    if (domain) {
      const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (host) out.push(`${exact} site:${host}`);
    }
    return out;
  }

  snapshot() {
    return {
      originalQuestion: this.originalQuestion,
      steps: this.steps,
      queries: [...this.issuedQueries],
      seenUrls: [...this.seenUrls],
      usefulUrls: [...this.usefulUrls],
      learnedTerms: [...this.learnedTerms],
      gaps: [...this.gaps],
      searchesUsed: this.searchesUsed,
      fetchesUsed: this.fetchesUsed,
      stopped: this.stopped,
      stopReason: this.stopReason,
    };
  }
}

/** Lowercase, collapse whitespace, strip most punctuation — the dedup key. */
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\w\s'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Canonical URL key: drop fragment + known tracker params + trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref']) {
      u.searchParams.delete(p);
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

const STOP_ACRONYMS = new Set([
  'THE', 'AND', 'FOR', 'NOT', 'YOU', 'ARE', 'WAS', 'HAS', 'OUR', 'ITS', 'BUT', 'THIS', 'THAT', 'WITH',
  'FROM', 'YOUR', 'WHEN', 'WHAT', 'WHO', 'WHY', 'HOW', 'CAN', 'ALL', 'ANY', 'OUT', 'OFF', 'NEW', 'VIA',
  'URL', 'HTML', 'HTTP', 'HTTPS', 'PDF', 'PAGE',
]);

/**
 * Deterministic learned-terminology extraction (no LLM needed). Pulls policy /
 * regulation numbers, acronyms, and program/action keywords — the bridging
 * vocabulary for subsequent, better searches.
 */
export function extractSearchTerms(text: string, limit = 12): string[] {
  const out = new Set<string>();

  // Policy / administrative-regulation numbers: AR 3541, Board Policy 5117, BP 5131.2
  const policies =
    text.match(/\b(?:AR|BP|Admin(?:istrative)?\s+Reg(?:ulation)?|Board\s+Policy)\s*#?\s?\d+(?:\.\d+)?\b/gi) ?? [];
  for (const m of policies) out.add(m.replace(/\s+/g, ' ').trim());

  // Acronyms / abbreviations (2-6 uppercase), minus stopwords.
  const acronyms = text.match(/\b[A-Z]{2,6}\b/g) ?? [];
  for (const a of acronyms) if (!STOP_ACRONYMS.has(a)) out.add(a);

  // Program/action keywords (canonical lowercase).
  const kw = text.toLowerCase();
  const keywords = [
    'application', 'apply', 'form', 'registration', 'enrollment', 'deadline', 'eligibility',
    'transportation', 'bus pass', 'free or reduced', 'mckinney-vento', 'iep', '504 plan',
    'transfer', 'portal', 'intake', 'waitlist', 'school of origin',
  ];
  for (const k of keywords) if (kw.includes(k)) out.add(k);

  return [...out].slice(0, limit);
}
