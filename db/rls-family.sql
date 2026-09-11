-- Family-scoped Row Level Security (Block 0). Defense-in-depth for direct Postgres
-- access. The agent talks to Supabase with the service_role key (which BYPASSES RLS)
-- and ALSO scopes every query by guardian_id/family_id in code — that code scoping is
-- the authoritative isolation; these policies protect any anon/authenticated/direct
-- connection so family B can never read family A's rows.
--
-- Run in the Supabase SQL editor (or `npm run db:init`), AFTER db/schema.sql and the
-- per-feature tables (family_profile, case_record, connection, incoming_email,
-- family_inbox, consent_event).

-- ── Who is the current family? ────────────────────────────────────────────────
-- Prefer the Supabase JWT `sub` claim (auth.uid()); fall back to a session GUC so a
-- direct Postgres connection (the RLS test, psql, an admin tool) can set the family
-- explicitly with `set local app.family_id = '<id>'`.
create or replace function current_family_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('app.family_id', true), '')
  )
$$;

-- ── family_profile / case_record ──────────────────────────────────────────────
-- These key on guardian_id (the family id).
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

-- ── connection (Block 3) ──────────────────────────────────────────────────────
alter table connection enable row level security;

drop policy if exists connection_read on connection;
create policy connection_read on connection for select
  using (family_id = current_family_id());
drop policy if exists connection_write on connection;
create policy connection_write on connection for all
  using (family_id = current_family_id() or auth.role() = 'service_role')
  with check (family_id = current_family_id() or auth.role() = 'service_role');

-- ── incoming_email / family_inbox (Block 2) ───────────────────────────────────
alter table incoming_email enable row level security;
alter table family_inbox enable row level security;

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
