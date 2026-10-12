-- ============================================================
-- Cognitive Check-In: Migration 014 — submit_checkin v2
-- Run AFTER 20260901000013_checkin_v2_schema
--
-- Replaces the old submit_checkin. The OLD call still works:
--   submit_checkin(resident, recall, orientation, fluency, response_time, mode)
-- because every new parameter is optional and comes after the
-- old ones.
--
-- New optional parameters:
--   p_free_recall_score : 0-3, spoken recall (confirmed on screen)
--   p_recognition_score : 0-3, picture-tap result
--   p_category_id       : which fluency category was asked
--   p_fluency_words     : the CONFIRMED list of spoken words; if sent,
--                         the server counts the valid ones itself
--                         (needs p_category_id)
--
-- Server decides is_practice: a resident's first 2 check-ins are
-- practice and are ignored by the baseline and trend engine.
-- ============================================================

-- A function with a different parameter list can't be replaced
-- in place, so drop the old one first.
-- NOTE: if you ever changed who may call submit_checkin
-- (revoke/grant), re-apply that after this migration.
drop function if exists submit_checkin(uuid, int, boolean, int, numeric, text);

create or replace function submit_checkin(
  p_resident_id uuid,
  p_recall_score int default null,
  p_orientation_correct boolean default null,
  p_fluency_count int default null,
  p_avg_response_time numeric default null,
  p_mode text default 'self',
  p_free_recall_score int default null,
  p_recognition_score int default null,
  p_category_id int default null,
  p_fluency_words text[] default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_checkin_id uuid;
  v_resident_facility_id uuid;
  v_staff_facility_id uuid;
  v_recall int;
  v_fluency int;
  v_is_practice boolean;
begin
  -- resident must exist
  select facility_id into v_resident_facility_id
  from residents where id = p_resident_id;

  if v_resident_facility_id is null then
    raise exception 'Resident not found';
  end if;

  -- mode
  if p_mode not in ('self', 'staff-assisted') then
    raise exception 'mode must be self or staff-assisted';
  end if;

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

  -- orientation is always required
  if p_orientation_correct is null then
    raise exception 'orientation_correct is required';
  end if;

  -- recall: new clients send free recall; old clients send recall_score.
  -- The old recall_score column is always filled so older code keeps working.
  v_recall := coalesce(p_free_recall_score, p_recall_score);

  if v_recall is null then
    raise exception 'free_recall_score (or recall_score) is required';
  end if;

  if v_recall < 0 or v_recall > 3 then
    raise exception 'recall score must be between 0 and 3';
  end if;

  if p_recognition_score is not null
     and (p_recognition_score < 0 or p_recognition_score > 3) then
    raise exception 'recognition_score must be between 0 and 3';
  end if;

  -- fluency: count valid words on the server if words were sent,
  -- otherwise trust the confirmed count (old behaviour)
  if p_fluency_words is not null then
    if p_category_id is null then
      raise exception 'category_id is required when fluency_words are sent';
    end if;
    v_fluency := least(count_valid_fluency_words(p_category_id, p_fluency_words), 30);
  else
    v_fluency := p_fluency_count;
    if v_fluency is null then
      raise exception 'fluency_count (or fluency_words) is required';
    end if;
    if v_fluency < 0 or v_fluency > 30 then
      raise exception 'fluency_count out of expected range';
    end if;
  end if;

  if p_category_id is not null
     and not exists (select 1 from fluency_categories where id = p_category_id) then
    raise exception 'Unknown fluency category';
  end if;

  -- first 2 check-ins are practice days
  v_is_practice := (select count(*) from checkins where resident_id = p_resident_id) < 2;

  begin
    insert into checkins (
      resident_id, date, recall_score, orientation_correct,
      fluency_count, avg_response_time, mode,
      free_recall_score, recognition_score, category_id, is_practice
    )
    values (
      p_resident_id, current_date, v_recall, p_orientation_correct,
      v_fluency, p_avg_response_time, p_mode,
      p_free_recall_score, p_recognition_score, p_category_id, v_is_practice
    )
    returning id into v_checkin_id;
  exception
    when unique_violation then
      raise exception 'A check-in for today has already been submitted for this resident';
  end;

  return v_checkin_id;
end;
$$;