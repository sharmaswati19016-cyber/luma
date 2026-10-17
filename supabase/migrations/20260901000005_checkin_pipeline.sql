-- ============================================================
-- Cognitive Check-In: Step 4 — Check-in data pipeline
-- Run this AFTER step3b_more_sets_and_per_resident.sql
-- ============================================================

-- ------------------------------------------------------------
-- submit_checkin
-- One function handles BOTH modes:
--   - 'self'           -> called from the resident's own device,
--                          no login involved (anon key)
--   - 'staff-assisted' -> called while a staff member is logged
--                          in, running the task verbally and
--                          tapping in the resident's answers
--
-- Validation done here (server-side, so a buggy or malicious
-- client can't corrupt the trend engine's input data):
--   - resident must exist
--   - recall_score must be 0-3 (there are only 3 words)
--   - fluency_count must be 0-30 (sanity clamp against garbage)
--   - mode must be 'self' or 'staff-assisted'
--   - if mode is 'staff-assisted', the logged-in staff member
--     must belong to the SAME facility as the resident
--     (stops one facility's staff from logging check-ins for
--     another facility's residents)
--   - one check-in per resident per day is enforced by the
--     unique constraint from Step 1; this function just turns
--     that low-level DB error into a clear message
--
-- Note on fluency_count: this expects the count AFTER the
-- resident/staff has confirmed the transcribed words on-screen
-- (per your "confirm-or-correct" mitigation for speech
-- recognition errors) — the heavy lifting of turning raw speech
-- into a clean count happens client-side, this just stores the
-- final, confirmed number.
-- ------------------------------------------------------------
create or replace function submit_checkin(
  p_resident_id uuid,
  p_recall_score int,
  p_orientation_correct boolean,
  p_fluency_count int,
  p_avg_response_time numeric,
  p_mode text default 'self'
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_checkin_id uuid;
  v_resident_facility_id uuid;
  v_staff_facility_id uuid;
begin
  -- resident must exist, and grab their facility for the staff check below
  select facility_id into v_resident_facility_id
  from residents where id = p_resident_id;

  if v_resident_facility_id is null then
    raise exception 'Resident not found';
  end if;

  -- basic input sanity checks
  if p_recall_score < 0 or p_recall_score > 3 then
    raise exception 'recall_score must be between 0 and 3';
  end if;

  if p_fluency_count < 0 or p_fluency_count > 30 then
    raise exception 'fluency_count out of expected range';
  end if;

  if p_mode not in ('self', 'staff-assisted') then
    raise exception 'mode must be self or staff-assisted';
  end if;

  -- extra check for staff-assisted: the logged-in staff member
  -- must belong to this resident's facility
  if p_mode = 'staff-assisted' then
    if auth.uid() is null then
      raise exception 'Must be logged in to submit a staff-assisted check-in';
    end if;

    select facility_id into v_staff_facility_id
    from staff where user_id = auth.uid();

    if v_staff_facility_id is null or v_staff_facility_id <> v_resident_facility_id then
      raise exception 'Not authorized to submit check-ins for this resident';
    end if;
  end if;

  -- insert, with a friendly error if today's check-in already exists
  begin
    insert into checkins (
      resident_id, date, recall_score, orientation_correct,
      fluency_count, avg_response_time, mode
    )
    values (
      p_resident_id, current_date, p_recall_score, p_orientation_correct,
      p_fluency_count, p_avg_response_time, p_mode
    )
    returning id into v_checkin_id;
  exception
    when unique_violation then
      raise exception 'A check-in for today has already been submitted for this resident';
  end;

  return v_checkin_id;
end;
$$;
