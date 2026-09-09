import 'dotenv/config';
import { getSupabase } from '../integrations/db.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory, type KnowledgeNode, type KnowledgeSource } from '../domain/knowledge.js';
import type { CandidateNode } from './research.js';

let cache = new Map<string, KnowledgeNode[]>();
/** When each district was last deep-researched (in-process). Read-through cache:
 * a district researched within RESEARCH_TTL_DAYS is NOT re-crawled on a live turn. */
const researchedAt = new Map<string, number>();
const RESEARCH_TTL_MS = () => (Number(process.env.RESEARCH_TTL_DAYS) || 14) * 24 * 3600 * 1000;

/**
 * The knowledge graph. Canonical, category-tagged facts per district/school,
 * backed by Supabase (`knowledge_node`) with an in-memory fallback. This is the
 * RAG corpus the agent retrieves from (grounded, verified-or-draft). Districts
 * are researched on demand — there is no seeded "known" district; the gated
 * `autoResearchDistrict` fills a district when a parent names it.
 */
export class KnowledgeGraph {
  /** Return nodes for a district. Empty until a district is researched. */
  async get(districtId: string, category?: KnowledgeCategory | 'LAW'): Promise<KnowledgeNode[]> {
    let nodes = cache.get(districtId);
    if (!nodes) {
      nodes = await this.loadFromDb(districtId);
      cache.set(districtId, nodes);
    }
    if (category) return nodes.filter((n) => n.category === category);
    return nodes;
  }

  async add(districtId: string, node: KnowledgeNode): Promise<void> {
    const existing = cache.get(districtId) ?? [];
    cache.set(districtId, [...existing.filter((n) => n.id !== node.id), node]);
    await this.persistToDb(node);
  }

  /**
   * pgvector cosine-similarity search over a district's nodes (RAG). Calls the
   * `match_knowledge` RPC (db/embedding.sql). Gracefully returns [] when the
   * RPC/table isn't set up or embeddings aren't populated — callers then fall
   * back to category/keyword filtering.
   */
  async search(districtId: string, embedding: number[], limit = 5, category?: string): Promise<KnowledgeNode[]> {
    const c = getSupabase();
    if (!c || !embedding?.length) return [];
    try {
      const { data, error } = await c.rpc('match_knowledge', {
        query_embedding: embedding,
        district_id: districtId,
        match_count: limit,
        match_category: category ?? null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: unknown) => nodeFromRow(row as Record<string, unknown>));
    } catch (e) {
      console.error('[knowledge] vector search unavailable (fallback to keyword):', (e as Error)?.message ?? e);
      return [];
    }
  }

  /** Re-verify a node (bump lastVerifiedAt) or flip draft→verified. */
  async confirm(districtId: string, nodeId: string, verified: boolean): Promise<void> {
    const nodes = cache.get(districtId) ?? [];
    const next = nodes.map((n) =>
      n.id === nodeId
        ? { ...n, status: verified ? ('verified' as const) : n.status, lastVerifiedAt: new Date().toISOString() }
        : n,
    );
    cache.set(districtId, next);
    const node = next.find((n) => n.id === nodeId);
    if (node) await this.persistToDb({ ...node, status: verified ? 'verified' : node.status });
  }

  private async loadFromDb(districtId: string): Promise<KnowledgeNode[]> {
    const c = getSupabase();
    if (!c) return [];
    const { data, error } = await c.from('knowledge_node').select('*').eq('district_id', districtId);
    if (error) return []; // table may not exist yet; fall back to in-memory seed
    return (data ?? []).map((row) => nodeFromRow(row));
  }

