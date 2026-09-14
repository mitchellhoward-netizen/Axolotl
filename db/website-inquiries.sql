-- Apply in Supabase only with approval, before deploying the employer inquiry form.
-- Uses existing SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY server environment variables.
-- Team members review inquiries here; this does not send email notifications.
begin;

create table public.website_inquiries (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 3 and 254),
  company text not null default '' check (char_length(company) <= 160),
  message text not null default '' check (char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.website_inquiries enable row level security;
revoke all on public.website_inquiries from public, anon, authenticated;
revoke all on sequence public.website_inquiries_id_seq from public, anon, authenticated;
grant select, insert on public.website_inquiries to service_role;
grant usage on sequence public.website_inquiries_id_seq to service_role;

commit;
