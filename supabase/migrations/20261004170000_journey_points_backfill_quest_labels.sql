-- Side-quest / trial awards paid before 20261004160000 have no label, but
-- the app now matches "today's side quest" by label = slot key (w{n}_s{m}).
-- The slot key is already in source_key ("{program_id}:{slot_key}"), so
-- copy it over. Data only; touches only rows with a null label.
UPDATE public.journey_points
SET label = split_part(source_key, ':', 2)
WHERE source IN ('side_quest', 'trial')
  AND label IS NULL
  AND split_part(source_key, ':', 2) ~ '^w[0-9]+_(s[0-9]+|trial)$';
