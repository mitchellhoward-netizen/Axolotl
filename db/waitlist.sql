-- Supabase: the three website signups, in one table.
--
-- The site collects a family pilot signup, a parent circle signup and a school
-- pilot request. They share a table with a `kind` column so the three audiences
-- stay separable with a query, and so one endpoint and one validator serve all
-- three. What each kind fills in:
--
--   family  phone
--   circle  phone, families (2 to 3 | 4 to 6 | 7 or more), school (optional)
--   school  name, role, school, email, message (optional)
--
-- Run this file only for a fresh install. An existing database that already has
-- the old phone-only table should run db/signups.sql instead.
--
-- Apply in Supabase only with approval, before deploying the new signup forms.

create table if not exists waitlist (
  id bigint generated always as identity primary key,
  kind text not null default 'family' check (kind in ('family', 'circle', 'school')),
  phone text check (phone is null or char_length(phone) <= 32),
  email text check (email is null or char_length(email) between 3 and 254),
  name text check (name is null or char_length(name) <= 120),
  role text check (role is null or char_length(role) <= 120),
  school text check (school is null or char_length(school) <= 160),
  families text check (families is null or char_length(families) <= 20),
  message text check (message is null or char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

-- Only the server writes here, and it uses the service role key. Nothing in the
-- browser touches this table, so no policy is needed: revoke everything else.
alter table public.waitlist enable row level security;
revoke all on public.waitlist from public, anon, authenticated;
revoke all on sequence public.waitlist_id_seq from public, anon, authenticated;
grant select, insert on public.waitlist to service_role;
grant usage on sequence public.waitlist_id_seq to service_role;

-- Reviewing signups means filtering by kind, newest first.
create index if not exists waitlist_kind_created_at_idx on waitlist (kind, created_at desc);
