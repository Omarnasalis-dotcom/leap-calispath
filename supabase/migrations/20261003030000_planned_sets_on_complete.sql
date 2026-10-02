-- "Complete" means the athlete did every exercise as planned (owner
-- decision, 2026-10-03). Until now, a block completed without tapping its
-- sets ("Submit directly", the quick DONE toggle) saved no set rows at all
-- — 592 of 1,337 completed logs on prod — so Main movements and other
-- per-exercise charts missed most training.
--
-- 1. A deferred trigger on workout_logs: when a completed (not missed) log
--    is saved, every exercise of its block that got no set rows is given
--    its planned sets — planned set count × planned reps or planned hold
--    seconds, no weight — tagged source = 'planned'. It runs at COMMIT, so
--    sets the athlete entered in the same save (log_block_with_sets) are
--    already there and are never duplicated; a log replaced within the
--    same save is skipped. Covers every write path and app version.
-- 2. The same fill for past completed logs, tagged 'planned_backfill'.
--    Caveat: uses the block's exercises as they are today, so a block a
--    coach edited after the workout gets today's plan. Undo with
--      DELETE FROM workout_set_logs WHERE source = 'planned_backfill';
--
-- exercise_id is stamped by workout_set_logs_stamp_exercise as usual.

CREATE OR REPLACE FUNCTION public._fill_planned_sets(p_workout_log_id uuid, p_source text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO workout_set_logs
    (workout_log_id, block_exercise_id, set_index, reps_completed, weight_used, hold_seconds, created_at, source)
  SELECT wl.id,
         be.id,
         s.n,
         CASE WHEN COALESCE(be.hold_seconds, 0) > 0 THEN NULL ELSE be.reps END,
         NULL,
         CASE WHEN COALESCE(be.hold_seconds, 0) > 0 THEN be.hold_seconds END,
         wl.completed_at,
         p_source
  FROM workout_logs wl
  JOIN block_exercises be ON be.block_id = wl.block_id
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(be.sets, 1), 1)) AS s(n)
  WHERE wl.id = p_workout_log_id
    AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%'
    -- something to record: planned reps or a planned hold
    AND (COALESCE(be.reps, 0) > 0 OR COALESCE(be.hold_seconds, 0) > 0)
    AND NOT EXISTS (
      SELECT 1 FROM workout_set_logs sl
      WHERE sl.workout_log_id = wl.id AND sl.block_exercise_id = be.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._fill_planned_sets(uuid, text) FROM PUBLIC, anon, authenticated;

-- Never fails the save: any error just skips the fill.
CREATE OR REPLACE FUNCTION public.workout_logs_fill_planned_sets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Replaced (deleted) within the same save: nothing to fill.
  IF NOT EXISTS (SELECT 1 FROM workout_logs WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public._fill_planned_sets(NEW.id, 'planned');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.workout_logs_fill_planned_sets() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workout_logs_fill_planned_sets ON public.workout_logs;
CREATE CONSTRAINT TRIGGER workout_logs_fill_planned_sets
  AFTER INSERT ON public.workout_logs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.workout_logs_fill_planned_sets();

-- History.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT wl.id FROM public.workout_logs wl
    WHERE wl.block_id IS NOT NULL
      AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%'
  LOOP
    PERFORM public._fill_planned_sets(r.id, 'planned_backfill');
  END LOOP;
END $$;
