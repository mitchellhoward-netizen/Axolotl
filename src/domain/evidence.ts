/**
 * Evidence model: never store only an answer. Every consequential claim is an
 * `EvidenceRecord` with provenance and a status on a 6-step ladder. This is the
 * audit trail that verification (src/agent/verify.ts) runs against.
 */

export type EvidenceStatus =
  | 'discovered' // seen, not yet read
  | 'plausible' // read, looks relevant, not cross-checked
  | 'verified' // official + current + jurisdiction-correct
  | 'confirmed' // ≥2 independent official sources agree (high-consequence bar)
  | 'stale' // was verified, now past its reverify TTL
  | 'contradictory'; // conflicts with another official record

export type SourceType =
  | 'district_page'
  | 'school_page'
  | 'policy'
  | 'form'
  | 'pdf'
  | 'contact'
  | 'other';

export type Jurisdiction = 'federal' | 'state' | 'district' | 'school';

export interface EvidenceRecord {
  id: string;
  claim: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceType: SourceType;
  /** Quote / page / paragraph locator of the exact supporting text. */
  evidenceSpan?: string;
  retrievedAt: string;
  verifiedAt?: string;
  jurisdiction?: Jurisdiction;
  official: boolean;
  /** 0..1 confidence the claim is current/accurate for its jurisdiction. */
  confidence: number;
  status: EvidenceStatus;
  /** Other evidence ids that independently corroborate this claim. */
  corroboratedBy: string[];
}

export const EVIDENCE_STATUS_LADDER: EvidenceStatus[] = [
  'discovered',
  'plausible',
  'verified',
  'confirmed',
  'stale',
  'contradictory',
];

/** Best-effort official-source detection from a URL. */
export function isOfficialUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('.gov') || h.endsWith('.edu') || /\.k12\.[a-z]{2}\.us$/.test(h);
  } catch {
    return false;
  }
}

/** Infer a source type from a URL (best-effort, refined by the caller). */
export function sourceTypeFromUrl(url: string): SourceType {
  const u = url.toLowerCase();
  if (/\.pdf(\?|#|$)/.test(u)) return 'pdf';
  if (/docs\.google\.com\/forms|forms\.office\.com|forms\.gle/.test(u)) return 'form';
  if (/policy|regulation|admin|board|ar-?\d|bp-?\d|\.ar\.|\.bp\./.test(u)) return 'policy';
  if (/contact|staff|directory|phone|office/.test(u)) return 'contact';
  return 'district_page';
}
