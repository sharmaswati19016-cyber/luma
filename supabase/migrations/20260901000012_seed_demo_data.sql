-- ============================================================
-- Cognitive Check-In: Step 7 — Seed demo data
-- Run this AFTER step6_dashboard_endpoints.sql
--
-- Safe to re-run: it deletes these 5 specific seed residents
-- first (matched by their fixed pairing codes), so re-running
-- gives you a clean slate instead of duplicate/stale data.
--
-- Creates 56 days (8 weeks) of history ending TODAY for each
-- resident, engineered so the trend engine has something real
-- to baseline against and, for 3 of them, something real to
-- flag or watch.
-- ============================================================

-- Reuse the demo facility if it already exists from earlier testing
insert into facilities (name, facility_code)
values ('Sunrise Elder Care', 'SUNRISE01')
on conflict (facility_code) do nothing;

-- Clear out any previous run of this seed script
delete from residents where pairing_code in ('900001','900002','900003','900004','900005');

-- ------------------------------------------------------------
-- The 5 residents
-- ------------------------------------------------------------
insert into residents (facility_id, name, room, pairing_code)
select f.id, v.name, v.room, v.pairing_code
from facilities f
cross join (values
  ('Kamala Rao',        'Room 12', '900001'),
  ('Devendra Shah',     'Room 04', '900002'),
  ('Meera Iyer',        'Room 09', '900003'),
  ('Anthony Fernandes', 'Room 21', '900004'),
  ('Rajesh Kumar',      'Room 15', '900005')
) as v(name, room, pairing_code)
where f.facility_code = 'SUNRISE01';

-- ------------------------------------------------------------
-- 56 days of check-ins per resident, day_offset -55 (oldest) to 0 (today).
-- First 14 days of every resident's history = their baseline period.
-- The CASE logic below only makes numbers WORSE during each
-- resident's designated decline window — everything else is
-- normal, slightly-noisy data.
-- ------------------------------------------------------------
insert into checkins (resident_id, date, recall_score, orientation_correct, fluency_count, avg_response_time, mode)
select
  r.id,
  current_date + d.day_offset,
  case
    when r.pattern = 'flag'  and d.day_offset >= -27 then least(3, greatest(0, round(1 + random())::int))   -- 1-2: declined
    when r.pattern = 'watch' and d.day_offset >= -13 then least(3, greatest(0, round(1 + random())::int))   -- 1-2: mild decline
    else least(3, greatest(0, round(2 + random())::int))                                                     -- 2-3: normal
  end as recall_score,
  true as orientation_correct,
  case
    when r.pattern = 'flag' and d.day_offset >= -27 then round(5 + random() * 2)::int   -- 5-7: declined
    else round(9 + random() * 3)::int                                                    -- 9-12: normal
  end as fluency_count,
  case
    when r.pattern = 'flag'  and d.day_offset >= -27 then round((6 + random() * 2)::numeric, 1)    -- 6-8s: declined
    when r.pattern = 'watch' and d.day_offset >= -13 then round((5.5 + random() * 1.5)::numeric, 1) -- mild rise
    else round((3.5 + random() * 1.5)::numeric, 1)                                                    -- 3.5-5s: normal
  end as avg_response_time,
  'self'
from (
  select id, name,
    case name
      when 'Kamala Rao'    then 'flag'
      when 'Devendra Shah' then 'watch'
      when 'Rajesh Kumar'  then 'missed'
      else 'steady'
    end as pattern
  from residents
  where pairing_code in ('900001','900002','900003','900004','900005')
) r
cross join generate_series(-55, 0) as d(day_offset)
where not (r.pattern = 'missed' and d.day_offset >= -6); -- Rajesh: no check-ins in the last 6 days

-- ------------------------------------------------------------
-- Run the trend engine, but only for these 5 seeded residents —
-- doesn't touch any other real resident data you may already have.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id from residents where pairing_code in ('900001','900002','900003','900004','900005')
  loop
    perform establish_baseline_if_ready(r.id);
    perform compute_and_flag_resident(r.id);
  end loop;
end $$;
