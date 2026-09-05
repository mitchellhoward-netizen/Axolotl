-- Supabase: family memory graph store (run in the SQL editor).
-- One row per guardian — the continuously updated memory graph (needs, getting,
-- initiatives, issue snapshot) that the always-on advocate reads and writes.
create table if not exists family_memory (
  guardian_id text primary key,
  memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
