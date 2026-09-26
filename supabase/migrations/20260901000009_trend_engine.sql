-- ============================================================
-- Cognitive Check-In: Step 5 — Trend & anomaly detection engine
-- Run this AFTER remove_register_resident.sql
-- ============================================================

-- ------------------------------------------------------------
-- resident_baselines
-- One row per resident, holding their personal "normal" for
-- each metric, calculated once from their first 14 days.
-- ------------------------------------------------------------
create table resident_baselines (
  resident_id uuid primary key references residents(id) on delete cascade,
  recall_mean numeric,
  recall_stddev numeric,
  fluency_mean numeric,
  fluency_stddev numeric,
  response_mean numeric,
  response_stddev numeric,
  baseline_start date,
  baseline_end date,
  computed_at timestamptz not null default now()
);

alter table resident_baselines enable row level security;

create policy "staff can view baselines in own facility"
  on resident_baselines for select
  using (
    resident_id in (
      select id from residents where facility_id = auth_facility_id()
    )
  );

-- ------------------------------------------------------------
-- establish_baseline_if_ready
-- Checks one resident: do they have 14+ days of history and no
-- baseline yet? If so, calculate and store it. Safe to call on
-- every resident, every time the engine runs — it's a no-op for
-- anyone not ready yet or already done.
-- ------------------------------------------------------------
create or replace function establish_baseline_if_ready(p_resident_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_first_date date;
  v_already_set timestamptz;
begin
  select baseline_established_at into v_already_set
  from residents where id = p_resident_id;

  if v_already_set is not null then
    return false;
  end if;

  select min(date) into v_first_date from checkins where resident_id = p_resident_id;

  if v_first_date is null or current_date < v_first_date + 14 then
    return false; -- no check-ins yet, or fewer than 14 days in
  end if;

  insert into resident_baselines (
    resident_id, recall_mean, recall_stddev,
    fluency_mean, fluency_stddev,
    response_mean, response_stddev,
    baseline_start, baseline_end
  )
  select
    p_resident_id,
    avg(recall_score), coalesce(stddev_samp(recall_score), 0),
    avg(fluency_count), coalesce(stddev_samp(fluency_count), 0),
    avg(avg_response_time), coalesce(stddev_samp(avg_response_time), 0),
    v_first_date, v_first_date + 13
  from checkins
  where resident_id = p_resident_id
    and date >= v_first_date
    and date < v_first_date + 14
  on conflict (resident_id) do update set
    recall_mean = excluded.recall_mean,
    recall_stddev = excluded.recall_stddev,
    fluency_mean = excluded.fluency_mean,
    fluency_stddev = excluded.fluency_stddev,
    response_mean = excluded.response_mean,
    response_stddev = excluded.response_stddev,
    baseline_start = excluded.baseline_start,
    baseline_end = excluded.baseline_end,
    computed_at = now();

  update residents set baseline_established_at = now() where id = p_resident_id;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- compute_and_flag_resident
-- The core logic. Walks backwards week by week from today,
-- checking each week against baseline using a z-score, and
-- counts the CONSECUTIVE streak of weeks with 2+ metrics
-- declining together. Weeks with zero check-ins are skipped
-- (don't break the streak, don't count toward it either).
-- ------------------------------------------------------------
create or replace function compute_and_flag_resident(p_resident_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_baseline resident_baselines%rowtype;
  v_current_week_start date;
  v_status text;
  v_reason text;
  v_declining_weeks int := 0;
  v_declining_this_week int;
  v_metric_names text[];
  v_top_metric_names text[];
  v_captured_top boolean := false;
  v_last_checkin_date date;
  rec record;
  decline_threshold constant numeric := 1.0; -- z-score magnitude counted as "declining"
  flag_weeks_needed constant int := 3;
begin
  select * into v_baseline from resident_baselines where resident_id = p_resident_id;
  if not found then
    return; -- no baseline yet, nothing to compute
  end if;

  for rec in
    select
      weeks.week_start,
      count(c.id) as checkin_count,
      avg(c.recall_score) as recall_avg,
      avg(c.fluency_count) as fluency_avg,
      avg(c.avg_response_time) as response_avg
    from (
      select (generate_series(
        v_baseline.baseline_end + 1, current_date, interval '7 days'
      ))::date as week_start
    ) weeks
    left join checkins c
      on c.resident_id = p_resident_id
      and c.date >= weeks.week_start
      and c.date < weeks.week_start + 7
    group by weeks.week_start
    order by weeks.week_start desc
  loop
    if rec.checkin_count = 0 then
      continue; -- no data this week, skip without breaking the streak
    end if;

    v_metric_names := array[]::text[];

    if rec.recall_avg is not null and (
      (v_baseline.recall_stddev > 0
        and (v_baseline.recall_mean - rec.recall_avg) / v_baseline.recall_stddev >= decline_threshold)
      or (v_baseline.recall_stddev = 0 and rec.recall_avg < v_baseline.recall_mean)
    ) then
      v_metric_names := v_metric_names || 'recall';
    end if;

    if rec.fluency_avg is not null and (
      (v_baseline.fluency_stddev > 0
        and (v_baseline.fluency_mean - rec.fluency_avg) / v_baseline.fluency_stddev >= decline_threshold)
      or (v_baseline.fluency_stddev = 0 and rec.fluency_avg < v_baseline.fluency_mean)
    ) then
      v_metric_names := v_metric_names || 'fluency';
    end if;

    if rec.response_avg is not null and (
      (v_baseline.response_stddev > 0
        and (rec.response_avg - v_baseline.response_mean) / v_baseline.response_stddev >= decline_threshold)
      or (v_baseline.response_stddev = 0 and rec.response_avg > v_baseline.response_mean)
    ) then
      v_metric_names := v_metric_names || 'response time';
    end if;

    v_declining_this_week := coalesce(array_length(v_metric_names, 1), 0);

    if not v_captured_top then
      v_top_metric_names := v_metric_names;
      v_captured_top := true;
    end if;

    if v_declining_this_week >= 2 then
      v_declining_weeks := v_declining_weeks + 1;
    else
      exit; -- streak broken
    end if;

    exit when v_declining_weeks >= flag_weeks_needed;
  end loop;

  if v_declining_weeks >= flag_weeks_needed then
    v_status := 'flag';
    v_reason := initcap(array_to_string(v_top_metric_names, ' and '))
      || ' have declined together for ' || v_declining_weeks
      || ' consecutive weeks. Worth mentioning at the next doctor visit.';
  elsif v_declining_weeks >= 1 then
    v_status := 'watch';
    v_reason := 'Some decline in ' || array_to_string(v_top_metric_names, ' and ')
      || ' over the last ' || v_declining_weeks || ' week(s) — not yet a sustained pattern.';
  else
    v_status := 'steady';
    v_reason := 'No meaningful decline detected against baseline.';
  end if;

  -- separate signal: missed check-ins, regardless of the metric trend above
  select max(date) into v_last_checkin_date from checkins where resident_id = p_resident_id;
  if v_last_checkin_date is not null and current_date - v_last_checkin_date >= 5 then
    if v_status = 'steady' then
      v_status := 'watch';
    end if;
    v_reason := v_reason || ' No check-in in ' || (current_date - v_last_checkin_date) || ' days.';
  end if;

  v_current_week_start := date_trunc('week', current_date)::date;

  insert into trend_flags (resident_id, week_start, status, reason_summary)
  values (p_resident_id, v_current_week_start, v_status, v_reason)
  on conflict (resident_id, week_start) do update
    set status = excluded.status, reason_summary = excluded.reason_summary;
end;
$$;

-- ------------------------------------------------------------
-- run_trend_engine
-- The entry point for the weekly scheduled job — loops every
-- resident, establishes a baseline if they're newly ready, then
-- recomputes their current flag.
-- ------------------------------------------------------------
create or replace function run_trend_engine()
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  for r in select id from residents loop
    perform establish_baseline_if_ready(r.id);
    perform compute_and_flag_resident(r.id);
  end loop;
end;
$$;
