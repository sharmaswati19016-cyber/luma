-- ============================================================
-- Cognitive Check-In: Step 2 — Auth
-- Run this AFTER schema.sql, in the SQL Editor
-- ============================================================

-- First, undo the too-open policy from Step 1 — we don't want the
-- anon key able to read the whole facilities table.
drop policy if exists "anyone can look up a facility by code" on facilities;

-- ------------------------------------------------------------
-- 1. Validate a facility code (used by both staff signup and
--    resident onboarding screens, BEFORE anything is created).
--    security definer = runs with extra privilege, bypassing RLS,
--    but only returns the two safe fields below — never the
--    whole facilities row.
-- ------------------------------------------------------------
create or replace function validate_facility_code(p_code text)
returns table (facility_id uuid, facility_name text)
language sql
security definer
stable
as $$
  select id, name from facilities where facility_code = p_code
$$;

-- ------------------------------------------------------------
-- 2. Register a resident via facility code (no login involved).
--    Called once, during onboarding on the resident's device.
--    Returns the new resident_id — the frontend stores this
--    locally (e.g. localStorage) so the same device recognizes
--    itself as "this resident" on every future visit.
-- ------------------------------------------------------------
create or replace function register_resident(
  p_code text,
  p_name text,
  p_room text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_facility_id uuid;
  v_resident_id uuid;
begin
  select id into v_facility_id from facilities where facility_code = p_code;

  if v_facility_id is null then
    raise exception 'Invalid facility code';
  end if;

  insert into residents (facility_id, name, room)
  values (v_facility_id, p_name, p_room)
  returning id into v_resident_id;

  return v_resident_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. Create a staff profile row AFTER Supabase Auth signup.
--    Flow: frontend calls supabase.auth.signUp() first (creates
--    the auth.users row) -> then, while logged in, calls this
--    function to link that user to a facility via the code.
--    auth.uid() below is automatically the newly signed-up user.
-- ------------------------------------------------------------
create or replace function create_staff_profile(
  p_code text,
  p_name text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_facility_id uuid;
  v_staff_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be logged in to create a staff profile';
  end if;

  select id into v_facility_id from facilities where facility_code = p_code;

  if v_facility_id is null then
    raise exception 'Invalid facility code';
  end if;

  insert into staff (user_id, facility_id, name, role)
  values (auth.uid(), v_facility_id, p_name, 'staff')
  returning id into v_staff_id;

  return v_staff_id;
end;
$$;
