-- Supabase: pgvector retrieval (run in the SQL editor).
-- Cosine-similarity search over knowledge_node embeddings, scoped to a district.
create or replace function match_knowledge(
  query_embedding vector(1024),
  district_id text,
  match_count int default 5,
  match_category text default null
)
returns setof knowledge_node
language sql stable
as $$
  select *
  from knowledge_node
  where district_id = match_knowledge.district_id
    and (match_category is null or category = match_category)
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
