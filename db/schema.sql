-- School / Family Liaison Agent — Postgres schema (Supabase)
-- Canonical, clean snake_case layout. Run via `npm run db:init`.

create extension if not exists vector;

-- ── Controlled vocabularies ──────────────────────────────────────────────
create type root_cause as enum ('TRANSPORTATION','HOMELESSNESS','MEALS','BULLYING','HEALTH','ACADEMIC','ATTENDANCE','LANGUAGE','BEHAVIOR','OTHER');
create type mtss_tier as enum ('TIER_1','TIER_2','TIER_3');
create type case_status as enum ('OPEN','AWAITING','RESOLVED');
create type task_kind as enum ('DRAFT_EMAIL','SEND_EMAIL','PLACE_CALL','FILL_FORM','SCHEDULE_MEETING','FOLLOW_UP','REQUEST_DOCUMENT','OTHER');
create type task_status as enum ('TODO','DONE','STUCK','DROPPED');
create type action_channel as enum ('EMAIL','PHONE','SMS','WEB','IN_PERSON');
create type contact_role as enum ('PRINCIPAL','ATTENDANCE','HOMELESS_LIAISON','BUS_PASSES','COUNSELOR','SPED_COORDINATOR','NURSE','DISTRICT','OTHER');
create type relationship as enum ('PARENT','GUARDIAN','STEP_PARENT','FOSTER_PARENT','OTHER');

-- ── Core ─────────────────────────────────────────────────────────────────
create table if not exists district (
  id text primary key,
  name text not null,
  state text not null,
  created_at timestamptz not null default now()
);

create table if not exists school (
  id text primary key,
  district_id text not null references district(id),
  name text not null
);

create table if not exists staff (
  id text primary key,
  district_id text not null references district(id),
  school_id text references school(id),
  name text not null,
  role contact_role not null,
  phone text,
  email text
);

create table if not exists guardian (
  id text primary key,
  name text not null,
  phone text,
  email text,
  locale text,
  created_at timestamptz not null default now()
);

create table if not exists student (
  id text primary key,
  school_id text not null references school(id),
  first_name text not null,
  last_name text not null,
  grade text
);

create table if not exists child_link (
  guardian_id text not null references guardian(id),
  student_id text not null references student(id),
  relationship relationship not null,
  primary key (guardian_id, student_id)
);

create table if not exists family_profile (
  id text primary key,
  guardian_id text not null unique references guardian(id),
  needs jsonb,
  challenges jsonb,
  notes text,
  profile jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists case_record (
  id text primary key,
  guardian_id text not null references guardian(id),
  student_id text references student(id),
  district_id text not null references district(id),
  root_cause root_cause not null,
  tier mtss_tier,
  intervention text not null,
  status case_status not null default 'OPEN',
  summary text not null,
  child_name text,
  contact_name text,
  contact_role contact_role,
  reminder text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task (
  id text primary key,
  case_id text not null references case_record(id),
  kind task_kind not null,
  status task_status not null default 'TODO',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists action (
  id text primary key,
  task_id text not null references task(id),
  channel action_channel not null,
  direction text,
  contact_id text,
  status text,
  content text,
  occurred_at timestamptz not null default now()
);

-- ── Knowledge "wiki" ─────────────────────────────────────────────────────
create table if not exists policy (
  id text primary key,
  district_id text references district(id),
  jurisdiction text,
  domain text,
  statute text,
  body text,
  embedding vector(1536)
);

create table if not exists knowledge_page (
  id text primary key,
  district_id text references district(id),
  url text,
  title text,
  body text,
  embedding vector(1536)
);

-- ── Longitudinal timeline ───────────────────────────────────────────────
create table if not exists activity (
  id text primary key,
  guardian_id text not null references guardian(id),
  student_id text references student(id),
  event_type text,
  payload jsonb,
  ts timestamptz not null default now()
);

-- ── Helpful indexes ──────────────────────────────────────────────────────
create index if not exists case_guardian_idx on case_record(guardian_id);
create index if not exists case_district_status_idx on case_record(district_id, status);
create index if not exists task_case_idx on task(case_id);
create index if not exists action_task_idx on action(task_id);
create index if not exists activity_guardian_ts_idx on activity(guardian_id, ts desc);
