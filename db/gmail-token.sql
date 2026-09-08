-- Per-parent Gmail connection (the "connect your school email" gate).
-- The parent authorizes the agent to send email AS them (gmail.send) and to read
-- the school's replies (gmail.readonly). Store the OAuth tokens per guardian.
create table if not exists gmail_token (
  guardian_id  text primary key,
  email        text,
  refresh_token text,
  access_token text not null default '',
  expires_at   bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table gmail_token enable row level security;

-- Read/write access for the service role (the agent). Owners (guardians) read
-- their own row if they need to (e.g. to check connected status).
create policy "gmail_token_select_own" on gmail_token
  for select using (auth.uid()::text = guardian_id);
create policy "gmail_token_service_all" on gmail_token
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
