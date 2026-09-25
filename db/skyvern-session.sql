-- Skyvern browser sessions we opened, and the deadline each closes by
-- (src/integrations/skyvern-sessions.ts). A session bills while open, idle or not; this table
-- lets a redeploy keep enforcing those deadlines instead of leaving sessions to Skyvern's
-- own timeout. Rows are removed as soon as the session is closed.
create table if not exists skyvern_session (
  id          text primary key,
  purpose     text not null,
  opened_at   timestamptz not null default now(),
  close_by    timestamptz not null
);

create index if not exists skyvern_session_close_by_idx on skyvern_session (close_by);

alter table skyvern_session enable row level security;
-- No policies: service_role only.
