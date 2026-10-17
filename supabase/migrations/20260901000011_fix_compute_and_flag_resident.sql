-- ============================================================
-- Hotfix: compute_and_flag_resident
-- Same logic as Step 5's version, just using array_append()
-- instead of the || operator for building the metric-name list —
-- this avoids the "malformed array literal" error some editors'
-- copy/paste (smart quotes, dropped characters) can trigger.
-- Safe to run anytime; this is a full replacement, not a patch.
-- ============================================================
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
  decline_threshold constant numeric := 1.0;
  flag_weeks_needed constant int := 3;
begin
  select * into v_baseline from resident_baselines where resident_id = p_resident_id;
  if not found then
    return;
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
      continue;
    end if;

    v_metric_names := array[]::text[];

    if rec.recall_avg is not null and (
      (v_baseline.recall_stddev > 0
        and (v_baseline.recall_mean - rec.recall_avg) / v_baseline.recall_stddev >= decline_threshold)
      or (v_baseline.recall_stddev = 0 and rec.recall_avg < v_baseline.recall_mean)
    ) then
      v_metric_names := array_append(v_metric_names, 'recall');
    end if;

    if rec.fluency_avg is not null and (
      (v_baseline.fluency_stddev > 0
        and (v_baseline.fluency_mean - rec.fluency_avg) / v_baseline.fluency_stddev >= decline_threshold)
      or (v_baseline.fluency_stddev = 0 and rec.fluency_avg < v_baseline.fluency_mean)
    ) then
      v_metric_names := array_append(v_metric_names, 'fluency');
    end if;

    if rec.response_avg is not null and (
      (v_baseline.response_stddev > 0
        and (rec.response_avg - v_baseline.response_mean) / v_baseline.response_stddev >= decline_threshold)
      or (v_baseline.response_stddev = 0 and rec.response_avg > v_baseline.response_mean)
    ) then
      v_metric_names := array_append(v_metric_names, 'response time');
    end if;

    v_declining_this_week := coalesce(array_length(v_metric_names, 1), 0);

    if not v_captured_top then
      v_top_metric_names := v_metric_names;
      v_captured_top := true;
    end if;

    if v_declining_this_week >= 2 then
      v_declining_weeks := v_declining_weeks + 1;
    else
      exit;
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