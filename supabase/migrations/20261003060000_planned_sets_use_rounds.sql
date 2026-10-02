-- Planned-set fill (20261003030000): circuits and supersets are done in
-- rounds — every exercise once per round — and the round count lives on
-- the block ([CONCEPT:{…"rounds":"4"…}] in program_blocks.notes), not on
-- each exercise's sets field (often 1 there). The fill used the exercise's
-- sets, under-counting circuits/supersets. Now the planned count per
-- exercise is the block's rounds for those structures (mirrors the app's
-- WarriorBlockCard / log-modal check), the exercise's sets otherwise.
--
-- Planned rows already saved for circuit/superset logs (3,118 + 916 on
-- prod, 2026-10-03) are rebuilt with the right count; rows the athlete
-- entered are never touched.

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
  JOIN program_blocks pb ON pb.id = wl.block_id
  JOIN block_exercises be ON be.block_id = wl.block_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN substring(pb.notes from '"structure":"([a-z]+)"') IN ('circuit', 'superset')
        THEN GREATEST(COALESCE(substring(pb.notes from '"rounds":"?([0-9]+)')::int, 1), 1)
      ELSE GREATEST(COALESCE(be.sets, 1), 1)
    END AS planned
  ) p
  CROSS JOIN LATERAL generate_series(1, p.planned) AS s(n)
  WHERE wl.id = p_workout_log_id
    AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%'
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

-- Rebuild planned rows for circuit/superset logs, keeping each row's source
-- ('planned' from the live trigger, 'planned_backfill' from history).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT sl.workout_log_id AS log_id, sl.source
    FROM public.workout_set_logs sl
    JOIN public.workout_logs wl ON wl.id = sl.workout_log_id
    JOIN public.program_blocks pb ON pb.id = wl.block_id
    WHERE sl.source IN ('planned', 'planned_backfill')
      AND substring(pb.notes from '"structure":"([a-z]+)"') IN ('circuit', 'superset')
  LOOP
    DELETE FROM public.workout_set_logs
    WHERE workout_log_id = r.log_id AND source = r.source;
    PERFORM public._fill_planned_sets(r.log_id, r.source);
  END LOOP;
END $$;
