import 'dotenv/config';
import { getSupabase } from '../integrations/db.js';
import type { ResourceNode, ResourceEdge, ResourceChain, ResourceType } from '../domain/graph.js';
import { emptyChain } from '../domain/graph.js';
import { LIAISON, BUS_PASSES, SOQUEL_ELEMENTARY, DISTRICT } from './suesd.js';

export const SUESD_ID = 'district-suesd';

const nodesCache = new Map<string, ResourceNode[]>();
const edgesCache = new Map<string, ResourceEdge[]>();

/**
 * The typed resource graph store (school → district → department → program →
 * eligibility → policy → application → form → contact → deadline). Backed by
 * Supabase (`resource` / `resource_edge`) with an in-memory fallback, like
 * `KnowledgeGraph`. SUESD/Soquel is seeded with a real transportation chain.
 */
export class ResourceGraph {
  async get(districtId: string, type?: ResourceType): Promise<ResourceNode[]> {
    let nodes = nodesCache.get(districtId);
    if (!nodes) {
      nodes = await this.loadFromDb(districtId);
      if (nodes.length === 0 && districtId === SUESD_ID) {
        const seed = seedSuesdResourceGraph();
        nodes = seed.nodes;
        edgesCache.set(districtId, seed.edges);
        for (const n of nodes) await this.persistNode(n);
        for (const e of seed.edges) await this.persistEdge(e);
      }
      nodesCache.set(districtId, nodes);
    }
    return type ? nodes.filter((n) => n.type === type) : nodes;
  }

  async edges(districtId: string): Promise<ResourceEdge[]> {
    let edges = edgesCache.get(districtId);
    if (!edges) {
      edges = await this.loadEdgesFromDb(districtId);
      edgesCache.set(districtId, edges);
    }
    return edges;
  }

  async save(node: ResourceNode): Promise<void> {
    const list = nodesCache.get(node.districtId ?? '') ?? [];
    nodesCache.set(node.districtId ?? '', [...list.filter((n) => n.id !== node.id), node]);
    await this.persistNode(node);
  }

  async saveEdge(edge: ResourceEdge): Promise<void> {
    await this.persistEdge(edge);
  }

  private async loadFromDb(districtId: string): Promise<ResourceNode[]> {
    const c = getSupabase();
    if (!c) return [];
    const { data, error } = await c.from('resource').select('*').eq('district_id', districtId);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map(nodeFromRow);
  }

  private async loadEdgesFromDb(districtId: string): Promise<ResourceEdge[]> {
    const c = getSupabase();
    if (!c) return [];
    const { data, error } = await c.from('resource_edge').select('*');
    if (error || !data) return [];
    // Edges reference nodes; filter to this district by joining in memory.
    const nodes = new Set((await this.get(districtId)).map((n) => n.id));
    return (data as Array<{ from_id?: unknown; to_id?: unknown; type?: unknown }>)
      .filter((e) => nodes.has(String(e.from_id ?? '')) || nodes.has(String(e.to_id ?? '')))
      .map((e) => ({ from: String(e.from_id ?? ''), to: String(e.to_id ?? ''), type: String(e.type ?? '') as ResourceEdge['type'] }));
  }

