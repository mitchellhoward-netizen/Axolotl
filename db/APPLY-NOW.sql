-- ============================================================================
-- APPLY-NOW.sql — the SQL that is outstanding on the live database.
--
-- Paste the whole thing into the Supabase SQL editor and run it. Every statement is
-- idempotent, so running it twice is safe, and nothing here deletes data.
--
-- Why these three blocks and not the whole db/ folder:
--   * BLOCK 1 tells you what is actually applied (read-only — run it even if you run
--     nothing else, and keep the output; it is the evidence we currently lack).
--   * BLOCK 2 is required by the retention job, which is otherwise correct but slow.
--   * BLOCK 3 closes the one RLS policy that was world-readable.
--
-- The rest of db/*.sql (benny.sql, consent.sql, conversation.sql, email-triage.sql,
-- gmail-token.sql, processed-message.sql, connections.sql, rls-family.sql) should be
-- applied too if they have not been. They are not in here because I could not verify
-- which of them are already live, and re-running a file that creates types or policies
-- can error on a database where it was partially applied. BLOCK 1 tells you which are
-- missing so you can run them deliberately.
-- ============================================================================


-- ── BLOCK 1 — WHAT IS APPLIED (read-only; keep the output) ──────────────────
-- Any row with relrowsecurity = false is a table with no row-level security at all.
-- The agent talks to Postgres with the service_role key, which BYPASSES RLS, so this
-- is defence-in-depth against a leaked anon key or direct database access — not the
-- boundary that protects the agent's own reads.

select c.relname                as table_name,
       c.relrowsecurity         as rls_enabled,
       c.relforcerowsecurity    as rls_forced,
       count(p.policyname)      as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.tablename = c.relname and p.schemaname = n.nspname
where n.nspname = 'public'
  and c.relkind = 'r'
group by 1, 2, 3
order by c.relrowsecurity asc, c.relname asc;


-- ── BLOCK 2 — the index the retention sweep needs ───────────────────────────
-- docs/PRIVACY-AND-COMPLIANCE.md publishes a 90-day window on `message` and a 60-day
-- window on `incoming_email`; scripts/prune-retention.ts enforces both. `incoming_email`
-- already has an index on received_at. `message` only has (conversation_id, created_at),
-- which cannot serve a prune that deliberately ignores the conversation — so without this
-- the nightly sweep sequential-scans the entire message history.

create index if not exists message_created_at_idx on message (created_at);


-- ── BLOCK 3 — the world-readable family_memory policy ───────────────────────
-- This policy was `using (true)`: every family's situation graph (needs, challenges,
-- housing, IEP-adjacent detail) was readable by any role holding the anon key. The
-- scoped replacement is in db/rls.sql; this is that fix, idempotent, so it can be
-- applied on its own.

create or replace function current_family_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('app.family_id', true), '')
  )
$$;

alter table family_memory enable row level security;

drop policy if exists family_memory_read on family_memory;
create policy family_memory_read on family_memory for select
  using (guardian_id = current_family_id());

-- Writes stay with the service role; a parent never writes family memory directly.
drop policy if exists family_memory_write on family_memory;
create policy family_memory_write on family_memory for insert
  with check (auth.role() = 'service_role');


-- ── BLOCK 4 — confirm BLOCK 3 took effect (read-only) ───────────────────────
-- Expect exactly one row, with qual = (guardian_id = current_family_id()).
-- If qual still reads `true`, the old policy is still in place.

select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'family_memory'
order by policyname;
