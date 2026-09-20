-- Supabase: multi-tenant Row Level Security (defense-in-depth), run in the SQL editor.
-- The agent calls via the service_role key (which bypasses RLS); these policies
-- protect the anon/authenticated keys and any direct Postgres access. The app
-- also scopes every query by guardian_id / district_id in code — that is the
-- authoritative isolation. Placeholder auth scoping below is intentional: the
-- exact condition depends on how you bind an authenticated user to a guardian_id.

-- Enable RLS on the family/student tables.
alter table family_memory enable row level security;
alter table knowledge_node enable row level security;
alter table verification enable row level security;
alter table followup enable row level security;
alter table pending_greeting enable row level security;

-- ── Example policies (defense-in-depth) ────────────────────────────────────
-- Knowledge is public-ish per district; reads allowed, writes via service_role.
create policy knowledge_node_read on knowledge_node for select using (true);
create policy knowledge_node_write on knowledge_node for insert
  with check (auth.role() = 'service_role');

-- Family memory: a guardian may only read their own row.
--
-- This policy used to be `using (true)` with a TODO. family_memory is the family's
-- situation graph (needs, challenges, housing, IEP-adjacent detail), so world-readable
-- was the worst possible default: any role holding the anon key could read every family.
-- current_family_id() is defined idempotently here as well as in rls-family.sql, so this
-- file is safe to run on its own.
create or replace function current_family_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('app.family_id', true), '')
  )
$$;

drop policy if exists family_memory_read on family_memory;
create policy family_memory_read on family_memory for select
  using (guardian_id = current_family_id());
create policy family_memory_write on family_memory for insert
  with check (auth.role() = 'service_role');

-- Verification + followups: only service_role writes; reads permit authed only.
create policy verification_write on verification for insert with check (auth.role() = 'service_role');
create policy followup_write on followup for insert with check (auth.role() = 'service_role');
create policy pending_greeting_write on pending_greeting for insert with check (auth.role() = 'service_role');

-- Evidence: district-shared knowledge. Reads allowed; writes via service_role.
alter table evidence enable row level security;
create policy evidence_read on evidence for select using (true);
create policy evidence_write on evidence for insert with check (auth.role() = 'service_role');

-- Resource graph: district-shared. Reads allowed; writes via service_role.
alter table resource enable row level security;
alter table resource_edge enable row level security;
create policy resource_read on resource for select using (true);
create policy resource_write on resource for insert with check (auth.role() = 'service_role');
create policy resource_edge_read on resource_edge for select using (true);
create policy resource_edge_write on resource_edge for insert with check (auth.role() = 'service_role');

-- Procedural-memory skills: district-shared. Reads allowed; writes via service_role.
alter table skill enable row level security;
create policy skill_read on skill for select using (true);
create policy skill_write on skill for insert with check (auth.role() = 'service_role');
