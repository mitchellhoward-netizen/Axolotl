-- Supabase: typed school resource graph (run in the SQL editor).
-- The durable "moat": school → district → department → program → eligibility →
-- policy → application → form → contact → deadline. Reused across families; the
-- agent re-verifies only the leaf artifacts (form active? deadline current?).
create table if not exists resource (
  id text primary key,
  district_id text,
  school_id text,
  type text not null,               -- district|school|department|program|eligibility|policy|application|form|contact|deadline
  category text,                    -- TRANSPORTATION|MEALS|... (goal→program matching)
  title text not null,
  summary text not null,
  canonical_url text not null,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'draft',   -- verified | draft
  confidence numeric not null default 0,
  language text,
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists resource_edge (
  from_id text not null references resource(id),
  to_id text not null references resource(id),
  type text not null,               -- belongs_to|has_department|runs|has_eligibility|cites|applied_via|uses_form|has_contact|has_deadline
  primary key (from_id, to_id, type)
);

create index if not exists resource_district_idx on resource (district_id);
create index if not exists resource_type_idx on resource (type);
create index if not exists resource_category_idx on resource (category);
create index if not exists resource_edge_from_idx on resource_edge (from_id);
