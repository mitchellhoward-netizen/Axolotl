import 'dotenv/config';
import { KnowledgeGraph, autoResearchDistrict } from '../src/knowledge/graph.js';
import { embeddingsConfigured, indexDistrict } from '../src/integrations/embeddings.js';
import { districtIdFromName, researchDistrictProfile } from '../src/knowledge/districts.js';

/**
 * Populate the `embedding` (vector) column for a district's knowledge graph,
 * then verify pgvector retrieval works.
 *
 * Usage: `npm run index:knowledge -- "<district or school name>"` e.g.
 *   `npm run index:knowledge -- "Seattle Public Schools"`
 * Uses the stable, research-derived district id for the given name; researches
 * it on demand if needed. No district is hardcoded.
 *
 * Prereqs (in .env / Supabase):
 *   - EMBEDDINGS_API_KEY + EMBEDDINGS_MODEL set for a real embeddings provider
 *     (OpenAI text-embedding-3-small, Voyage, Cohere, etc.) — note DeepSeek does
 *     NOT provide an embeddings endpoint.
 *   - The `knowledge_node` + `match_knowledge` SQL from db/*.sql applied.
 */

const TARGET_NAME = (process.argv[2] ?? '').trim() || 'Seattle Public Schools';
const TARGET_ID = districtIdFromName(TARGET_NAME);

async function main() {
  if (!embeddingsConfigured()) {
    console.error(
      'embeddings not configured — set EMBEDDINGS_API_KEY + EMBEDDINGS_MODEL in .env (and EMBEDDINGS_BASE_URL if not OpenAI).',
    );
    process.exit(1);
  }

  const graph = new KnowledgeGraph();
  // Research the district's profile first (so it's registered / known), then
  // ensure the knowledge graph has nodes (web crawl or generic drafts).
  const profile = await researchDistrictProfile(TARGET_NAME);
  let nodes = await graph.get(TARGET_ID);
  if (nodes.length === 0) {
    nodes = await autoResearchDistrict(graph, TARGET_ID, profile.elementary ?? profile.name, profile.name);
  }
  const indexed = await indexDistrict(TARGET_ID, nodes);
  console.log(`indexed ${indexed}/${nodes.length} nodes for ${profile.name} (${TARGET_ID})`);

  const vec = nodes[0]?.embedding;
  if (vec?.length) {
    const hits = await graph.search(TARGET_ID, vec, 3);
    console.log(`match_knowledge returned ${hits.length} hit(s) for "${nodes[0]?.title}".`);
  } else {
    console.log('no vector populated yet — check EMBEDDINGS_API_KEY / EMBEDDINGS_MODEL and the endpoint.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
