import 'dotenv/config';
import { getSupabase } from '../integrations/db.js';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory, type KnowledgeNode, type KnowledgeSource } from '../domain/knowledge.js';
import { LIAISON, BUS_PASSES, SOQUEL_ELEMENTARY, DISTRICT } from './suesd.js';
import type { CandidateNode } from './research.js';

const SOURCES = {
  suesdMv: { title: 'McKinney-Vento (SUESD)', url: 'https://www.suesd.org/mckinny-vento' },
  suesdSchools: { title: 'SUESD schools', url: 'https://www.suesd.org/our-schools' },
};

let cache = new Map<string, KnowledgeNode[]>();

/** Only these districts have our curated, district-specific verified facts. */
const VERIFIED_DISTRICT_IDS = new Set<string>(['district-suesd']);

/**
 * The knowledge graph. Canonical, category-tagged facts per district/school,
 * backed by Supabase (`knowledge_node`) with an in-memory fallback. This is the
 * RAG corpus the agent retrieves from (grounded, verified-or-draft).
 */
export class KnowledgeGraph {
  /** Return nodes for a district, seeded from curated facts if not yet present. */
  async get(districtId: string, category?: KnowledgeCategory | 'LAW'): Promise<KnowledgeNode[]> {
    let nodes = cache.get(districtId);
    if (!nodes) {
      nodes = await this.loadFromDb(districtId);
      if (nodes.length === 0 && VERIFIED_DISTRICT_IDS.has(districtId)) {
        nodes = seedDistrictGraph(districtId);
        // Make the curated, verified facts durable so they can be indexed/embedded.
        for (const n of nodes) await this.persistToDb(n);
      }
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
 * Seed the knowledge graph for a district from our curated, verified facts.
 * This is the "verified" half; the research pipeline adds "draft" nodes.
 */
export function seedDistrictGraph(districtId: string): KnowledgeNode[] {
  const rows: Array<Omit<KnowledgeNode, 'id' | 'createdAt' | 'districtId'>> = [
    {
      category: 'TRANSPORTATION',
      title: 'Transportation to school of origin (McKinney-Vento)',
      summary:
        'A student experiencing homelessness/displacement has the right to transportation to their school of origin at the parent/guardian request.',
      sources: [SOURCES.suesdMv],
      jurisdiction: 'federal',
      law: '42 U.S.C. §11432(g)(1)(J)',
      status: 'verified',
      confidence: 0.97,
    },
    {
      category: 'TRANSPORTATION',
      title: 'Free & subsidized bus passes',
      summary: `Free/subsidized bus passes are handled by ${BUS_PASSES.name} at the district. Ask for transportation support under McKinney-Vento first.`,
      sources: [SOURCES.suesdMv],
      jurisdiction: 'district',
      status: 'verified',
      confidence: 0.92,
    },
    {
      category: 'MEALS',
      title: 'Free & reduced-price meals (NSLP)',
      summary:
        'Income and most benefit programs qualify for free/reduced meals. Students experiencing homelessness are automatically eligible for free meals.',
      sources: [{ title: 'USDA NSLP', url: 'https://www.fns.usda.gov/cn/free-reduced-price-meals' }],
      jurisdiction: 'federal',
      law: '42 U.S.C. §1758',
      status: 'verified',
      confidence: 0.96,
    },
    {
      category: 'BASIC_NEEDS',
      title: 'Immediate enrollment without documents',
      summary:
        'A child experiencing homelessness can enroll and stay at their school of origin right away — no proof of residency, birth certificate, or records required.',
      sources: [SOURCES.suesdMv],
      jurisdiction: 'federal',
      law: '42 U.S.C. §11432(g)(1)(H)',
      status: 'verified',
      confidence: 0.96,
    },
    {
      category: 'BASIC_NEEDS',
      title: 'District homeless liaison',
      summary: `The district homeless liaison is ${LIAISON.name} (${LIAISON.phone}, ${LIAISON.email}). This is the person to contact for McKinney-Vento enrollment/transportation help.`,
      sources: [SOURCES.suesdMv],
      jurisdiction: 'district',
      status: 'verified',
      confidence: 0.95,
    },
    {
      category: 'LEARNING',
      title: 'English-learner / language support (Title III)',
      summary:
        'Students learning English are entitled to language support; the school must communicate with the family in a language they understand.',
      sources: [{ title: 'Title III (US ED)', url: 'https://www2.ed.gov/policy/elsec/leg/essa/essa-titleiii.pdf' }],
      jurisdiction: 'federal',
      law: '20 U.S.C. §6811',
      status: 'verified',
      confidence: 0.93,
    },
    {
      category: 'SPECIAL_ED',
      title: 'FAPE, IEP & 504',
      summary:
        'Eligible students get an IEP or 504 plan with accommodations/related services, and the plan follows them if they change schools.',
      sources: [
        { title: 'IDEA', url: 'https://sites.ed.gov/idea/' },
        { title: 'Section 504', url: 'https://www2.ed.gov/about/offices/list/ocr/504faq.html' },
      ],
      jurisdiction: 'federal',
      law: 'IDEA 20 U.S.C. §1400; §504 29 U.S.C. §794',
      status: 'verified',
      confidence: 0.95,
    },
    {
      category: 'BEHAVIOR',
      title: 'Bullying / safety plan',
      summary:
        'Bullying is actionable: report to the school and request a safety plan. Title IX and state anti-bullying law require a response.',
      sources: [{ title: 'StopBullying.gov', url: 'https://www.stopbullying.gov/' }],
      jurisdiction: 'state',
      law: 'Ed Code §234',
      status: 'verified',
      confidence: 0.88,
    },
    {
      category: 'GENERAL_NAVIGATION',
      title: `Contact: ${SOQUEL_ELEMENTARY.name}`,
      summary: `${SOQUEL_ELEMENTARY.name}: ${SOQUEL_ELEMENTARY.phone}. Principal ${SOQUEL_ELEMENTARY.principal}. ${SOQUEL_ELEMENTARY.address}. District: ${DISTRICT.name}.`,
      sources: [SOURCES.suesdSchools],
      jurisdiction: 'school',
      status: 'verified',
      confidence: 0.97,
    },
  ];

  const nodes: KnowledgeNode[] = [];
  const now = new Date().toISOString();
  for (const r of rows) {
    const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
    nodes.push({
      ...r,
      id: nodeId(districtId, slug),
      districtId,
      createdAt: now,
      lastVerifiedAt: now,
    });
  }
  return nodes;
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
    title: 'School activities & enrichment',
    summary:
      'Schools offer clubs, sports, and after-school programs; check with the office for what is available and whether fees can be waived.',
    jurisdiction: 'district',
    law: 'District policy',
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

  let researched: CandidateNode[] = [];
  if (researcher) {
    try {
      researched = await researcher();
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
