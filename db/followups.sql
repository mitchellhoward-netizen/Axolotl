-- Supabase: create the follow-up queue table (run in the SQL editor).
-- Durable store for the proactive "always-on advocate" follow-ups so they
-- survive restarts. Mirrors src/agent/followup.ts FollowUp rows.
create table if not exists followup (
  id text primary key,
  conversation_id text not null,
  case_id text not null,
  kind text not null,                -- 'verify' | 'chase' | 'update'
  due_at timestamptz not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists followup_due_at_idx on followup (due_at);
create index if not exists followup_conversation_idx on followup (conversation_id);
