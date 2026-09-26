-- ============================================================
-- Cognitive Check-In: Step 2b — Pairing code system
-- Run this AFTER step4_checkin_pipeline.sql
--
-- Replaces "resident types their name to register" with:
--   1. Staff adds the resident from the dashboard (typing is
--      fine for staff — they're tech-comfortable)
--   2. System hands back a short 6-digit pairing code
--   3. Resident's tablet: tap in that 6-digit code once
--   4. Device stores the returned resident_id locally forever
--      (this is the actual "one device per resident" mechanism)
--   5. If the tablet ever resets, re-entering the SAME code
--      re-links to the SAME existing resident — no duplicate
--      created, no data lost.
--
-- Your original register_resident() function from Step 2 is
-- left untouched — this is an additional, preferred path, not
-- a replacement.
-- ============================================================

alter table residents add column pairing_code text unique;

-- ------------------------------------------------------------
-- Helper: generates a random 6-digit code, re-rolling on the
-- rare chance of a collision with an existing code.
-- ------------------------------------------------------------
create or replace function generate_unique_pairing_code()
returns text
language plpgsql
security definer
as $$
declare
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    select exists(select 1 from residents where pairing_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

-- ------------------------------------------------------------
-- create_resident_by_staff
-- Called from the staff dashboard while logged in. No facility
-- code needed here — the staff member's own facility_id is used
-- automatically, since they're already authenticated.
-- ------------------------------------------------------------
create or replace function create_resident_by_staff(
  p_name text,
  p_room text default null
)
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

  insert into residents (facility_id, name, room, pairing_code)
  values (v_facility_id, p_name, p_room, v_code)
  returning id into v_resident_id;

  return query select v_resident_id, v_code;
end;
$$;

-- ------------------------------------------------------------
-- pair_device
-- Called from the RESIDENT's tablet (no login, anon key).
-- Just turns "the 6-digit code someone tapped in" into the
-- resident_id the frontend should save to local storage.
-- Safe to call repeatedly with the same code — always returns
-- the same resident_id, never creates anything new.
-- ------------------------------------------------------------
create or replace function pair_device(p_pairing_code text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_resident_id uuid;
begin
  select id into v_resident_id
  from residents where pairing_code = p_pairing_code;

  if v_resident_id is null then
    raise exception 'Invalid pairing code';
  end if;

  return v_resident_id;
end;
$$;

-- ------------------------------------------------------------
-- regenerate_pairing_code
-- For when a code is lost, forgotten, or a sticky note fell off
-- a tablet. Any staff member at the resident's own facility can
-- do this (low-risk action — it doesn't touch history or data,
-- just issues a fresh PIN), unlike delete_resident which stays
-- admin-only.
-- ------------------------------------------------------------
create or replace function regenerate_pairing_code(p_resident_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_resident_facility_id uuid;
  v_staff_facility_id uuid;
  v_new_code text;
begin
  if auth.uid() is null then
    raise exception 'Must be logged in as staff';
  end if;

  select facility_id into v_resident_facility_id
  from residents where id = p_resident_id;

  if v_resident_facility_id is null then
    raise exception 'Resident not found';
  end if;

  select facility_id into v_staff_facility_id
  from staff where user_id = auth.uid();

  if v_staff_facility_id is null or v_staff_facility_id <> v_resident_facility_id then
    raise exception 'Not authorized for this facility';
  end if;

  v_new_code := generate_unique_pairing_code();

  update residents set pairing_code = v_new_code where id = p_resident_id;

  return v_new_code;
end;
$$;
