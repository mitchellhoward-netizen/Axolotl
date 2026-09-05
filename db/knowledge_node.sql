-- Supabase: knowledge graph node store (run in the SQL editor).
-- One row per grounded fact about a school/district (or a law that applies).
-- Requires the pgvector extension for the embedding column.
create extension if not exists vector;

create table if not exists knowledge_node (
  id text primary key,
  district_id text,
  school_id text,
  category text not null,           -- TRANSPORTATION | MEALS | ... | LAW
  title text not null,
  summary text not null,
  sources jsonb not null default '[]'::jsonb,
  jurisdiction text not null,       -- federal | state | district | school
  law text,
  status text not null default 'draft',  -- verified | draft
  confidence numeric not null default 0,
  embedding vector(1024),
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_node_district_idx on knowledge_node (district_id);
create index if not exists knowledge_node_category_idx on knowledge_node (category);
