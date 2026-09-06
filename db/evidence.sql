-- Supabase: evidence store (run in the SQL editor).
-- One row per verified claim — never store only an answer. The audit trail the
-- verification stage (src/agent/verify.ts) writes and reads.
create table if not exists evidence (
  id text primary key,
  claim text not null,
  source_url text not null,
  source_title text not null,
  source_type text not null,       -- district_page | school_page | policy | form | pdf | contact | other
  evidence_span text,
  retrieved_at timestamptz not null default now(),
  verified_at timestamptz,
  jurisdiction text,               -- federal | state | district | school
  official boolean not null default false,
  confidence numeric not null default 0,
  status text not null default 'discovered',  -- discovered|plausible|verified|confirmed|stale|contradictory
  corroborated_by jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists evidence_status_idx on evidence (status);
create index if not exists evidence_source_url_idx on evidence (source_url);
