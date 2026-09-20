-- Form targets and recipes (Agent I: stop rediscovering the same form every time).
--
-- Run in the Supabase SQL editor, or apply with the other db/*.sql files.
--
-- `form_recipe` WAS NEVER DEFINED ANYWHERE. The store in src/integrations/form-recipes.ts
-- writes to it and never checked the error, so on a database without this table every
-- "learned" recipe was silently dropped and only the in-process map survived (i.e. nothing
-- survived a redeploy). Creating it here is what makes that feature real.

-- ── form_target: the URL that actually worked, per host + program ─────────────
-- `key` is `<host>|<program>` — the host is the school's domain, so a target is per school
-- and per program, never global. The row keeps the whole object so the contract can grow
-- without a migration; url/host/program are mirrored into columns for querying.
create table if not exists form_target (
  key         text primary key,
  url         text not null,
  host        text not null,
  program     text not null,
  target      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists form_target_host_idx on form_target (host);

-- ── form_recipe: how to fill a form, learned from a verified fill ─────────────
-- Keyed by URL (the existing contract's conflict target), one row per form.
create table if not exists form_recipe (
  url         text primary key,
  guardian_id text,
  recipe      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same posture as the other feature tables: enabled, service_role only. These rows describe
-- FORMS, not families — but a recipe can name the fields of a school's form, so they are not
-- public reads either.
alter table form_target enable row level security;
alter table form_recipe enable row level security;

drop policy if exists form_target_service_all on form_target;
create policy form_target_service_all on form_target
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists form_recipe_service_all on form_recipe;
create policy form_recipe_service_all on form_recipe
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Confirm:
--   select key, url, target->>'successCount' as wins, target->>'unhealthyAt' as unhealthy
--   from form_target order by updated_at desc;