  private async persistToDb(node: KnowledgeNode): Promise<void> {
    const c = getSupabase();
    if (!c) return;
    try {
      const { error } = await c.from('knowledge_node').upsert(rowFromNode(node), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[knowledge] persist failed (in-memory only):', (e as Error)?.message ?? e);
    }
  }
}

function nodeFromRow(row: Record<string, unknown>): KnowledgeNode {
  return {
    id: row.id as string,
    category: row.category as KnowledgeNode['category'],
    title: row.title as string,
    summary: (row.summary ?? '') as string,
    sources: (row.sources ?? []) as KnowledgeSource[],
    jurisdiction: row.jurisdiction as KnowledgeNode['jurisdiction'],
    law: (row.law ?? undefined) as string | undefined,
    status: (row.status ?? 'draft') as KnowledgeNode['status'],
    confidence: Number(row.confidence ?? 0),
    lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowFromNode(n: KnowledgeNode): Record<string, unknown> {
  return {
    id: n.id,
    district_id: n.districtId,
    school_id: n.schoolId ?? null,
    category: n.category,
    title: n.title,
    summary: n.summary,
    sources: n.sources,
    jurisdiction: n.jurisdiction,
    law: n.law ?? null,
    status: n.status,
    confidence: n.confidence,
    last_verified_at: n.lastVerifiedAt ?? null,
    created_at: n.createdAt,
  };
}

/** Slugs a stable node id per category/title. */
function nodeId(districtId: string, slug: string): string {
  return `${districtId}-${slug}`;
}

/**
 * The generic, grounded legal/draft facts the pipeline seeds for ANY district.
 * These cite real US law (applicable nationwide); district-specific application
 * is what the family must confirm with the office — hence status 'draft' and a
 * "may be entitled / confirm" framing (safety: never state as authoritative).
 */
const GENERIC_DRAFTS: Array<{
  category: KnowledgeNode['category'];
  title: string;
  summary: string;
  jurisdiction: KnowledgeNode['jurisdiction'];
  law: string;
}> = [
  {
    category: 'TRANSPORTATION',
    title: 'Transportation to school of origin',
    summary:
      'A student who is homeless or displaced may be entitled to transportation to their school of origin on request. Confirm the district process.',
    jurisdiction: 'federal',
    law: '42 U.S.C. §11432(g)(1)(J)',
  },
  {
    category: 'MEALS',
    title: 'Free & reduced-price meals',
    summary:
      'Your child may qualify for free or reduced-price meals; submit/confirm the meal application with the school food service office.',
    jurisdiction: 'federal',
    law: '42 U.S.C. §1758',
  },
  {
    category: 'BASIC_NEEDS',
    title: 'Immediate enrollment & homeless support',
    summary:
      'A student without a fixed address can enroll immediately without residency/birth records, and a district liaison can help. Confirm with the district.',
    jurisdiction: 'federal',
    law: '42 U.S.C. §11432(g)(1)(H)',
  },
  {
    category: 'ATTENDANCE',
    title: 'Attendance supports',
    summary:
      'If attendance is at risk, the district should offer supports. Ask the attendance office about a student-support or attendance plan.',
    jurisdiction: 'federal',
    law: '20 U.S.C. §6311',
  },
  {
    category: 'LEARNING',
    title: 'English-learner / language support',
    summary:
      'Students learning English are entitled to language support, and the school must communicate with the family in a language they understand.',
    jurisdiction: 'federal',
    law: '20 U.S.C. §6811',
  },
  {
    category: 'BEHAVIOR',
    title: 'Bullying / safety plan',
    summary:
      'Bullying is reportable and the school must respond; you can request a safety plan. Ask the principal how to report at this school.',
    jurisdiction: 'state',
    law: 'Ed Code §234',
  },
  {
    category: 'SPECIAL_ED',
    title: 'Special education evaluation (IEP)',
    summary:
      'If you suspect a disability is affecting learning, you can request a written evaluation. The district determines eligibility, not us.',
    jurisdiction: 'federal',
    law: 'IDEA 20 U.S.C. §1414',
  },
  {
    category: 'ACCOMMODATIONS',
    title: '504 plan / accommodations',
    summary:
      'A student with a condition that limits a major life activity may be entitled to accommodations under a 504 plan. Request via the school or district.',
    jurisdiction: 'federal',
    law: '29 U.S.C. §794',
  },
  {
    category: 'ACTIVITIES',
    title: 'Before/after-school programs & enrichment (often free)',
    summary:
      'Districts and schools often run free or fee-waived before- & after-school programs, clubs, and enrichment (some are federally funded 21st Century Community Learning Center sites — often free to low-income families). Find the district/school enrichment page or ask the front office; many programs waive fees or use a sliding scale. I can find the program, the sign-up form, and request a fee waiver.',
    jurisdiction: 'district',
    law: '21st Century Community Learning Centers, 20 U.S.C. §7171',
  },
  {
    category: 'GENERAL_NAVIGATION',
    title: 'How to reach the school',
    summary:
      'Contact the school office for the bell schedule, front-office questions, and how to reach staff. We can only confirm what the district shares publicly.',
    jurisdiction: 'district',
    law: '',
  },
];

/** Build `draft` nodes for all 10 categories for a (possibly un-researched) district. */
export function buildDraftNodes(districtId: string, schoolName: string, districtName: string): KnowledgeNode[] {
  const now = new Date().toISOString();
  return GENERIC_DRAFTS.map((d) => {
    const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
    const source = schoolName && schoolName !== districtName
      ? { title: `${districtName} (confirm with ${schoolName})`, url: `https://www.google.com/search?q=${encodeURIComponent(`${districtName} ${schoolName}`)}` }
      : { title: districtName, url: `https://www.google.com/search?q=${encodeURIComponent(districtName)}` };
    return {
      id: nodeId(districtId, slug),
      districtId,
      category: d.category,
      title: d.title,
      // Draft facts are phrased as possibilities to confirm — never authoritative.
      summary: `${d.summary} (Draft — ${d.jurisdiction} law/guidance; confirm with the school.)`,
      sources: [source],
      jurisdiction: d.jurisdiction,
      law: d.law || undefined,
      status: 'draft' as const,
      confidence: d.category === 'GENERAL_NAVIGATION' || d.category === 'ACTIVITIES' ? 0.4 : 0.7,
      createdAt: now,
    };
  });
}

/**
 * The automatic school-knowledge pipeline. For a district, produce category-tagged
 * `draft` nodes for any of the 10 categories that don't yet have a verified node.
 * When a `researcher` hook is provided it first tries real web research (fetch +
 * LLM categorization, grounded with source URLs); the generic grounded-law drafts
 * fill any categories research didn't cover. Existing (verified) nodes are never
 * overwritten. This is what makes the agent "get better as more schools onboard."
 */
export async function autoResearchDistrict(
  graph: KnowledgeGraph,
  districtId: string,
  schoolName: string,
  districtName: string,
  researcher?: () => Promise<CandidateNode[]>,
): Promise<KnowledgeNode[]> {
  const existing = await graph.get(districtId);
  const covered = new Set<string>(existing.map((n) => n.category as string));

  // Read-through cache: if this district was deep-researched within the TTL (in this
  // process), skip the live crawl entirely — a warm district does ZERO live research.
  const fresh = existing.length > 0 && Date.now() - (researchedAt.get(districtId) ?? 0) < RESEARCH_TTL_MS();

  let researched: CandidateNode[] = [];
  if (researcher && !fresh) {
    try {
      researched = await researcher();
      researchedAt.set(districtId, Date.now());
    } catch (e) {
      console.error('[knowledge] researcher failed:', (e as Error)?.message ?? e);
    }
  }
  const now = new Date().toISOString();
  const researchedNodes = researched
    .map((c): KnowledgeNode | null => {
      const cat = c.category.trim().toUpperCase().replace(/\s+/g, '_');
      if (!(KNOWLEDGE_CATEGORIES as string[]).includes(cat)) return null;
      return {
        id: nodeId(districtId, c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)),
        districtId,
        category: cat as KnowledgeNode['category'],
        title: c.title,
        summary: c.summary,
        sources: [{ title: c.title, url: c.url }],
        jurisdiction: 'district',
        status: 'draft' as const,
        confidence: 0.6,
        createdAt: now,
      };
    })
    .filter((n): n is KnowledgeNode => n !== null);

  const generic = buildDraftNodes(districtId, schoolName, districtName);
  const merged = [...researchedNodes, ...generic].filter((n) => !covered.has(n.category as string));
  // One node per category (research first, generic law as the fallback).
  const seen = new Set<string>();
  const uniq = merged.filter((n) => {
    if (seen.has(n.category as string)) return false;
    seen.add(n.category as string);
    return true;
  });
  for (const n of uniq) await graph.add(districtId, n);
  return uniq;
}
