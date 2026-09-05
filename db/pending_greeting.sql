-- Supabase: pending iMessage greeting store (run in the SQL editor).
-- When the waitlist confirmation can't be sent as SMS, we hold the message here
-- and the agent sends it over iMessage when the parent first texts.
create table if not exists pending_greeting (
  phone text primary key,
  message text not null,
  created_at timestamptz not null default now()
);
