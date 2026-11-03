-- A set sent with a block_exercise_id that no longer exists failed the whole
-- Log Block with "workout_set_logs_block_exercise_id_fkey", and the athlete
-- could not log that block until the screen reloaded — or for up to 12h
-- when the stale id came back from the app's saved set progress. It happens
-- when the coach removes or swaps an exercise in the block the athlete has
-- open (and, before 20261103180000, on any Program Builder save).
--
-- Such a set is now saved without its slot (block_exercise_id NULL, source
-- 'stale_slot'), so the log, its feel/RPE/notes and the reps still land.
-- Only the foreign-key failure on that column is caught; every other error
-- still fails the log.
--
-- The planned-set fill skips a log holding a stale_slot set: those sets
-- can't be tied to a current exercise, so it would add the plan on top of
-- what was actually done (a 14-13-12-11 ladder saved twice, once as 4x14).
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
  p_start_of_today timestamp with time zone,
  p_sets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_workout_log_id uuid;
  v_set jsonb;
  v_min_access_tier text;
  v_caller_tier text;
  v_tier_rank jsonb := '{"free":0,"first":1,"pro":2,"max":3}'::jsonb;
BEGIN
  -- Same paid check as toggle_block_status: completing a block of a program
  -- above the caller's plan is refused. Missed / cleared stay allowed.
  IF p_status = 'completed' THEN
    SELECT pt.min_access_tier INTO v_min_access_tier
    FROM warrior_programs wp
    JOIN program_templates pt ON pt.id = wp.template_id
    WHERE wp.id = p_warrior_program_id;

    IF v_min_access_tier IS NOT NULL THEN
      v_caller_tier := public.caller_effective_tier();
      IF COALESCE((v_tier_rank ->> v_caller_tier)::int, 0) < COALESCE((v_tier_rank ->> v_min_access_tier)::int, 0) THEN
        RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

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
      BEGIN
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
      EXCEPTION WHEN foreign_key_violation THEN
        -- The exercise was removed from the plan after the athlete's screen
        -- loaded it: keep the set, without the slot.
        INSERT INTO workout_set_logs (
          workout_log_id, block_exercise_id, set_index,
          reps_completed, weight_used, hold_seconds, source
        )
        VALUES (
          v_workout_log_id,
          NULL,
          (v_set->>'set_index')::integer,
          (v_set->>'reps_completed')::integer,
          (v_set->>'weight_used')::numeric,
          (v_set->>'hold_seconds')::numeric,
          'stale_slot'
        );
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'workout_log_id', v_workout_log_id);
END;
$function$;

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
    )
    AND NOT EXISTS (
      SELECT 1 FROM workout_set_logs sl
      WHERE sl.workout_log_id = wl.id AND sl.source = 'stale_slot'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._fill_planned_sets(uuid, text) FROM PUBLIC, anon, authenticated;