  private async persistNode(node: ResourceNode): Promise<void> {
    const c = getSupabase();
    if (!c) return;
    try {
      const { error } = await c.from('resource').upsert(
        {
          id: node.id,
          district_id: node.districtId ?? null,
          school_id: node.schoolId ?? null,
          type: node.type,
          category: node.category ?? null,
          title: node.title,
          summary: node.summary,
          canonical_url: node.canonicalUrl,
          sources: node.sources,
          status: node.status,
          confidence: node.confidence,
          language: node.language ?? null,
          discovered_at: node.discoveredAt,
          last_verified_at: node.lastVerifiedAt ?? null,
        },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[resource-graph] persist failed (in-memory only):', (e as Error)?.message ?? e);
    }
  }

  private async persistEdge(edge: ResourceEdge): Promise<void> {
    const c = getSupabase();
    if (!c) return;
    try {
      const { error } = await c.from('resource_edge').upsert(
        { from_id: edge.from, to_id: edge.to, type: edge.type },
        { onConflict: 'from_id,to_id,type' },
      );
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('[resource-graph] edge persist failed:', (e as Error)?.message ?? e);
    }
  }
}

function nodeFromRow(row: Record<string, unknown>): ResourceNode {
  return {
    id: String(row.id ?? ''),
    type: String(row.type ?? 'program') as ResourceType,
    districtId: row.district_id ? String(row.district_id) : undefined,
    schoolId: row.school_id ? String(row.school_id) : undefined,
    category: row.category ? String(row.category) : undefined,
    title: String(row.title ?? ''),
    summary: String(row.summary ?? ''),
    canonicalUrl: String(row.canonical_url ?? ''),
    sources: Array.isArray(row.sources) ? (row.sources as ResourceNode['sources']) : [],
    status: String(row.status ?? 'draft') as ResourceNode['status'],
    confidence: Number(row.confidence ?? 0),
    language: row.language ? String(row.language) : undefined,
    discoveredAt: String(row.discovered_at ?? new Date().toISOString()),
    lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined,
  };
}

/** BFS from a start node; collect reachable nodes + edges and pull out leaf artifacts. */
export function buildChain(nodes: ResourceNode[], edges: ResourceEdge[], startId: string): ResourceChain {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Array<{ to: string; type: ResourceEdge['type'] }>>();
  for (const e of edges) {
    const list = adj.get(e.from) ?? [];
    list.push({ to: e.to, type: e.type });
    adj.set(e.from, list);
  }

  const chain = emptyChain(startId);
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) {
      chain.nodes.push(node);
      switch (node.type) {
        case 'form': chain.forms.push(node); break;
        case 'application': chain.applications.push(node); break;
        case 'contact': chain.contacts.push(node); break;
        case 'deadline': chain.deadlines.push(node); break;
        case 'eligibility': chain.eligibility.push(node); break;
        case 'policy': chain.policies.push(node); break;
        default: break;
      }
    }
    for (const { to, type } of adj.get(id) ?? []) {
      chain.edges.push({ from: id, to, type });
      queue.push(to);
    }
  }
  return chain;
}

const defaultGraph = new ResourceGraph();

/** Search the graph for a program chain matching a category (or any program). */
export async function searchSchoolGraph(districtId: string, category?: string): Promise<ResourceChain | null> {
  const nodes = await defaultGraph.get(districtId);
  if (!nodes.length) return null;
  const edges = await defaultGraph.edges(districtId);

  const label = category?.toLowerCase().replace(/_/g, ' ') ?? '';
  let program = category
    ? nodes.find((n) => n.type === 'program' && (n.category ?? '').toUpperCase() === category.toUpperCase())
    : undefined;
  if (!program && label) {
    program = nodes.find(
      (n) => n.type === 'program' && (n.title.toLowerCase().includes(label) || (n.category ?? '').toLowerCase() === label),
    );
  }
  if (!program) program = nodes.find((n) => n.type === 'program');
  if (!program) return null;
  return buildChain(nodes, edges, program.id);
}

/** Persist a resource node via the module-level graph (the `save_resource` tool). */
export async function saveResource(node: ResourceNode): Promise<void> {
  await defaultGraph.save(node);
}

/** Flatten a chain into a compact, human/LLM-readable summary. */
export function chainSummary(chain: ResourceChain): string {
  const lines: string[] = [];
  for (const n of chain.nodes) lines.push(`- [${n.type}] ${n.title}: ${n.summary}${n.canonicalUrl ? ` (${n.canonicalUrl})` : ''}`);
  if (chain.eligibility.length) lines.push(`Eligibility: ${chain.eligibility.map((n) => n.summary).join('; ')}`);
  if (chain.forms.length) lines.push(`Form: ${chain.forms.map((n) => n.title).join(', ')}`);
  if (chain.contacts.length) lines.push(`Contact: ${chain.contacts.map((n) => n.title).join('; ')}`);
  if (chain.deadlines.length) lines.push(`Deadline: ${chain.deadlines.map((n) => n.title).join('; ')}`);
  return lines.join('\n');
}

