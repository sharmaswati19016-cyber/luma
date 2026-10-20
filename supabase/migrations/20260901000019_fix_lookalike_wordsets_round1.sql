-- Round 1: remove look-alike pairs from word sets 13, 18, 21, 29.
-- One word moves from each clashing set to the next, so every word is still used once.
--   13: broom, mop, sock          -> broom, screw, sock
--   18: nail, screw, brush        -> nail, stool, brush
--   21: bench, stool, shelf       -> bench, trumpet, shelf
--   29: horn, trumpet, violin     -> horn, mop, violin
-- Each update only runs if the old word is still there, so re-running is harmless.

update word_sets set word_2 = 'Screw'   where id = 13 and lower(trim(word_2)) = 'mop';
update word_sets set word_2 = 'Stool'   where id = 18 and lower(trim(word_2)) = 'screw';
update word_sets set word_2 = 'Trumpet' where id = 21 and lower(trim(word_2)) = 'stool';
update word_sets set word_2 = 'Mop'     where id = 29 and lower(trim(word_2)) = 'trumpet';