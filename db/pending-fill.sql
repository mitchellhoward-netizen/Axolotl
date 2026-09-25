-- In-flight Skyvern fills (src/integrations/pending-fill-store.ts).
--
-- Without this table a redeploy during a fill loses the run: the webhook reaches a fresh
-- process with no record of which family it belongs to, and the parent never hears back.
-- Rows carry the values typed into the form, so they are deleted as soon as the fill
-- resolves; anything older than a day is abandoned and safe to purge.
create table if not exists pending_fill (
  run_id      text primary key,
  fill        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table pending_fill enable row level security;
-- No policies: service_role only, like the other family-data tables.
