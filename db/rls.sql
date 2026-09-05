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

-- Family memory: a guardian may only read/write their own row. Replace the
-- placeholder with your real guardian binding (e.g. a profile join on auth.uid()).
create policy family_memory_read on family_memory for select
  using (true); -- TODO: guard with (guardian_id = auth.uid()::text) once you map users→guardians.
create policy family_memory_write on family_memory for insert
  with check (auth.role() = 'service_role');

-- Verification + followups: only service_role writes; reads permit authed only.
create policy verification_write on verification for insert with check (auth.role() = 'service_role');
create policy followup_write on followup for insert with check (auth.role() = 'service_role');
create policy pending_greeting_write on pending_greeting for insert with check (auth.role() = 'service_role');
