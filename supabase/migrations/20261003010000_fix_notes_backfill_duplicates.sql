-- Fix 20261002040000 (notes backfill): it skipped a workout log only when
-- the log already had a *weighted* set, so where the real sets existed but
-- had no kg typed, it added an extra set (planned reps + the note's
-- weight) on top of them — inflating rep totals (e.g. 4 × 12 Goblet Squat
-- showed as 60 reps instead of 48). 5 rows on prod, 4 athletes, 2026-10-03.
--
-- For each such duplicate:
--   1. its weight moves onto the real sets of the same exercise in the same
--      log that have no weight (the note's "Weight Used" was theirs);
--   2. the duplicate row is deleted, so reps count only what was done.
-- Backfill rows with no real sets beside them are untouched.

WITH dup AS (
  SELECT b.id, b.workout_log_id, b.exercise_id, b.weight_used
  FROM public.workout_set_logs b
  WHERE b.source = 'notes_backfill'
    AND EXISTS (
      SELECT 1 FROM public.workout_set_logs r
      WHERE r.workout_log_id = b.workout_log_id
        AND r.exercise_id = b.exercise_id
        AND r.source IS NULL
    )
),
moved AS (
  UPDATE public.workout_set_logs r
  SET weight_used = d.weight_used
  FROM dup d
  WHERE r.workout_log_id = d.workout_log_id
    AND r.exercise_id = d.exercise_id
    AND r.source IS NULL
    AND r.weight_used IS NULL
  RETURNING r.id
)
DELETE FROM public.workout_set_logs b
USING dup d
WHERE b.id = d.id;
