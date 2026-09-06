-- Supabase: procedural-memory skill store (run in the SQL editor).
-- One row per verified, parameterized workflow ("Skill Factory"). On reuse the
-- agent re-verifies only the leaf artifacts referenced in evidence_deps.
create table if not exists skill (
  id text primary key,
  name text not null,
  key text not null,
  description text not null,
  when_to_use text not null default '',
  steps jsonb not null default '[]'::jsonb,
  evidence_deps jsonb not null default '[]'::jsonb,
  status text not null default 'active',   -- active | stale | deprecated
  approved boolean not null default false,
  version integer not null default 1,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists skill_key_idx on skill (key);
