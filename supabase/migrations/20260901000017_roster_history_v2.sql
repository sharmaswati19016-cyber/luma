-- ============================================================
-- Cognitive Check-In: Migration 017 — Dashboard endpoints v2
-- Run AFTER 20260901000016_fluency_rotation_v2
--
-- 1. get_facility_roster: adds two columns, keeps all the old ones
--      status_label  : plain-English label for the badge
--                      steady -> 'Steady'
--                      watch  -> 'Worth watching'
--                      flag   -> 'Worth a check-up conversation'
--      is_off_today  : true if staff marked today as an off day
--                      (lets the UI show the one-tap off-day button's state)
--    Stored status codes (steady / watch / flag) are NOT changed.
--
-- 2. get_resident_weekly_history: same columns as before, but the
--    averages now match the trend engine, so the chart and the flag
--    reason agree:
--      - practice days and off days are left out of the averages
--      - recall uses spoken free recall (falls back to the old score)
--      - fluency counts Animals days only
--      - response time is the weekly median
--    checkins_completed still counts every check-in that week.
--
-- Like the originals, neither function is security definer, so
-- row-level security keeps staff to their own facility.
-- ============================================================

-- A function's return columns can't change in place, so drop first.
drop function if exists get_facility_roster();

create function get_facility_roster()
returns table (
  resident_id uuid,
  name text,
  room text,
  status text,
  status_label text,
  reason_summary text,
  last_checkin_date date,
  is_off_today boolean
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    r.room,
    coalesce(tf.status, 'steady') as status,
    case coalesce(tf.status, 'steady')
      when 'flag' then 'Worth a check-up conversation'
      when 'watch' then 'Worth watching'
      else 'Steady'
    end as status_label,
    tf.reason_summary,
    (select max(c.date) from checkins c where c.resident_id = r.id) as last_checkin_date,
    exists (
      select 1 from off_days o
      where o.resident_id = r.id and o.date = current_date
    ) as is_off_today
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

-- Same columns as before, so this one can be replaced in place.
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
    avg(coalesce(c.free_recall_score, c.recall_score))
      filter (where not c.is_practice and o.id is null) as recall_avg,
    avg(c.fluency_count)
      filter (where not c.is_practice and o.id is null
              and (c.category_id is null or fc.is_primary)) as fluency_avg,
    (percentile_cont(0.5) within group (order by c.avg_response_time)
      filter (where not c.is_practice and o.id is null))::numeric as response_avg,
    count(*)::int as checkins_completed
  from checkins c
  left join off_days o
    on o.resident_id = c.resident_id and o.date = c.date
  left join fluency_categories fc
    on fc.id = c.category_id
  where c.resident_id = p_resident_id
    and c.date >= current_date - (p_weeks * 7)
  group by date_trunc('week', c.date)
  order by week_start
$$;