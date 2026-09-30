-- ============================================================
-- delete_resident
-- Only a staff member with role='admin', at the SAME facility
-- as the resident, can delete. Cascades automatically remove
-- that resident's checkins and trend_flags too.
-- ============================================================
create or replace function delete_resident(p_resident_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_resident_facility_id uuid;
  v_staff_role text;
  v_staff_facility_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be logged in';
  end if;

  select facility_id into v_resident_facility_id
  from residents where id = p_resident_id;

  if v_resident_facility_id is null then
    raise exception 'Resident not found';
  end if;

  select role, facility_id into v_staff_role, v_staff_facility_id
  from staff where user_id = auth.uid();

  if v_staff_facility_id is null or v_staff_facility_id <> v_resident_facility_id then
    raise exception 'Not authorized for this facility';
  end if;

  if v_staff_role <> 'admin' then
    raise exception 'Only an admin can delete a resident';
  end if;

  delete from residents where id = p_resident_id;
end;
$$;
