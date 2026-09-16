-- PREPARED, NOT RUN as a migration — this is a read-only diagnostic query.
-- Paste it directly into the Supabase SQL editor; it changes nothing.
--
-- Important: standalone_workout_blocks has no dedicated timing_system/
-- structure column (per its own migration's comment, 20260822060000 —
-- "no CONCEPT/timing metadata though, out of scope"). Whatever structure a
-- block has lives embedded in its `notes` column as "[CONCEPT:{json}] ..."
-- exactly like program_blocks — parsed out here the same way
-- parseConceptNotes (blockHelpers.ts) does. A block with no CONCEPT tag at
-- all (never authored with structure/timing via admin-web's builder) shows
-- up as "(no metadata)" below — that's a distinct, and probably larger,
-- category from "has metadata but it's straight_set + single".
SELECT
  sw.category,
  sw.difficulty,
  COALESCE((regexp_match(swb.notes, '^\[CONCEPT:(.*?)\]'))[1]::jsonb ->> 'timing_system', '(no metadata)') AS timing_system,
  COALESCE((regexp_match(swb.notes, '^\[CONCEPT:(.*?)\]'))[1]::jsonb ->> 'structure', '(no metadata)') AS structure,
  count(*) AS block_count
FROM public.standalone_workout_blocks swb
JOIN public.standalone_workouts sw ON sw.id = swb.workout_id
WHERE sw.status = 'published'
GROUP BY 1, 2, 3, 4
ORDER BY sw.category, sw.difficulty, block_count DESC;
