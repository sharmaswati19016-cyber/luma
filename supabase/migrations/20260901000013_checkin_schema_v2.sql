-- ============================================================
-- Cognitive Check-In: Migration 013 — Check-in v2 schema
-- Run in the Supabase SQL editor AFTER 20260901000012_seed_demo_data
-- Everything here is ADDITIVE: no existing column, table or
-- function is changed or removed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New optional columns on checkins
--    free_recall_score : spoken recall of the 3 words (main memory metric)
--    recognition_score : picture-tap result (stored, not used in flags)
--    category_id       : which fluency category was asked that day
--    is_practice       : first 2 check-ins, kept out of baseline/trend
-- Old rows keep NULL / false, so seeded demo data still works.
-- ------------------------------------------------------------
alter table checkins
  add column if not exists free_recall_score int
    check (free_recall_score between 0 and 3),
  add column if not exists recognition_score int
    check (recognition_score between 0 and 3),
  add column if not exists category_id int references fluency_categories(id),
  add column if not exists is_practice boolean not null default false;

-- ------------------------------------------------------------
-- 2. Mark Animals as the primary tracked category
-- ------------------------------------------------------------
alter table fluency_categories
  add column if not exists is_primary boolean not null default false;

update fluency_categories set is_primary = true where category = 'Animals';

-- ------------------------------------------------------------
-- 3. Valid-word list per category (English only)
--    Words are stored lowercase. Plurals ("dogs", "mangoes") are
--    matched automatically by the counting function below.
-- ------------------------------------------------------------
create table if not exists category_valid_words (
  id serial primary key,
  category_id int not null references fluency_categories(id) on delete cascade,
  word text not null,
  unique (category_id, word)
);

alter table category_valid_words enable row level security;

create policy "valid words are public read-only"
  on category_valid_words for select
  using (true);

-- Animals
insert into category_valid_words (category_id, word)
select c.id, lower(w)
from fluency_categories c,
  unnest(array[
    'dog','puppy','cat','kitten','cow','calf','bull','ox','buffalo','goat','sheep','lamb',
    'horse','pony','donkey','mule','camel','pig','boar','wild boar','elephant','tiger','lion',
    'leopard','cheetah','panther','bear','wolf','fox','jackal','hyena','deer','stag','antelope',
    'nilgai','rabbit','hare','squirrel','rat','mouse','mongoose','monkey','langur','ape',
    'gorilla','chimpanzee','giraffe','zebra','hippo','hippopotamus','rhino','rhinoceros',
    'kangaroo','koala','panda','otter','bat','hedgehog','porcupine','yak','bison','moose',
    'reindeer','snake','cobra','python','lizard','gecko','chameleon','crocodile','alligator',
    'turtle','tortoise','frog','toad','fish','shark','whale','dolphin','octopus','crab',
    'lobster','prawn','shrimp','seal','walrus','penguin','parrot','crow','sparrow','pigeon',
    'dove','eagle','hawk','kite','vulture','owl','peacock','peahen','duck','goose','swan','hen',
    'chicken','rooster','cock','turkey','crane','stork','heron','kingfisher','woodpecker',
    'cuckoo','koel','myna','bulbul','bee','butterfly','ant','spider','scorpion'
  ]) as w
where c.category = 'Animals'
on conflict do nothing;

-- Fruits
insert into category_valid_words (category_id, word)
select c.id, lower(w)
from fluency_categories c,
  unnest(array[
    'apple','banana','mango','orange','grape','guava','papaya','pineapple','watermelon','melon',
    'muskmelon','pomegranate','lemon','lime','sweet lime','mosambi','coconut','pear','peach',
    'plum','cherry','strawberry','blueberry','raspberry','blackberry','berry','litchi','lychee',
    'chikoo','sapota','custard apple','jackfruit','fig','date','apricot','kiwi','jamun',
    'tamarind','amla','tangerine','grapefruit','avocado'
  ]) as w
where c.category = 'Fruits'
on conflict do nothing;

-- Colors
insert into category_valid_words (category_id, word)
select c.id, lower(w)
from fluency_categories c,
  unnest(array[
    'red','blue','green','yellow','orange','purple','violet','pink','brown','black','white',
    'grey','gray','gold','golden','silver','maroon','saffron','turquoise','indigo','cream',
    'beige','magenta','lavender','navy','cyan','peach'
  ]) as w
where c.category = 'Colors'
on conflict do nothing;

-- Things in a kitchen
insert into category_valid_words (category_id, word)
select c.id, lower(w)
from fluency_categories c,
  unnest(array[
    'spoon','fork','knife','plate','bowl','glass','cup','mug','pot','pan','kettle','stove','gas',
    'oven','fridge','refrigerator','tawa','ladle','spatula','cooker','pressure cooker','grater',
    'strainer','sieve','colander','rolling pin','chopping board','jar','bottle','tray','mixer',
    'grinder','mixie','toaster','microwave','tongs','whisk','peeler','sink','lid','jug',
    'tumbler','thali','katori','container','tin','basket','towel','apron','matchbox','lighter',
    'bucket','mortar','pestle'
  ]) as w
