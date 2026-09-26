-- ============================================================
-- Cognitive Check-In: Step 1 — Foundation schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. FACILITIES
create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  facility_code text not null unique,
  created_at timestamptz not null default now()
);

-- 2. STAFF
-- Linked to Supabase Auth users (auth.users) via user_id
create table staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  facility_id uuid not null references facilities(id) on delete cascade,
  name text not null,
  role text not null default 'staff', -- e.g. 'staff' or 'admin'
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- 3. RESIDENTS
create table residents (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  name text not null,
  room text,
  baseline_established_at timestamptz, -- null until first 2 weeks are done
  created_at timestamptz not null default now()
);

-- 4. CHECKINS
create table checkins (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id) on delete cascade,
  date date not null,
  recall_score int not null,           -- 0-3
  orientation_correct boolean not null,
  fluency_count int not null,
  avg_response_time numeric,           -- seconds
  mode text not null default 'self',   -- 'self' or 'staff-assisted'
  created_at timestamptz not null default now(),
  unique (resident_id, date)           -- one check-in per resident per day
);

-- 5. TREND_FLAGS
create table trend_flags (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id) on delete cascade,
  week_start date not null,
  status text not null,                -- 'steady' | 'watch' | 'flag'
  reason_summary text,
  created_at timestamptz not null default now(),
  unique (resident_id, week_start)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Staff can only see/act on data tied to their own facility.
-- ============================================================

alter table facilities enable row level security;
alter table staff enable row level security;
alter table residents enable row level security;
alter table checkins enable row level security;
alter table trend_flags enable row level security;

-- Helper: get the facility_id of the currently logged-in staff member
create or replace function auth_facility_id()
returns uuid
language sql
security definer
stable
as $$
  select facility_id from staff where user_id = auth.uid()
$$;

-- Staff can see their own row
create policy "staff can view own record"
  on staff for select
  using (user_id = auth.uid());

-- Staff can see residents in their facility
create policy "staff can view residents in own facility"
  on residents for select
  using (facility_id = auth_facility_id());

-- Staff can see check-ins for residents in their facility
create policy "staff can view checkins in own facility"
  on checkins for select
  using (
    resident_id in (
      select id from residents where facility_id = auth_facility_id()
    )
  );

-- Staff can insert check-ins (for staff-assisted mode) for their own residents
create policy "staff can insert checkins in own facility"
  on checkins for insert
  with check (
    resident_id in (
      select id from residents where facility_id = auth_facility_id()
    )
  );

-- Staff can view trend flags for their facility
create policy "staff can view trend flags in own facility"
  on trend_flags for select
  using (
    resident_id in (
      select id from residents where facility_id = auth_facility_id()
    )
  );

-- Facility code lookup needs to be public (residents self-register with it)
-- so we allow anon SELECT on facility_code only via a narrow policy:
alter table facilities enable row level security;
create policy "anyone can look up a facility by code"
  on facilities for select
  using (true);
