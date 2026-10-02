-- Turn old "Weight used" notes into real set rows.
--
-- Before the 2026-10-02 app change, the log modal's "Weight used" was only
-- written into workout_logs.notes as "[LOG] Weight Used: <kg> KG", so it
-- never reached workout_set_logs or the Performance charts. Owner decision
-- (2026-10-02): backfill them as real sets.
--
-- One set per log, only when all of these hold:
--   - the note's kg is a plain number ("12.5" / "12,5")
--   - the block has exactly ONE weighted exercise (with 2+ the lift is
--     unknown). Caveat: that is the block's exercise TODAY — if a coach
--     swapped it after the log, the set lands on the newer movement.
--   - the log has no weighted set already
-- reps_completed = the planned reps; set_index 1. exercise_id is stamped by
-- the workout_set_logs_stamp_exercise trigger (20261002030000).
-- 49 rows on prod at write time (dry run, 2026-10-02).
--
-- Rows are tagged source = 'notes_backfill', so they can be found or
-- removed later:
--   DELETE FROM public.workout_set_logs WHERE source = 'notes_backfill';

ALTER TABLE public.workout_set_logs
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN public.workout_set_logs.source IS
  'NULL = logged in the app; ''notes_backfill'' = created from a "[LOG] Weight Used" note by 20261002040000.';

INSERT INTO public.workout_set_logs
  (workout_log_id, block_exercise_id, set_index, reps_completed, weight_used, hold_seconds, created_at, source)
SELECT wl.id,
       be.id,
       1,
       be.reps,
       replace(substring(wl.notes from 'Weight Used: ([0-9]+([.,][0-9]+)?) KG'), ',', '.')::numeric,
       NULL,
       wl.completed_at,
       'notes_backfill'
FROM public.workout_logs wl
JOIN public.block_exercises be
  ON be.block_id = wl.block_id AND be.is_weighted
WHERE wl.notes ~ 'Weight Used: [0-9]+([.,][0-9]+)? KG'
  AND (SELECT count(*) FROM public.block_exercises b
       WHERE b.block_id = wl.block_id AND b.is_weighted) = 1
  AND NOT EXISTS (SELECT 1 FROM public.workout_set_logs s
                  WHERE s.workout_log_id = wl.id AND s.weight_used > 0);
