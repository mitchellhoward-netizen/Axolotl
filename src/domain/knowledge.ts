// ─────────────────────────────────────────────────────────────────────────────
// The canonical school knowledge model. This is the vocabulary that the
// knowledge graph, the agent, the discovery pipeline, and any dashboard all
// speak. The parent-facing surface localizes; the graph stays canonical/English.
// ─────────────────────────────────────────────────────────────────────────────

/** The 10 canonical knowledge categories for a school/district. */
export type KnowledgeCategory =
  | 'TRANSPORTATION'
  | 'MEALS'
  | 'BASIC_NEEDS'
  | 'ATTENDANCE'
  | 'LEARNING'
  | 'BEHAVIOR'
  | 'SPECIAL_ED'
  | 'ACCOMMODATIONS'
  | 'ACTIVITIES'
  | 'GENERAL_NAVIGATION';

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  'TRANSPORTATION',
  'MEALS',
  'BASIC_NEEDS',
  'ATTENDANCE',
  'LEARNING',
  'BEHAVIOR',
  'SPECIAL_ED',
  'ACCOMMODATIONS',
  'ACTIVITIES',
  'GENERAL_NAVIGATION',
];

export type Jurisdiction = 'federal' | 'state' | 'district' | 'school';
export type VerificationStatus = 'verified' | 'draft';

export interface KnowledgeSource {
  title: string;
  url: string;
  /** When we last confirmed the source still says this. */
  checkedAt?: string;
}

/** A single grounded fact about a school/district (or a law that applies). */
export interface KnowledgeNode {
  id: string;
  /** Owning district (clusters nodes for RAG scoping). */
  districtId?: string;
  /** Owning school, when the fact is school-specific. */
  schoolId?: string;
  /** Canonical category, or 'LAW' for a jurisdiction-level legal fact. */
  category: KnowledgeCategory | 'LAW';
  title: string;
  /** One honest sentence a parent can act on. No invented specifics. */
  summary: string;
  sources: KnowledgeSource[];
  jurisdiction: Jurisdiction;
  /** Statute citation when this is a legal entitlement (e.g. "42 U.S.C. §11432(g)(1)(J)"). */
  law?: string;
  /** verified = confirmed against a source; draft = researched but unconfirmed. */
  status: VerificationStatus;
  /** 0..1 confidence that the fact is current/accurate for this district. */
  confidence: number;
  /** pgvector embedding (optional; filled by the indexing step). */
  embedding?: number[];
  /** When the node was last re-verified. Stale nodes get re-crawled. */
  lastVerifiedAt?: string;
  createdAt: string;
}

export function isKnowledgeCategoryCategory(v: string): v is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORIES as string[]).includes(v);
}

/** Human heading for a category (canonical English; localize at the surface). */
export function categoryLabel(c: KnowledgeCategory): string {
  const labels: Record<KnowledgeCategory, string> = {
    TRANSPORTATION: 'Transportation',
    MEALS: 'Meals',
    BASIC_NEEDS: 'Basic needs',
    ATTENDANCE: 'Attendance',
    LEARNING: 'Learning',
    BEHAVIOR: 'Behavior',
    SPECIAL_ED: 'Special education',
    ACCOMMODATIONS: 'Accommodations',
    ACTIVITIES: 'Activities',
    GENERAL_NAVIGATION: 'General navigation',
  };
  return labels[c];
}
