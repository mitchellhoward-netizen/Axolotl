-- Durable message dedupe: record each processed inbound message id so a stray
-- second agent instance / duplicate webhook delivery is a no-op, not a 2nd reply.
create table if not exists processed_message (
  id         text primary key,
  created_at timestamptz not null default now()
);

alter table processed_message enable row level security;

drop policy if exists "processed_message_service_all" on processed_message;
create policy "processed_message_service_all" on processed_message
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