/** The seeded SUESD/Soquel transportation chain (the brief's worked example). */
export function seedSuesdResourceGraph(): { nodes: ResourceNode[]; edges: ResourceEdge[] } {
  const now = new Date().toISOString();
  const mk = (
    id: string,
    type: ResourceNode['type'],
    title: string,
    summary: string,
    url: string,
    category?: string,
  ): ResourceNode => ({
    id,
    type,
    districtId: SUESD_ID,
    schoolId: type === 'school' ? id : undefined,
    category,
    title,
    summary,
    canonicalUrl: url,
    sources: [{ title, url }],
    status: 'verified',
    confidence: 0.9,
    discoveredAt: now,
    lastVerifiedAt: now,
  });

  const nodes: ResourceNode[] = [
    mk('suesd-district', 'district', DISTRICT.name, `${DISTRICT.name} — Capitola, CA`, 'https://www.suesd.org'),
    mk('school-soquel', 'school', SOQUEL_ELEMENTARY.name, `${SOQUEL_ELEMENTARY.name} — ${SOQUEL_ELEMENTARY.address}`, 'https://www.suesd.org/soquel'),
    mk('suesd-transportation', 'department', 'Transportation', 'District transportation department.', 'https://www.suesd.org/transportation'),
    mk('suesd-bus-eligibility', 'program', 'Bus Eligibility (McKinney-Vento)', 'Transportation to the school of origin for homeless/displaced students, and free/subsidized bus passes.', 'https://www.suesd.org/mckinney-vento', 'TRANSPORTATION'),
    mk('suesd-bus-eligibility-rule', 'eligibility', 'Bus eligibility', 'Homeless/displaced (McKinney-Vento) OR living beyond the distance threshold from the school of origin.', 'https://www.suesd.org/mckinney-vento'),
    mk('suesd-mv-policy', 'policy', 'McKinney-Vento Act', '42 U.S.C. §11432(g)(1)(J): transportation to the school of origin at the parent/guardian request.', 'https://www2.ed.gov/policy/elsec/leg/essa/legislation/mckinney-vento.pdf'),
    mk('suesd-transport-request', 'application', 'Transportation Request', 'Request transportation to the school of origin under McKinney-Vento.', 'https://www.suesd.org/transportation-request'),
    mk('suesd-transport-form', 'form', 'Transportation Request Form', 'Google Form to request bus transportation.', 'https://docs.google.com/forms/d/e/example'),
    mk('suesd-liaison', 'contact', `Homeless liaison: ${LIAISON.name}`, `${LIAISON.phone}, ${LIAISON.email}`, 'https://www.suesd.org/mckinney-vento'),
    mk('suesd-buspasses', 'contact', `Bus passes: ${BUS_PASSES.name}`, `${BUS_PASSES.phone}`, 'https://www.suesd.org/mckinney-vento'),
  ];

  const edges: ResourceEdge[] = [
    { from: 'school-soquel', to: 'suesd-district', type: 'belongs_to' },
    { from: 'suesd-district', to: 'suesd-transportation', type: 'has_department' },
    { from: 'suesd-transportation', to: 'suesd-bus-eligibility', type: 'runs' },
    { from: 'suesd-bus-eligibility', to: 'suesd-bus-eligibility-rule', type: 'has_eligibility' },
    { from: 'suesd-bus-eligibility', to: 'suesd-mv-policy', type: 'cites' },
    { from: 'suesd-bus-eligibility', to: 'suesd-transport-request', type: 'applied_via' },
    { from: 'suesd-transport-request', to: 'suesd-transport-form', type: 'uses_form' },
    { from: 'suesd-transport-request', to: 'suesd-liaison', type: 'has_contact' },
    { from: 'suesd-transport-request', to: 'suesd-buspasses', type: 'has_contact' },
  ];

  return { nodes, edges };
}
