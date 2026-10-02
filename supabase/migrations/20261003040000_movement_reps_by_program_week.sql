-- Main movements: group reps by program week (W1, W2, …) instead of
-- calendar week (owner decision, 2026-10-03). A workout counts in the week
-- of the program block it was logged on — program_blocks.week_number — so
-- the chart lines up with "Workouts completed" and a session done late or
-- early still lands in its own program week.
--
-- Output per movement: weeks = [{ program_id, week, reps, best, variations }]
-- across all of the athlete's programs; the client shows the selected
-- program (active by default). Logs whose block no longer exists are left
-- out (no program week to place them in). Otherwise unchanged from
-- 20261003020000.

CREATE OR REPLACE FUNCTION public._movement_reps_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH sets AS (
    SELECT el.movement_family AS family,
           COALESCE(el.movement_variation, '') AS variation,
           wl.warrior_program_id AS program_id,
           COALESCE(pb.week_number, 1) AS week,
           sl.reps_completed AS reps
    FROM workout_set_logs sl
    JOIN workout_logs wl ON wl.id = sl.workout_log_id
    JOIN program_blocks pb ON pb.id = wl.block_id
    JOIN exercise_library el ON el.id = sl.exercise_id
    WHERE wl.warrior_id = p_user_id
      AND wl.warrior_program_id IS NOT NULL
      AND sl.reps_completed > 0
      AND el.movement_family IN ('pull_up', 'inverted_row', 'dip', 'push_up', 'pike_push_up',
                                 'squat', 'pistol_squat', 'deadlift', 'muscle_up',
                                 'handstand_push_up', 'front_lever_press')
  ),
  by_var AS (
    SELECT family, program_id, week, variation, sum(reps) AS reps, max(reps) AS best
    FROM sets GROUP BY family, program_id, week, variation
  ),
  by_week AS (
    SELECT family, program_id, week,
           sum(reps) AS reps,
           max(best) AS best,
           jsonb_object_agg(variation, reps) AS variations
    FROM by_var GROUP BY family, program_id, week
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('family', f.family, 'weeks', f.weeks)), '[]'::jsonb)
  FROM (
    SELECT family,
           jsonb_agg(jsonb_build_object(
             'program_id', program_id,
             'week', week,
             'reps', reps,
             'best', best,
             'variations', variations
           ) ORDER BY program_id, week) AS weeks
    FROM by_week GROUP BY family
  ) f;
$function$;

REVOKE EXECUTE ON FUNCTION public._movement_reps_for(uuid) FROM PUBLIC, anon, authenticated;
