-- ============================================================
-- Cognitive Check-In: Step 3 — Static content pool
-- Run this AFTER step2_auth.sql
-- ============================================================

-- ------------------------------------------------------------
-- WORD SETS (for the memory/recall task)
-- 10 pre-validated sets of 3 simple, common, concrete nouns.
-- Add more anytime later just by inserting more rows —
-- no code changes needed.
-- ------------------------------------------------------------
create table word_sets (
  id serial primary key,
  word_1 text not null,
  word_2 text not null,
  word_3 text not null
);

insert into word_sets (word_1, word_2, word_3) values
  ('Apple', 'River', 'Lamp'),
  ('Chair', 'Cloud', 'Table'),
  ('Shoe', 'Clock', 'Garden'),
  ('Bridge', 'Candle', 'Pillow'),
  ('Window', 'Basket', 'Mirror'),
  ('Ladder', 'Blanket', 'Kettle'),
  ('Fence', 'Drum', 'Button'),
  ('Ribbon', 'Anchor', 'Barrel'),
  ('Compass', 'Feather', 'Hammer'),
  ('Kite', 'Lantern', 'Melon');

-- ------------------------------------------------------------
-- FLUENCY CATEGORIES (for the "name as many X as you can" task)
-- ------------------------------------------------------------
create table fluency_categories (
  id serial primary key,
  category text not null
);

insert into fluency_categories (category) values
  ('Animals'),
  ('Fruits'),
  ('Colors'),
  ('Things in a kitchen'),
  ('Clothing items'),
  ('Vehicles');

-- ------------------------------------------------------------
-- RLS: this content has no personal data, so it's safe to let
-- anyone read it (residents' devices need it, and they have no
-- login). We still enable RLS + an explicit "select true" policy
-- rather than leaving RLS off, so it's a deliberate choice, not
-- an oversight.
-- ------------------------------------------------------------
alter table word_sets enable row level security;
alter table fluency_categories enable row level security;

create policy "word sets are public read-only"
  on word_sets for select
  using (true);

create policy "fluency categories are public read-only"
  on fluency_categories for select
  using (true);

-- ------------------------------------------------------------
-- DAILY ROTATION FUNCTIONS
-- Deterministic: same calendar date always picks the same set/
-- category, cycling through the pool. Nothing to schedule, no
-- state to store — it's just today's date modulo the pool size.
-- ------------------------------------------------------------
create or replace function get_daily_word_set()
returns table (id int, word_1 text, word_2 text, word_3 text)
language sql
stable
as $$
  select id, word_1, word_2, word_3
  from word_sets
  order by id
  offset ((current_date - date '2026-01-01')::int % (select count(*)::int from word_sets))
  limit 1
$$;

create or replace function get_daily_fluency_category()
returns table (id int, category text)
language sql
stable
as $$
  select id, category
  from fluency_categories
  order by id
  offset ((current_date - date '2026-01-01')::int % (select count(*)::int from fluency_categories))
  limit 1
$$;
