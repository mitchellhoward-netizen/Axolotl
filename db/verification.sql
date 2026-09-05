-- Supabase: phone + OTP identity verification (run in the SQL editor).
-- A verified phone gets verified_at set; otherwise it holds the current code +
-- expiry + attempt count. The parent is the identity key; this proves they own
-- the number before onboarding.
create table if not exists verification (
  phone text primary key,
  code text,
  expires_at bigint,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
