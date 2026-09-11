-- Consent audit log (Block 0). Every consequential consent the parent gives is
-- recorded here: onboarding, email monitoring, portal connection, and each
-- consent-gated action (submit / send / call / account). Run in the Supabase SQL
-- editor (or `npm run db:init`).
create table if not exists consent_event (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  kind text not null,              -- 'onboarding'|'email_monitoring'|'connection:parent_portal'|'action:submit'|...
  detail jsonb,                    -- what was consented to (scope, target)
  created_at timestamptz default now()
);

create index if not exists consent_event_family_idx on consent_event(family_id, created_at desc);

alter table consent_event enable row level security;

-- A family may only see its own consent records; only the service role writes.
drop policy if exists consent_event_read on consent_event;
create policy consent_event_read on consent_event for select
  using (family_id = current_family_id());
drop policy if exists consent_event_write on consent_event;
create policy consent_event_write on consent_event for insert
  with check (auth.role() = 'service_role');
