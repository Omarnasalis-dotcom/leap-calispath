-- Per-exercise RPE for straight-set blocks with 2+ exercises (owner,
-- 2026-11-06). workout_logs.exercise_rpe maps block_exercise_id to 1-10;
-- workout_logs.rpe stays the block's number (their average, rounded), so the
-- Effort charts, Last Time and older apps keep reading it unchanged.
--
-- p_exercise_rpe is optional: 1.2.17 and earlier don't send it. The DROP is
-- needed because a new parameter would otherwise leave a second overload.
-- Function bodies are prod's, with only the marked changes.

ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS exercise_rpe jsonb;

CREATE OR REPLACE FUNCTION public.workout_exercise_rpe_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- CASE, not AND/OR: jsonb_each_text on a non-object raises.
  SELECT CASE
    WHEN jsonb_typeof(p) IS DISTINCT FROM 'object' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(p) e
      WHERE CASE
        WHEN e.value !~ '^[0-9]{1,2}$' THEN true
        ELSE e.value::integer NOT BETWEEN 1 AND 10
      END
    )
  END;
$function$;

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_exercise_rpe_check
  CHECK (exercise_rpe IS NULL OR public.workout_exercise_rpe_valid(exercise_rpe));

DROP FUNCTION public.log_block_with_sets(uuid, uuid, uuid, text, text, integer, text, text, text, integer, timestamp with time zone, jsonb);

CREATE OR REPLACE FUNCTION public.log_block_with_sets(p_warrior_id uuid, p_warrior_program_id uuid, p_block_id uuid, p_status text, p_feel text, p_rpe integer, p_missed_reason text, p_missed_detail text, p_notes text, p_session_seconds integer, p_start_of_today timestamp with time zone, p_sets jsonb, p_exercise_rpe jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_workout_log_id uuid;
  v_set jsonb;
  v_min_access_tier text;
  v_caller_tier text;
  v_tier_rank jsonb := '{"free":0,"first":1,"pro":2,"max":3}'::jsonb;
  v_exercise_rpe jsonb := NULLIF(p_exercise_rpe, '{}'::jsonb);
  v_rpe integer := p_rpe;
BEGIN
  -- Rated per exercise: the block's RPE is their average, so the Effort
  -- charts and every other reader of workout_logs.rpe keep working.
  IF p_status <> 'completed' THEN
    v_exercise_rpe := NULL;
  ELSIF v_exercise_rpe IS NOT NULL AND public.workout_exercise_rpe_valid(v_exercise_rpe) THEN
    SELECT round(avg(e.value::numeric))::integer INTO v_rpe
    FROM jsonb_each_text(v_exercise_rpe) e;
  END IF;

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
    feel, rpe, exercise_rpe, missed_reason, missed_detail, session_seconds
  )
  VALUES (
    p_warrior_program_id,
    p_warrior_id,
    p_block_id,
    CASE WHEN p_status = 'missed' THEN '[STATUS:MISSED]' ELSE COALESCE(p_notes, '') END,
    COALESCE(round(v_rpe / 2.0), 5),
    p_feel,
    v_rpe,
    v_exercise_rpe,
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

-- Same execute rights the function already had.
GRANT EXECUTE ON FUNCTION public.log_block_with_sets(uuid, uuid, uuid, text, text, integer, text, text, text, integer, timestamp with time zone, jsonb, jsonb)
  TO PUBLIC, anon, authenticated, service_role;

-- Adds exercise_rpe (exercise name -> rating) to each log, for coach views
-- and the AI Coach. Same signature, so its grants stay.
CREATE OR REPLACE FUNCTION public.get_warrior_progress(p_warrior_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id uuid;
  v_warrior_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT coach_id, warrior_id INTO v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

  -- auth.uid() IS NULL must be checked explicitly: `NULL != v_coach_id` evaluates
  -- to NULL, and `IF NULL THEN` is falsy in plpgsql, so an unauthenticated/no-JWT
  -- caller would otherwise silently fall through this check instead of failing it.
  IF auth.uid() IS NULL OR (
    auth.uid() != v_coach_id
    AND auth.uid() != v_warrior_id
    AND NOT COALESCE(v_is_admin, false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this warrior''s progress';
  END IF;

  SELECT jsonb_build_object(
    'logs', COALESCE((
      SELECT jsonb_agg(log_row ORDER BY (log_row->>'completed_at')::timestamptz DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', wl.id,
          'block_id', wl.block_id,
          'block_name', pb.name,
          'week_number', pb.week_number,
          'completed_at', wl.completed_at,
          'notes', wl.notes,
          'rating', wl.rating,
          'feel', wl.feel,
          'rpe', wl.rpe,
          'exercise_rpe', (
            SELECT jsonb_object_agg(el.name, e.value::integer)
            FROM jsonb_each_text(wl.exercise_rpe) e
            JOIN public.block_exercises be ON be.id::text = e.key
            JOIN public.exercise_library el ON el.id = be.exercise_id
          ),
          'missed_reason', wl.missed_reason,
          'missed_detail', wl.missed_detail,
          'session_seconds', wl.session_seconds,
          'status', CASE WHEN wl.notes LIKE '[STATUS:MISSED]%' THEN 'missed' ELSE 'completed' END,
          'sets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'set_index', wsl.set_index,
              'reps_completed', wsl.reps_completed,
              'weight_used', wsl.weight_used,
              'hold_seconds', wsl.hold_seconds,
              'exercise_name', el.name
            ) ORDER BY wsl.set_index)
            FROM public.workout_set_logs wsl
            LEFT JOIN public.exercise_library el ON el.id = wsl.exercise_id
            WHERE wsl.workout_log_id = wl.id
          ), '[]'::jsonb)
        ) AS log_row
        FROM public.workout_logs wl
        LEFT JOIN public.program_blocks pb ON pb.id = wl.block_id
        WHERE wl.warrior_program_id = p_warrior_program_id
      ) logs_sub
    ), '[]'::jsonb),
    'weekly_completion', COALESCE((
      SELECT jsonb_agg(week_row ORDER BY (week_row->>'week_start'))
      FROM (
        SELECT jsonb_build_object(
          'week_start', date_trunc('week', wl.completed_at),
          'total', count(*),
          'completed', count(*) FILTER (WHERE wl.notes NOT LIKE '[STATUS:MISSED]%'),
          'completion_pct', round(
            (count(*) FILTER (WHERE wl.notes NOT LIKE '[STATUS:MISSED]%'))::numeric
              / count(*) * 100
          )
        ) AS week_row
        FROM public.workout_logs wl
        WHERE wl.warrior_program_id = p_warrior_program_id
        GROUP BY date_trunc('week', wl.completed_at)
      ) weeks_sub
    ), '[]'::jsonb),
    'bodyweight_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('logged_at', bw.logged_at, 'weight_kg', bw.weight_kg))
      FROM (
        SELECT logged_at, weight_kg
        FROM public.bodyweight_logs
        WHERE warrior_id = v_warrior_id
        ORDER BY logged_at DESC
        LIMIT 12
      ) bw
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
