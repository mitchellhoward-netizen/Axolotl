-- ============================================================================
-- Axolotl — TONIGHT build migrations (Blocks 0, 2, 3).  Run in order, in the
-- Supabase SQL editor.  Safe to re-run (every statement is IF NOT EXISTS / OR
-- REPLACE / DROP POLICY IF EXISTS).
--
-- PREREQUISITES (already applied):
--   * db/schema.sql  — creates guardian, district, family_profile, case_record, …
--   * db/rls.sql     — the earlier feature tables' policies
--
-- ONE ORDER-DEPENDENCY: section 3 defines current_family_id(); sections 1, 2 and 4
-- reference the tables/policies it needs, so run 1 → 2 → 3 → 4 as laid out below.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) CONNECTION  (Block 3 — parent-portal connectors)
-- ────────────────────────────────────────────────────────────────────────────
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
-- NOT unique: a family may reconnect (e.g. after an expired login), which inserts a new
-- row. Reads pick the newest non-revoked row for (family_id, kind).
create index if not exists connection_family_kind_idx on connection(family_id, kind);

alter table connection enable row level security;
-- policies: section 3


-- ────────────────────────────────────────────────────────────────────────────
-- 2) EMAIL TRIAGE  (Block 2 — family_inbox + incoming_email)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists family_inbox (
  family_id text primary key,
  local_part text unique not null,           -- e.g. patrick-a1b2
  school_domains text[] not null default '{}',
  monitoring_consented_at timestamptz
);

create table if not exists incoming_email (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  message_id text unique,                    -- dedupe (idempotency key)
  from_domain text,
  from_address text,                         -- the school's own address (to reply to); not family PII
  received_at timestamptz default now(),
  summary text,                              -- extracted; NO raw body stored
  action_type text,                          -- form|deadline|payment|conference|absence|event|info
  urgency text,                              -- now|soon|fyi
  deadline text,
  status text default 'new'                  -- new|surfaced|actioned|dismissed
);

create index if not exists incoming_email_family_status_idx on incoming_email(family_id, status);
create index if not exists incoming_email_received_idx on incoming_email(received_at desc);

alter table family_inbox enable row level security;
alter table incoming_email enable row level security;
-- policies: section 3


-- ────────────────────────────────────────────────────────────────────────────
-- 3) FAMILY-SCOPED RLS  (Block 0) — the helper + the policies for family_profile,
--    case_record, connection, incoming_email, family_inbox.
--    The agent uses the service_role key (bypasses RLS) and ALSO scopes every query
--    by guardian_id/family_id in code; these policies protect direct/anon access.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function current_family_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('app.family_id', true), '')
  )
$$;

alter table family_profile enable row level security;
alter table case_record enable row level security;

drop policy if exists family_profile_read on family_profile;
create policy family_profile_read on family_profile for select
  using (guardian_id = current_family_id());
drop policy if exists family_profile_write on family_profile;
create policy family_profile_write on family_profile for all
  using (guardian_id = current_family_id() or auth.role() = 'service_role')
  with check (guardian_id = current_family_id() or auth.role() = 'service_role');

drop policy if exists case_record_read on case_record;
create policy case_record_read on case_record for select
  using (guardian_id = current_family_id());
drop policy if exists case_record_write on case_record;
create policy case_record_write on case_record for all
  using (guardian_id = current_family_id() or auth.role() = 'service_role')
  with check (guardian_id = current_family_id() or auth.role() = 'service_role');

drop policy if exists connection_read on connection;
create policy connection_read on connection for select
  using (family_id = current_family_id());
drop policy if exists connection_write on connection;
create policy connection_write on connection for all
  using (family_id = current_family_id() or auth.role() = 'service_role')
  with check (family_id = current_family_id() or auth.role() = 'service_role');

drop policy if exists incoming_email_read on incoming_email;
create policy incoming_email_read on incoming_email for select
  using (family_id = current_family_id());
drop policy if exists incoming_email_write on incoming_email;
create policy incoming_email_write on incoming_email for all
  using (family_id = current_family_id() or auth.role() = 'service_role')
  with check (family_id = current_family_id() or auth.role() = 'service_role');

drop policy if exists family_inbox_read on family_inbox;
create policy family_inbox_read on family_inbox for select
  using (family_id = current_family_id());
drop policy if exists family_inbox_write on family_inbox;
create policy family_inbox_write on family_inbox for all
  using (family_id = current_family_id() or auth.role() = 'service_role')
  with check (family_id = current_family_id() or auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- 4) CONSENT AUDIT LOG  (Block 0) — needs current_family_id() from section 3.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists consent_event (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  kind text not null,              -- 'onboarding'|'email_monitoring'|'connection:parent_portal'|'action:submit'|...
  detail jsonb,                    -- what was consented to (scope, target)
  created_at timestamptz default now()
);

create index if not exists consent_event_family_idx on consent_event(family_id, created_at desc);

alter table consent_event enable row level security;

drop policy if exists consent_event_read on consent_event;
create policy consent_event_read on consent_event for select
  using (family_id = current_family_id());
drop policy if exists consent_event_write on consent_event;
create policy consent_event_write on consent_event for insert
  with check (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- 5) VERIFY (optional) — should return the 4 new tables.
-- ────────────────────────────────────────────────────────────────────────────
-- select table_name from information_schema.tables
--  where table_schema = 'public'
--    and table_name in ('connection','family_inbox','incoming_email','consent_event')
--  order by table_name;
