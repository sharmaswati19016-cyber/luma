-- ============================================================
-- Cognitive Check-In: Step 6 — Dashboard data endpoints
-- Run this AFTER step5_trend_engine.sql
--
-- Unlike most earlier functions, these are NOT "security definer".
-- They run as whoever calls them (the logged-in staff member),
-- which means the existing row-level security policies from
-- Steps 1 and 5 (staff can only see their own facility's
-- residents/checkins/trend_flags) apply automatically — no
-- extra facility-checking code needed here at all.
-- ============================================================

-- ------------------------------------------------------------
-- get_facility_roster
-- One row per resident: current status + why + last check-in.
-- Flagged residents sort first, then watch, then steady —
-- matches "flagged residents surface first" from your UI plan.
-- ------------------------------------------------------------
create or replace function get_facility_roster()
returns table (
  resident_id uuid,
  name text,
  room text,
  status text,
  reason_summary text,
  last_checkin_date date
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    r.room,
    coalesce(tf.status, 'steady') as status,
    tf.reason_summary,
    (select max(c.date) from checkins c where c.resident_id = r.id) as last_checkin_date
  from residents r
  left join lateral (
    select status, reason_summary
    from trend_flags
    where resident_id = r.id
    order by week_start desc
    limit 1
  ) tf on true
  order by
    case coalesce(tf.status, 'steady') when 'flag' then 0 when 'watch' then 1 else 2 end,
    r.name
$$;

-- ------------------------------------------------------------
-- get_facility_summary
-- The one-line aggregate for shift handoff ("3 of 42 flagged").
-- Reuses get_facility_roster so the counts can never drift out
-- of sync with what the roster table actually shows.
-- ------------------------------------------------------------
create or replace function get_facility_summary()
returns table (
  total_residents int,
  flagged_count int,
  watch_count int,
  steady_count int
)
language sql
stable
as $$
  with roster as (
    select * from get_facility_roster()
  )
  select
    count(*)::int,
    count(*) filter (where status = 'flag')::int,
    count(*) filter (where status = 'watch')::int,
    count(*) filter (where status = 'steady')::int
  from roster
$$;

-- ------------------------------------------------------------
-- get_resident_weekly_history
-- Feeds the trend chart on the resident detail screen: one row
-- per week, averaged the same way the trend engine itself does
-- (so the chart and the flag reason always agree with each other).
-- ------------------------------------------------------------
create or replace function get_resident_weekly_history(
  p_resident_id uuid,
  p_weeks int default 8
)
returns table (
  week_start date,
  recall_avg numeric,
  fluency_avg numeric,
  response_avg numeric,
  checkins_completed int
)
language sql
stable
as $$
  select
    date_trunc('week', c.date)::date as week_start,
    avg(c.recall_score) as recall_avg,
    avg(c.fluency_count) as fluency_avg,
    avg(c.avg_response_time) as response_avg,
    count(*)::int as checkins_completed
  from checkins c
  where c.resident_id = p_resident_id
    and c.date >= current_date - (p_weeks * 7)
  group by date_trunc('week', c.date)
  order by week_start
$$;