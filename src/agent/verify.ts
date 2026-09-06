import type { EvidenceRecord, EvidenceStatus, SourceType } from '../domain/evidence.js';
import { isOfficialUrl } from '../domain/evidence.js';
import type { KnowledgeNode } from '../domain/knowledge.js';

/**
 * The verification stage. Run before a consequential answer reaches a parent:
 * is it an official source? is it current? is it corroborated? The rubric never
 * lets a claim pass as `verified` without a source URL, and requires
 * corroboration for `confirmed` (the bar for eligibility / form claims).
 */

export interface VerifyOptions {
  now?: Date;
  /** Max source age (days) before a claim is `stale`, by source type. */
  ttlDays?: Partial<Record<SourceType, number>>;
}

const DEFAULT_TTL_DAYS: Record<SourceType, number> = {
  policy: 90,
  pdf: 90,
  form: 14,
  contact: 180,
  district_page: 60,
  school_page: 60,
  other: 30,
};

export interface VerificationResult {
  pass: boolean;
  status: EvidenceStatus;
  reasons: string[];
}

export function verifyEvidence(e: EvidenceRecord, opts: VerifyOptions = {}): VerificationResult {
  const reasons: string[] = [];
  const now = opts.now ?? new Date();

  if (!e.sourceUrl) {
    reasons.push('no source URL');
    return { pass: false, status: 'discovered', reasons };
  }

  const official = e.official || isOfficialUrl(e.sourceUrl);
  if (!official) reasons.push('not an official source');

  const ttlDays = (opts.ttlDays ?? {})[e.sourceType] ?? DEFAULT_TTL_DAYS[e.sourceType] ?? 30;
  const retrieved = new Date(e.retrievedAt).getTime();
  const ageDays = (now.getTime() - retrieved) / 86_400_000;
  const current = Number.isFinite(ageDays) && ageDays <= ttlDays;
  if (!current) reasons.push(`stale (${Math.max(0, Math.round(ageDays))}d > ${ttlDays}d TTL)`);

  if (e.status === 'contradictory') {
    return { pass: false, status: 'contradictory', reasons: [...reasons, 'contradicts another official source'] };
  }

  if (official && current) {
    if (e.corroboratedBy.length >= 1) return { pass: true, status: 'confirmed', reasons };
    return { pass: true, status: 'verified', reasons };
  }
  if (official && !current) return { pass: false, status: 'stale', reasons };
  return { pass: false, status: 'plausible', reasons };
}

/**
 * Map a `KnowledgeNode` onto the evidence ladder. Bridges the current 2-level
 * `verified|draft` node status to the 6-step ladder so retrieval can surface how
 * much to trust a fact.
 */
export function assessKnowledgeNode(node: KnowledgeNode, now: Date = new Date()): EvidenceStatus {
  if (node.status === 'draft') return 'plausible';
  if (node.lastVerifiedAt) {
    const ageDays = (now.getTime() - new Date(node.lastVerifiedAt).getTime()) / 86_400_000;
    if (ageDays > 30) return 'stale';
  }
  const official = node.sources.some((s) => isOfficialUrl(s.url));
  if (!official) return 'plausible';
  return node.sources.length >= 2 ? 'confirmed' : 'verified';
}

/** The parent-facing caveat for a node status (used when rendering answers). */
export function statusCaveat(status: EvidenceStatus): string {
  switch (status) {
    case 'confirmed':
    case 'verified':
      return '';
    case 'stale':
      return ' (this may be outdated — confirm with the school)';
    case 'contradictory':
      return ' (sources disagree — the school must confirm)';
    case 'plausible':
    case 'discovered':
    default:
      return ' (likely but please confirm with the school)';
  }
}
