-- Supabase: create the waitlist table (run in the SQL editor)
create table if not exists waitlist (
  id bigint generated always as identity primary key,
  phone text not null,
  created_at timestamptz not null default now()
);
