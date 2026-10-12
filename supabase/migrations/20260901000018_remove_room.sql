-- ============================================================
-- Cognitive Check-In: Migration 018 — Remove room numbers entirely
-- Run AFTER 20260901000017_dashboard_v2
--
-- WARNING: this permanently deletes the residents.room column and
-- the room values stored in it. It cannot be undone.
--
-- Order matters: the two functions that read/write "room" are
-- replaced FIRST, then the column is dropped last.
--   1. get_facility_roster      -> no longer returns room
--   2. create_resident_by_staff -> now takes only the name
--   3. register_resident        -> old Step 2 function, already removed
--                                  in migration 008; dropped here only
--                                  in case it still exists
--   4. residents.room           -> dropped
-- ============================================================

-- ------------------------------------------------------------
-- 1. Roster without room (everything else is identical to 017)
-- ------------------------------------------------------------
drop function if exists get_facility_roster();

create function get_facility_roster()
returns table (
  resident_id uuid,
  name text,
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

-- ------------------------------------------------------------
-- 2. Staff adds a resident: name only (was name + room)
-- ------------------------------------------------------------
drop function if exists create_resident_by_staff(text, text);

create function create_resident_by_staff(p_name text)
returns table (resident_id uuid, pairing_code text)
language plpgsql
security definer
as $$
declare
  v_facility_id uuid;
  v_resident_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Must be logged in as staff';
  end if;

  select facility_id into v_facility_id
  from staff where user_id = auth.uid();

  if v_facility_id is null then
    raise exception 'No staff profile found for this login';
  end if;

  v_code := generate_unique_pairing_code();

  insert into residents (facility_id, name, pairing_code)
  values (v_facility_id, p_name, v_code)
  returning id into v_resident_id;

  return query select v_resident_id, v_code;
end;
$$;

-- ------------------------------------------------------------
-- 3. Old self-registration function (safe if it is already gone)
-- ------------------------------------------------------------
drop function if exists register_resident(text, text, text);

-- ------------------------------------------------------------
-- 4. Finally, drop the column
-- ------------------------------------------------------------
alter table residents drop column if exists room;