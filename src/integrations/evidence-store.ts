import 'dotenv/config';
import { getSupabase } from './db.js';
import { sourceTypeFromUrl, isOfficialUrl, type EvidenceRecord, type SourceType } from '../domain/evidence.js';
import { verifyEvidence } from '../agent/verify.js';

/** Minimal input for a new evidence claim (the brain's `save_evidence` tool). */
export interface NewEvidence {
  claim: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceType?: SourceType;
  evidenceSpan?: string;
  jurisdiction?: EvidenceRecord['jurisdiction'];
  official?: boolean;
  confidence?: number;
}

export interface CreatedEvidence {
  record: EvidenceRecord;
  status: EvidenceRecord['status'];
  reasons: string[];
}

/**
 * Build an EvidenceRecord, run it through the verification rubric to set its
 * initial status, and persist it. Returns the record + verdict so the caller can
 * tell the parent how trustworthy the claim is.
 */
export async function createEvidence(input: NewEvidence): Promise<CreatedEvidence> {
  const record: EvidenceRecord = {
    id: 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    claim: input.claim,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    sourceType: input.sourceType ?? sourceTypeFromUrl(input.sourceUrl),
    evidenceSpan: input.evidenceSpan,
    retrievedAt: new Date().toISOString(),
    jurisdiction: input.jurisdiction,
    official: input.official ?? isOfficialUrl(input.sourceUrl),
    confidence: input.confidence ?? 0,
    status: 'discovered',
    corroboratedBy: [],
  };

  const verdict = verifyEvidence(record);
  record.status = verdict.status;
  if (verdict.pass) record.verifiedAt = new Date().toISOString();

  const c = getSupabase();
  if (c) {
    try {
      const { error } = await c.from('evidence').upsert(
        {
          id: record.id,
          claim: record.claim,
          source_url: record.sourceUrl,
          source_title: record.sourceTitle,
          source_type: record.sourceType,
          evidence_span: record.evidenceSpan ?? null,
          retrieved_at: record.retrievedAt,
          verified_at: record.verifiedAt ?? null,
          jurisdiction: record.jurisdiction ?? null,
          official: record.official,
          confidence: record.confidence,
          status: record.status,
          corroborated_by: record.corroboratedBy,
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[evidence] persist failed (in-memory only):', (e as Error)?.message ?? e);
    }
  }

  return { record, status: record.status, reasons: verdict.reasons };
}

/** Look up prior evidence for the same source (for corroboration checks). */
export async function getEvidenceBySource(sourceUrl: string): Promise<EvidenceRecord[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.from('evidence').select('*').eq('source_url', sourceUrl);
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ''),
    claim: String(row.claim ?? ''),
    sourceUrl: String(row.source_url ?? ''),
    sourceTitle: String(row.source_title ?? ''),
    sourceType: String(row.source_type ?? 'other') as SourceType,
    evidenceSpan: row.evidence_span ? String(row.evidence_span) : undefined,
    retrievedAt: String(row.retrieved_at ?? ''),
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    jurisdiction: (row.jurisdiction ?? undefined) as EvidenceRecord['jurisdiction'] | undefined,
    official: Boolean(row.official),
    confidence: Number(row.confidence ?? 0),
    status: String(row.status ?? 'discovered') as EvidenceRecord['status'],
    corroboratedBy: Array.isArray(row.corroborated_by) ? (row.corroborated_by as string[]) : [],
  }));
}
