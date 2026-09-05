import 'dotenv/config';
import { KnowledgeGraph, autoResearchDistrict } from '../src/knowledge/graph.js';
import { embeddingsConfigured, indexDistrict } from '../src/integrations/embeddings.js';

/**
 * Populate the `embedding` (vector) column for the knowledge graph, then verify
 * pgvector retrieval works.
 *
 * Prereqs (in .env / Supabase):
 *   - EMBEDDINGS_API_KEY + EMBEDDINGS_MODEL set for a real embeddings provider
 *     (OpenAI text-embedding-3-small, Voyage, Cohere, etc.) — note DeepSeek does
 *     NOT provide an embeddings endpoint.
 *   - The `knowledge_node` + `match_knowledge` SQL from db/*.sql applied.
 *
 * Run: npm run index:knowledge
 */

const TARGETS = [
  { id: 'district-suesd', name: 'Soquel Union Elementary School District', school: 'Soquel Elementary School' },
];

async function main() {
  if (!embeddingsConfigured()) {
    console.error(
      'embeddings not configured — set EMBEDDINGS_API_KEY + EMBEDDINGS_MODEL in .env (and EMBEDDINGS_BASE_URL if not OpenAI).',
    );
    process.exit(1);
  }

  const graph = new KnowledgeGraph();
  for (const t of TARGETS) {
    let nodes = await graph.get(t.id);
    if (nodes.length === 0) {
      nodes = await autoResearchDistrict(graph, t.id, t.school, t.name);
    }
    const indexed = await indexDistrict(t.id, nodes);
    console.log(`indexed ${indexed}/${nodes.length} nodes for ${t.name}`);

    const vec = nodes[0]?.embedding;
    if (vec?.length) {
      const hits = await graph.search(t.id, vec, 3);
      console.log(`match_knowledge returned ${hits.length} hit(s) for "${nodes[0]?.title}".`);
    } else {
      console.log('no vector populated yet — check EMBEDDINGS_API_KEY / EMBEDDINGS_MODEL and the endpoint.');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