where c.category = 'Things in a kitchen'
on conflict do nothing;

-- Clothing items
insert into category_valid_words (category_id, word)
select c.id, lower(w)
from fluency_categories c,
  unnest(array[
    'shirt','trouser','pant','jeans','saree','sari','blouse','dress','skirt','kurta','kurti',
    'pyjama','pajama','dhoti','lungi','shawl','scarf','sweater','jacket','coat','cap','hat',
    'shoe','sock','slipper','sandal','belt','vest','underwear','glove','tie','suit','short',
    't-shirt','tshirt','nightgown','dupatta','salwar','turban','muffler','raincoat','uniform',
    'waistcoat','handkerchief'
  ]) as w
where c.category = 'Clothing items'
on conflict do nothing;

-- Vehicles
insert into category_valid_words (category_id, word)
select c.id, lower(w)
from fluency_categories c,
  unnest(array[
    'car','bus','truck','train','bike','bicycle','cycle','scooter','motorcycle','auto',
    'autorickshaw','rickshaw','tempo','tractor','van','jeep','taxi','cab','ambulance',
    'aeroplane','airplane','plane','helicopter','ship','boat','ferry','metro','tram','lorry',
    'cart','bullock cart','tonga','fire engine','submarine','rocket'
  ]) as w
where c.category = 'Vehicles'
on conflict do nothing;

-- ------------------------------------------------------------
-- 4. count_valid_fluency_words
--    Takes the CONFIRMED word list and returns how many count:
--      - only words in the category's valid list
--      - repeats are not counted ("dog", "dogs", "Dog" = 1)
--      - out-of-category words are not counted
--    Plurals are handled by also trying the word without a
--    trailing "s" or "es".
-- ------------------------------------------------------------
create or replace function count_valid_fluency_words(
  p_category_id int,
  p_words text[]
)
returns int
language sql
stable
as $$
  select count(distinct v.id)::int
  from (
    select distinct lower(trim(t.w)) as w
    from unnest(coalesce(p_words, array[]::text[])) as t(w)
    where trim(t.w) <> ''
  ) x
  join category_valid_words v
    on v.category_id = p_category_id
   and v.word = any (array[
         x.w,
         regexp_replace(x.w, 's$', ''),
         regexp_replace(x.w, 'es$', '')
       ])
$$;

-- ------------------------------------------------------------
-- 5. Off days (staff marks "unwell", "new medicine", etc.)
--    Separate table so a day can be marked even if the resident
--    did not check in. The trend engine will skip these days.
-- ------------------------------------------------------------
create table if not exists off_days (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references residents(id) on delete cascade,
  date date not null,
  reason text not null default 'other'
    check (reason in ('unwell', 'new_medicine', 'slept_badly', 'other')),
  marked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (resident_id, date)
);

alter table off_days enable row level security;

-- staff can READ off days in their own facility; writing goes
-- through the two functions below
create policy "staff can view off days in own facility"
  on off_days for select
  using (
    resident_id in (
      select id from residents where facility_id = auth_facility_id()
    )
  );

create or replace function mark_off_day(
  p_resident_id uuid,
  p_date date default current_date,
  p_reason text default 'other'
)
returns void
language plpgsql
security definer
as $$
declare
  v_resident_facility_id uuid;
  v_staff_facility_id uuid;
begin
  select facility_id into v_resident_facility_id
  from residents where id = p_resident_id;

  if v_resident_facility_id is null then
    raise exception 'Resident not found';
  end if;

  select facility_id into v_staff_facility_id
  from staff where user_id = auth.uid();

  if v_staff_facility_id is null or v_staff_facility_id <> v_resident_facility_id then
    raise exception 'Not authorized to mark off days for this resident';
  end if;

  if p_date > current_date then
    raise exception 'Cannot mark a future day as an off day';
  end if;

  insert into off_days (resident_id, date, reason, marked_by)
  values (p_resident_id, p_date, p_reason, auth.uid())
  on conflict (resident_id, date) do update
    set reason = excluded.reason, marked_by = excluded.marked_by;
end;
$$;

create or replace function unmark_off_day(
  p_resident_id uuid,
  p_date date default current_date
)
returns void
language plpgsql
security definer
as $$
declare
  v_resident_facility_id uuid;
  v_staff_facility_id uuid;
begin
  select facility_id into v_resident_facility_id
  from residents where id = p_resident_id;

  if v_resident_facility_id is null then
    raise exception 'Resident not found';
  end if;

  select facility_id into v_staff_facility_id
  from staff where user_id = auth.uid();

  if v_staff_facility_id is null or v_staff_facility_id <> v_resident_facility_id then
    raise exception 'Not authorized to change off days for this resident';
  end if;

  delete from off_days where resident_id = p_resident_id and date = p_date;
end;
$$;