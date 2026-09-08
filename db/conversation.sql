-- Conversation history (so the agent's full thread survives restarts + scales).
-- One row per message, keyed by conversation (space) id; the agent rehydrates the
-- whole thread on first contact and recalls any past turn.
create table if not exists message (
  id              bigint generated always as identity primary key,
  conversation_id text not null,
  role            text not null check (role in ('user','assistant')),
  content         text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists message_conversation_id_idx on message (conversation_id, created_at);

alter table message enable row level security;

create policy "message_select_own" on message
  for select using (auth.uid()::text = conversation_id);
create policy "message_service_all" on message
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
