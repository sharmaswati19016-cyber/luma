-- Round 2: remove look-alike pairs from word sets 22, 23, 25.
--   22: drawer, box, crate        -> drawer, box, bracelet
--   23: jar, bottle, bowl         -> jar, crate, bowl
--   25: necklace, bracelet, watch -> necklace, bottle, watch
-- Each update only runs if the old word is still there, so re-running is harmless.

update word_sets set word_3 = 'Bracelet' where id = 22 and lower(trim(word_3)) = 'crate';
update word_sets set word_2 = 'Crate'    where id = 23 and lower(trim(word_2)) = 'bottle';
update word_sets set word_2 = 'Bottle'   where id = 25 and lower(trim(word_2)) = 'bracelet';

-- Safety check: fail loudly if any look-alike pair still shares a word set.
-- Keep this list in sync with LOOKALIKES in lib/wordIcons.ts.
do $$
declare
  clash_count integer;
begin
  with pairs(a, b) as (values
    ('nail','screw'),
    ('mop','broom'), ('mop','brush'), ('broom','brush'), ('brush','comb'),
    ('banner','flag'),
    ('tray','plate'), ('plate','bowl'),
    ('blanket','carpet'), ('blanket','towel'), ('carpet','towel'),
    ('flute','trumpet'), ('flute','whistle'), ('flute','horn'), ('trumpet','horn'),
    ('bench','chair'), ('bench','stool'), ('chair','stool'), ('chair','sofa'),
    ('rope','chain'),
    ('clock','watch'),
    ('lamp','lantern'), ('lamp','candle'), ('lantern','candle'),
    ('necklace','bracelet'), ('necklace','ring'), ('necklace','chain'),
    ('bracelet','ring'), ('ring','chain'),
    ('purse','wallet'), ('box','crate'), ('basket','bucket'),
    ('jar','bottle'), ('violin','guitar'), ('scarf','ribbon')
  ),
  sets as (
    select id, lower(trim(word_1)) w1, lower(trim(word_2)) w2, lower(trim(word_3)) w3
    from word_sets
  )
  select count(*) into clash_count
  from sets s
  join pairs p
    on p.a in (s.w1, s.w2, s.w3)
   and p.b in (s.w1, s.w2, s.w3);

  if clash_count > 0 then
    raise exception 'Look-alike words still share % word set(s)', clash_count;
  end if;
end $$;