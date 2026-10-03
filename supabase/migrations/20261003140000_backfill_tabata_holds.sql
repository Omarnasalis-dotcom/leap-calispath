-- Attach old Tabata hold times to their exercise. Before the Tabata log
-- sheet (2026-10-03), holds typed in the Tabata timer were saved with no
-- block_exercise_id, so no chart could place them. Where the block has
-- exactly ONE hold exercise the hold can only be that exercise: attach it
-- (the restamp trigger fills exercise_id). Blocks with several hold
-- exercises are left alone — there's no reliable way to tell which one a
-- hold was. Checked on prod before writing: 125 rows / 45 logs, none in a
-- missed log, no existing row for that exercise in those logs (so nothing
-- double-counts and no planned fill to remove).
--
-- Tagged source = 'tabata_backfill' (counts as logged in the charts).
-- Rollback:
--   UPDATE public.workout_set_logs
--   SET block_exercise_id = NULL, exercise_id = NULL, source = NULL
--   WHERE source = 'tabata_backfill';

UPDATE public.workout_set_logs sl
SET block_exercise_id = one.be_id,
    source = 'tabata_backfill'
FROM (
  SELECT wl.id AS log_id, min(be.id::text)::uuid AS be_id
  FROM public.workout_logs wl
  JOIN public.block_exercises be ON be.block_id = wl.block_id
  WHERE COALESCE(be.hold_seconds, 0) > 0
    AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%'
  GROUP BY wl.id
  HAVING count(*) = 1
) one
WHERE sl.workout_log_id = one.log_id
  AND sl.block_exercise_id IS NULL
  AND sl.hold_seconds > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.workout_set_logs x
    WHERE x.workout_log_id = sl.workout_log_id AND x.block_exercise_id = one.be_id
  );
