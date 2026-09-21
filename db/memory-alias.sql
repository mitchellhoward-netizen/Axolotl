-- Family aliases: other words a family uses for the same thing (docs/MEMORY-COMPARISON.md,
-- "steal this"). Recall is substring matching, so without this a parent who said "the noodles
-- place" and later asks about "pasta" finds nothing, and a typo finds nothing either.
--
-- Keyed by family_id so deletion reaches it by the same path as everything else
-- (src/integrations/identity.ts -> deleteFamilyData), and so one family's words can never
-- surface in another family's recall.
--
-- `source` is stored because a PARENT-sourced alias must keep outranking a model-generated
-- one on every read, not just on the turn it was written. Model-generated aliases are a
-- separate, untrusted category: a drifting alias surfaces the wrong memory about a child,
-- which is worse than no alias at all.

create table if not exists memory_alias (
  family_id   text not null,
  alias       text not null,
  canonical   text not null,
  source      text not null default 'parent',
  created_at  timestamptz not null default now(),
  primary key (family_id, alias, canonical)
);

create index if not exists memory_alias_family_idx on memory_alias (family_id);

-- Same posture as the other family tables: RLS enabled, service_role only. These rows are a
-- family's own vocabulary, so they are never public reads.
alter table memory_alias enable row level security;

drop policy if exists memory_alias_service_all on memory_alias;
create policy memory_alias_service_all on memory_alias
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
