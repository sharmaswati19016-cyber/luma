-- ============================================================
-- Cognitive Check-In: Step 3 (v2) - Trend engine update
-- Additive: replaces establish_baseline_if_ready and
-- compute_and_flag_resident, adds helpers + an off_days trigger.
-- Requires migration 013 (checkins.free_recall_score, is_practice,
-- category_id; fluency_categories.is_primary; off_days).
-- Status codes stay 'steady' | 'watch' | 'flag' (only the
-- human-readable reason text is softened here).
-- ============================================================

-- ------------------------------------------------------------
-- trend_usable_checkins
-- The single definition of "which check-ins count" for baseline
-- and trend. Excludes practice days
-- and any date staff marked as an off day (off_days table, migration 013).
--   recall_value  = spoken free recall, falling back to old recall_score
--   fluency_value = only primary category (animals); old rows with no
--                   category_id are treated as animals (legacy seed data)
-- Runs as the caller, so RLS still applies.
-- ------------------------------------------------------------
create or replace function trend_usable_checkins(p_resident_id uuid)
returns table (
  checkin_date date,
  recall_value numeric,
  fluency_value numeric,
  response_value numeric
)
language sql
stable
as $$
  select
    c.date,
    coalesce(c.free_recall_score, c.recall_score)::numeric,
    case when c.category_id is null or coalesce(fc.is_primary, false)
         then c.fluency_count::numeric end,
    c.avg_response_time::numeric
  from checkins c
  left join fluency_categories fc on fc.id = c.category_id
  where c.resident_id = p_resident_id
    and coalesce(c.is_practice, false) = false
    and not exists (
      select 1 from off_days od
      where od.resident_id = c.resident_id and od.date = c.date
    )
$$;

-- Joins metric names for plain-language text: "a", "a and b", "a, b and c"
create or replace function join_metric_names(p_names text[])
returns text
language sql
immutable
as $$
  select case coalesce(array_length(p_names, 1), 0)
    when 0 then ''
    when 1 then p_names[1]
    when 2 then p_names[1] || ' and ' || p_names[2]
    else array_to_string(p_names[1:array_length(p_names, 1) - 1], ', ')
         || ' and ' || p_names[array_length(p_names, 1)]
  end
$$;

-- Capitalizes only the first letter ("recall and response time" -> "Recall and response time")
create or replace function capitalize_first(p_text text)
returns text
language sql
immutable
as $$
  select upper(left(p_text, 1)) || substr(p_text, 2)
$$;

