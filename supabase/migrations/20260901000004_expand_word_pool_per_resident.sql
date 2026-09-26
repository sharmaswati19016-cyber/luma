-- ============================================================
-- Cognitive Check-In: Step 3b — More sets + per-resident rotation
-- Run this AFTER step3_content_pool.sql
-- ============================================================

-- ------------------------------------------------------------
-- 20 more word sets (bringing the total pool to 30).
-- Purely additive — your original 10 sets are untouched.
-- ------------------------------------------------------------
insert into word_sets (word_1, word_2, word_3) values
  ('Spoon', 'Fork', 'Knife'),
  ('Plate', 'Cup', 'Bucket'),
  ('Broom', 'Mop', 'Sock'),
  ('Glove', 'Scarf', 'Hat'),
  ('Coat', 'Belt', 'Wallet'),
  ('Purse', 'Umbrella', 'Bicycle'),
  ('Wagon', 'Wheel', 'Rope'),
  ('Nail', 'Screw', 'Brush'),
  ('Comb', 'Soap', 'Towel'),
  ('Curtain', 'Carpet', 'Sofa'),
  ('Bench', 'Stool', 'Shelf'),
  ('Drawer', 'Box', 'Crate'),
  ('Jar', 'Bottle', 'Bowl'),
  ('Tray', 'Napkin', 'Ring'),
  ('Necklace', 'Bracelet', 'Watch'),
  ('Key', 'Lock', 'Chain'),
  ('Hook', 'Peg', 'Flag'),
  ('Banner', 'Bell', 'Whistle'),
  ('Horn', 'Trumpet', 'Violin'),
  ('Guitar', 'Piano', 'Flute');

-- ------------------------------------------------------------
-- PER-RESIDENT daily rotation.
-- Same idea as before (date modulo pool size) but each resident's
-- sequence is offset by a fixed, deterministic "shift" derived
-- from their own resident_id (via hashtext). Result:
--   - the SAME resident always gets the same set on a given date
--     (so re-opening the app that day doesn't change it)
--   - DIFFERENT residents get different sets on the same date
--   - it still rotates day to day, cycling through all 30
-- No new column or storage needed — the offset is computed from
-- the id itself, so this works instantly for every resident,
-- existing or new.
-- ------------------------------------------------------------
create or replace function get_daily_word_set_for_resident(p_resident_id uuid)
returns table (id int, word_1 text, word_2 text, word_3 text)
language sql
stable
as $$
  select id, word_1, word_2, word_3
  from word_sets
  order by id
  offset (
    mod(
      (current_date - date '2026-01-01')::int + abs(hashtext(p_resident_id::text)),
      (select count(*)::int from word_sets)
    )
  )
  limit 1
$$;

create or replace function get_daily_fluency_category_for_resident(p_resident_id uuid)
returns table (id int, category text)
language sql
stable
as $$
  select id, category
  from fluency_categories
  order by id
  offset (
    mod(
      (current_date - date '2026-01-01')::int + abs(hashtext(p_resident_id::text || 'category')),
      (select count(*)::int from fluency_categories)
    )
  )
  limit 1
$$;
