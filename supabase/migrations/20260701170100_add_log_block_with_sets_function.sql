-- Single write path for logging a block with full detail: does the same
-- delete-then-reinsert into workout_logs as toggle_block_status (same
-- race-guard rationale — see 20260629101000_*), then bulk-inserts the
-- per-set/round rows into workout_set_logs, all in one transaction so a
-- failure partway through doesn't leave a workout_log row with no sets.
--
-- p_sets is a jsonb array of objects shaped like:
--   { "block_exercise_id": uuid|null, "set_index": int,
--     "reps_completed": int|null, "weight_used": numeric|null,
--     "hold_seconds": numeric|null }
--
-- SECURITY INVOKER (default): same trust model as toggle_block_status —
-- only the warrior's own client calls this with their own warrior_id, and
-- RLS on workout_logs/workout_set_logs enforces ownership regardless.
CREATE OR REPLACE FUNCTION public.log_block_with_sets(
  p_warrior_id uuid,
  p_warrior_program_id uuid,
  p_block_id uuid,
  p_status text,
  p_feel text,
  p_rpe integer,
  p_missed_reason text,
  p_missed_detail text,
  p_notes text,
  p_session_seconds integer,
  p_start_of_today timestamptz,
  p_sets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_workout_log_id uuid;
  v_set jsonb;
BEGIN
  DELETE FROM workout_logs
  WHERE warrior_id = p_warrior_id
    AND block_id = p_block_id
    AND completed_at >= p_start_of_today;

  IF p_status = 'none' THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO workout_logs (
    warrior_program_id, warrior_id, block_id, notes, rating,
    feel, rpe, missed_reason, missed_detail, session_seconds
  )
  VALUES (
    p_warrior_program_id,
    p_warrior_id,
    p_block_id,
    CASE WHEN p_status = 'missed' THEN '[STATUS:MISSED]' ELSE COALESCE(p_notes, '') END,
    COALESCE(round(p_rpe / 2.0), 5),
    p_feel,
    p_rpe,
    p_missed_reason,
    p_missed_detail,
    p_session_seconds
  )
  RETURNING id INTO v_workout_log_id;

  IF p_sets IS NOT NULL THEN
    FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
    LOOP
      INSERT INTO workout_set_logs (
        workout_log_id, block_exercise_id, set_index,
        reps_completed, weight_used, hold_seconds
      )
      VALUES (
        v_workout_log_id,
        (v_set->>'block_exercise_id')::uuid,
        (v_set->>'set_index')::integer,
        (v_set->>'reps_completed')::integer,
        (v_set->>'weight_used')::numeric,
        (v_set->>'hold_seconds')::numeric
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'workout_log_id', v_workout_log_id);
END;
$function$;
