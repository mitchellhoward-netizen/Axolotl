-- Connectors (Block 3). A `connection` is a parent's read-only link to a school
-- portal (Aeries/PowerSchool/…). We NEVER store a password: the only credential we
-- hold is a Skyvern browser_profile_id handle that Skyvern maintains. Run in the
-- Supabase SQL editor (or `npm run db:init`).
create table if not exists connection (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  kind text not null,                       -- 'parent_portal'
  method text not null default 'browser',   -- 'browser'|'oauth'|'mcp'
  label text,
  portal_type text,                          -- 'aeries'|'powerschool'|...
  login_url text,
  read_url text,
  extract_schema jsonb,                      -- what to pull
  skyvern_browser_profile_id text,           -- bp_...  (the ONLY credential we hold)
  skyvern_session_id text,                   -- transient, during connect
  status text not null default 'pending',    -- pending|awaiting_login|connected|expired|revoked
  connect_token text unique,                 -- for the parent takeover URL
  consented_at timestamptz,
  last_verified timestamptz,
  created_at timestamptz default now()
);

create index if not exists connection_family_idx on connection(family_id);
create unique index if not exists connection_family_kind_idx on connection(family_id, kind);

alter table connection enable row level security;
-- RLS policies live in db/rls-family.sql (family_id = current family only).
