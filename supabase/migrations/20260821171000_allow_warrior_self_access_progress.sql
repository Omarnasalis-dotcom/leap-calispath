-- get_warrior_progress previously only allowed the coach (or an admin) to
-- read a warrior's own logged progress — a warrior could never call this
-- to see their own data. Needed now so the AI Coach can read a user's
-- workout logs on their own behalf (auth.uid() = the warrior themselves,
-- not a coach), but this is a general-purpose fix independent of that
-- feature: self-access to your own data is a reasonable default regardless.
-- Everything else is unchanged from 20260702120000.
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
            LEFT JOIN public.block_exercises be ON be.id = wsl.block_exercise_id
            LEFT JOIN public.exercise_library el ON el.id = be.exercise_id
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