-- ------------------------------------------------------------
-- establish_baseline_if_ready (v2)
-- Baseline window = first 14 days starting from the first USABLE
-- check-in (so the 2 practice days don't start the clock), using
-- only usable check-ins. response_mean now stores the MEDIAN
-- (column name kept so nothing downstream breaks).
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

  select min(checkin_date) into v_first_date
  from trend_usable_checkins(p_resident_id);

  if v_first_date is null or current_date < v_first_date + 14 then
    return false;
  end if;

  insert into resident_baselines (
    resident_id, recall_mean, recall_stddev,
    fluency_mean, fluency_stddev,
    response_mean, response_stddev,
    baseline_start, baseline_end
  )
  select
    p_resident_id,
    avg(recall_value), coalesce(stddev_samp(recall_value), 0),
    avg(fluency_value), coalesce(stddev_samp(fluency_value), 0),
    (percentile_cont(0.5) within group (order by response_value))::numeric,
    coalesce(stddev_samp(response_value), 0),
    v_first_date, v_first_date + 13
  from trend_usable_checkins(p_resident_id)
  where checkin_date >= v_first_date
    and checkin_date < v_first_date + 14
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
-- compute_and_flag_resident (v2)
-- Same structure as before, with:
--   - only usable check-ins (no practice / excluded / off days)
--   - recall = free recall (fallback: old recall_score)
--   - fluency = animals only
--   - response time = weekly MEDIAN, stricter threshold (lower weight)
--   - a declining week needs 2+ metrics AND a recall or fluency drop
--   - gone-quiet clock also resets on a staff-marked off day
--   - softened reason text
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
  v_cognitive_drop boolean;
  v_metric_names text[];
  v_top_metric_names text[];
  v_captured_top boolean := false;
  v_last_checkin_date date;
  v_last_off_day date;
  v_last_activity date;
  rec record;
  decline_threshold constant numeric := 1.0;           -- recall, fluency
  response_decline_threshold constant numeric := 1.5;  -- response time counts for less
  flag_weeks_needed constant int := 3;
begin
  select * into v_baseline from resident_baselines where resident_id = p_resident_id;
  if not found then
    return;
  end if;

  for rec in
    select
      weeks.week_start,
      count(c.checkin_date) as checkin_count,
      avg(c.recall_value) as recall_avg,
      avg(c.fluency_value) as fluency_avg,
      (percentile_cont(0.5) within group (order by c.response_value))::numeric as response_median
    from (
      select (generate_series(
        v_baseline.baseline_end + 1, current_date, interval '7 days'
      ))::date as week_start
    ) weeks
    left join trend_usable_checkins(p_resident_id) c
      on c.checkin_date >= weeks.week_start
      and c.checkin_date < weeks.week_start + 7
    group by weeks.week_start
    order by weeks.week_start desc
  loop
    if rec.checkin_count = 0 then
      continue; -- no usable data this week: skip without breaking the streak
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

    if rec.response_median is not null and (
      (v_baseline.response_stddev > 0
        and (rec.response_median - v_baseline.response_mean) / v_baseline.response_stddev >= response_decline_threshold)
      or (v_baseline.response_stddev = 0 and rec.response_median > v_baseline.response_mean)
    ) then
      v_metric_names := array_append(v_metric_names, 'response time');
    end if;

    v_declining_this_week := coalesce(array_length(v_metric_names, 1), 0);
    v_cognitive_drop := ('recall' = any(v_metric_names)) or ('fluency' = any(v_metric_names));

    if not v_captured_top then
      v_top_metric_names := v_metric_names;
      v_captured_top := true;
    end if;

    if v_declining_this_week >= 2 and v_cognitive_drop then
      v_declining_weeks := v_declining_weeks + 1;
    else
      exit; -- streak broken
    end if;

    exit when v_declining_weeks >= flag_weeks_needed;
  end loop;

  if v_declining_weeks >= flag_weeks_needed then
    v_status := 'flag';
    v_reason := capitalize_first(join_metric_names(v_top_metric_names))
      || ' have been below their usual level together for ' || v_declining_weeks
      || ' weeks in a row. Worth a check-up conversation; this shows a pattern, not a cause.';
  elsif v_declining_weeks >= 1 then
    v_status := 'watch';
    v_reason := capitalize_first(join_metric_names(v_top_metric_names))
      || ' have dipped below their usual level for ' || v_declining_weeks
      || ' week(s) - not yet a sustained pattern.';
  else
    v_status := 'steady';
    v_reason := 'No meaningful change from their usual level.';
  end if;

  -- separate signal: missed check-ins. A staff-marked off day counts as
  -- "accounted for", so an unwell resident is not flagged for being quiet.
  select max(date) into v_last_checkin_date from checkins where resident_id = p_resident_id;
  select max(date) into v_last_off_day
    from off_days where resident_id = p_resident_id and date <= current_date;
  v_last_activity := greatest(v_last_checkin_date, v_last_off_day); -- greatest() ignores nulls

  if v_last_activity is not null and current_date - v_last_activity >= 5 then
    if v_status = 'steady' then
      v_status := 'watch';
    end if;
    v_reason := v_reason || ' No check-in in ' || (current_date - v_last_activity) || ' days.';
  end if;

  v_current_week_start := date_trunc('week', current_date)::date;

  insert into trend_flags (resident_id, week_start, status, reason_summary)
  values (p_resident_id, v_current_week_start, v_status, v_reason)
  on conflict (resident_id, week_start) do update
    set status = excluded.status, reason_summary = excluded.reason_summary;
end;
$$;

-- ------------------------------------------------------------
-- Recompute a resident's flag as soon as staff mark/unmark an off day,
-- so the dashboard updates immediately. Uses a trigger so the existing
-- mark_off_day / unmark_off_day functions from migration 013 stay as-is.
-- ------------------------------------------------------------
create or replace function off_days_recompute()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'DELETE' then
    perform compute_and_flag_resident(old.resident_id);
  else
    perform compute_and_flag_resident(new.resident_id);
  end if;
  return null;
end;
$$;

drop trigger if exists off_days_recompute_trg on off_days;
create trigger off_days_recompute_trg
  after insert or update or delete on off_days
  for each row execute function off_days_recompute();

-- Optional: recompute everyone after applying this migration
-- select run_trend_engine();