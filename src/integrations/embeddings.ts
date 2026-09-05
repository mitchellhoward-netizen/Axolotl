import 'dotenv/config';
import type { KnowledgeNode } from '../domain/knowledge.js';
import { getSupabase } from './db.js';

/**
 * Embedding + retrieval (pgvector). Env-gated: set EMBEDDINGS_API_KEY +
 * EMBEDDINGS_MODEL (OpenAI-compatible embeddings endpoint) to enable. Without
 * them, retrieval falls back to the graph store (category/keyword), not vectors.
 */

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.EMBEDDINGS_API_KEY && process.env.EMBEDDINGS_MODEL);
}

/** Embed a text → vector, or null if embeddings aren't configured / the call fails. */
export async function embedText(text: string): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  const url = process.env.EMBEDDINGS_BASE_URL ?? 'https://api.openai.com/v1/embeddings';
  const model = process.env.EMBEDDINGS_MODEL!;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.EMBEDDINGS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Embed many texts in ONE request (avoids per-call rate limits). Returns an array
 * aligned with `texts`, or null on failure. Use for indexing.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsConfigured() || !texts.length) return null;
  const url = process.env.EMBEDDINGS_BASE_URL ?? 'https://api.openai.com/v1/embeddings';
  const model = process.env.EMBEDDINGS_MODEL!;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.EMBEDDINGS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    const out = data.data?.map((d) => d.embedding) ?? [];
    return out.length === texts.length ? out : null;
  } catch {
    return null;
  }
}

/** Embed + persist the `embedding` column for every node in a district. Returns count. */
export async function indexDistrict(districtId: string, nodes: KnowledgeNode[]): Promise<number> {
  const c = getSupabase();
  if (!c || !embeddingsConfigured() || !nodes.length) return 0;
  const texts = nodes.map((n) => `${n.category}: ${n.title}. ${n.summary}`);
  const embs = await embedTexts(texts);
  if (!embs) return 0;
  let indexed = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const emb = embs[i];
    if (!node || !emb) continue;
    const { error } = await c.from('knowledge_node').update({ embedding: emb }).eq('id', node.id);
    if (!error) indexed++;
  }
  return indexed;
}
