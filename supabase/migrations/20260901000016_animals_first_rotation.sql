-- ============================================================
-- Cognitive Check-In: Migration 016 — Animals-first category rotation
-- Run AFTER your trend engine v2 migration (015)
--
-- Before: all 6 categories rotated evenly, so Animals (the only
-- category the trend engine tracks) came up 1 day in 6.
-- Now:   3 days out of every 4 are Animals. Every 4th day is a
--        "variety day" that rotates through the other categories.
--
-- Same function names, same return columns (id, category), so
-- nothing the frontend calls needs to change.
-- To change the mix, change the "4" and "3" below.
--
-- (Fix: first version used OFFSET with a calculated value, which
--  Postgres does not allow. This version numbers the rows and
--  picks one with WHERE instead.)
-- ============================================================

-- Per-resident version (same per-resident shift idea as migration 004)
create or replace function get_daily_fluency_category_for_resident(p_resident_id uuid)
returns table (id int, category text)
language sql
stable
as $$
  with day_n as (
    select (current_date - date '2026-01-01')::bigint
           + abs(hashtext(p_resident_id::text || 'category')::bigint) as n
  ),
  candidates as (
    select fc.id, fc.category,
           row_number() over (order by fc.id) - 1 as rn   -- 0, 1, 2, ...
    from fluency_categories fc, day_n
    where fc.is_primary = (mod(day_n.n, 4) <> 3)           -- Animals on 3 of 4 days
  )
  select c.id, c.category
  from candidates c, day_n
  where c.rn = case
    when mod(day_n.n, 4) <> 3 then 0
    else mod(day_n.n / 4,
             (select count(*) from fluency_categories where not is_primary))
  end
$$;

-- Global version (not per resident), kept in step
create or replace function get_daily_fluency_category()
returns table (id int, category text)
language sql
stable
as $$
  with day_n as (
    select (current_date - date '2026-01-01')::bigint as n
  ),
  candidates as (
    select fc.id, fc.category,
           row_number() over (order by fc.id) - 1 as rn
    from fluency_categories fc, day_n
    where fc.is_primary = (mod(day_n.n, 4) <> 3)
  )
  select c.id, c.category
  from candidates c, day_n
  where c.rn = case
    when mod(day_n.n, 4) <> 3 then 0
    else mod(day_n.n / 4,
             (select count(*) from fluency_categories where not is_primary))
  end
$$;