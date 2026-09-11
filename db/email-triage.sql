-- Email triage (Block 2). A parent forwards school mail to their per-family address
-- (local_part@INBOUND_DOMAIN); a Cloudflare Email Worker POSTs it to
-- /webhooks/inbound-email. We store a SUMMARY + what needs doing — never the raw body.
-- Run in the Supabase SQL editor (or `npm run db:init`).
create table if not exists family_inbox (
  family_id text primary key,
  local_part text unique not null,           -- e.g. patrick-a1b2
  school_domains text[] not null default '{}',
  monitoring_consented_at timestamptz
);

create table if not exists incoming_email (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  message_id text unique,                    -- dedupe
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
-- RLS policies live in db/rls-family.sql (family_id = current family only).
