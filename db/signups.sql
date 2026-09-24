-- Supabase: migrate an existing phone-only `waitlist` table to the three signup
-- kinds the site now collects (family pilot, parent circle, school pilot).
--
-- Apply in Supabase only with approval, BEFORE deploying the new signup forms:
-- the forms post `kind` and the detail columns, and an insert naming a column
-- that does not exist fails.
--
-- Safe to run more than once. Existing rows keep kind = 'family', which is what
-- they are.

begin;

alter table public.waitlist add column if not exists kind text;
alter table public.waitlist add column if not exists email text;
alter table public.waitlist add column if not exists name text;
alter table public.waitlist add column if not exists role text;
alter table public.waitlist add column if not exists school text;
alter table public.waitlist add column if not exists families text;
alter table public.waitlist add column if not exists message text;

-- A school request has no phone number, so the old not-null constraint has to go.
alter table public.waitlist alter column phone drop not null;

-- Backfill before adding the constraint, or the default never lands on old rows.
update public.waitlist set kind = 'family' where kind is null;
alter table public.waitlist alter column kind set default 'family';
alter table public.waitlist alter column kind set not null;

alter table public.waitlist drop constraint if exists waitlist_kind_check;
alter table public.waitlist
  add constraint waitlist_kind_check check (kind in ('family', 'circle', 'school'));

alter table public.waitlist drop constraint if exists waitlist_phone_check;
alter table public.waitlist
  add constraint waitlist_phone_check check (phone is null or char_length(phone) <= 32);
alter table public.waitlist drop constraint if exists waitlist_email_check;
alter table public.waitlist
  add constraint waitlist_email_check check (email is null or char_length(email) between 3 and 254);
alter table public.waitlist drop constraint if exists waitlist_name_check;
alter table public.waitlist
  add constraint waitlist_name_check check (name is null or char_length(name) <= 120);
alter table public.waitlist drop constraint if exists waitlist_role_check;
alter table public.waitlist
  add constraint waitlist_role_check check (role is null or char_length(role) <= 120);
alter table public.waitlist drop constraint if exists waitlist_school_check;
alter table public.waitlist
  add constraint waitlist_school_check check (school is null or char_length(school) <= 160);
alter table public.waitlist drop constraint if exists waitlist_families_check;
alter table public.waitlist
  add constraint waitlist_families_check check (families is null or char_length(families) <= 20);
alter table public.waitlist drop constraint if exists waitlist_message_check;
alter table public.waitlist
  add constraint waitlist_message_check check (message is null or char_length(message) <= 2000);

-- Only the server writes here, and it uses the service role key.
alter table public.waitlist enable row level security;
revoke all on public.waitlist from public, anon, authenticated;
revoke all on sequence public.waitlist_id_seq from public, anon, authenticated;
grant select, insert on public.waitlist to service_role;
grant usage on sequence public.waitlist_id_seq to service_role;

create index if not exists waitlist_kind_created_at_idx on waitlist (kind, created_at desc);

commit;
