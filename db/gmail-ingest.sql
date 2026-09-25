-- Where the Gmail reader got to, per family (src/integrations/email-triage/gmail-ingest.ts).
-- The cursor only moves after a successful pass; last_error says why the last one failed.
create table if not exists gmail_ingest (
  guardian_id      text primary key,
  last_checked_at  timestamptz,
  last_error       text,
  updated_at       timestamptz not null default now()
);

alter table gmail_ingest enable row level security;
-- No policies: service_role only.
