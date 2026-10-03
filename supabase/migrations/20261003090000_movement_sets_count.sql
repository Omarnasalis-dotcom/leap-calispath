-- Main movements "All" view: each week now also carries how many sets were
-- done (sets) and how many of them were filled from the plan
-- (assumed_sets), so the panel can show total reps + sets for a week across
-- every movement. Otherwise identical to 20261003080000.

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
           sl.reps_completed AS reps,
           COALESCE(sl.source IN ('planned', 'planned_backfill'), false) AS assumed
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
  by_week AS (
    SELECT family, program_id, week,
           sum(reps) AS reps,
           count(*) AS sets,
           count(*) FILTER (WHERE assumed) AS assumed_sets,
           COALESCE(sum(reps) FILTER (WHERE assumed), 0) AS assumed,
           COALESCE(max(reps) FILTER (WHERE NOT assumed), 0) AS best
    FROM sets GROUP BY family, program_id, week
  ),
  by_var AS (
    SELECT family, program_id, week, jsonb_object_agg(variation, reps) AS variations
    FROM (
      SELECT family, program_id, week, variation, sum(reps) AS reps
      FROM sets WHERE NOT assumed
      GROUP BY family, program_id, week, variation
    ) v
    GROUP BY family, program_id, week
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('family', f.family, 'weeks', f.weeks)), '[]'::jsonb)
  FROM (
    SELECT w.family,
           jsonb_agg(jsonb_build_object(
             'program_id', w.program_id,
             'week', w.week,
             'reps', w.reps,
             'sets', w.sets,
             'assumed_sets', w.assumed_sets,
             'assumed', w.assumed,
             'best', w.best,
             'variations', COALESCE(v.variations, '{}'::jsonb)
           ) ORDER BY w.program_id, w.week) AS weeks
    FROM by_week w
    LEFT JOIN by_var v USING (family, program_id, week)
    GROUP BY w.family
  ) f;
$function$;

REVOKE EXECUTE ON FUNCTION public._movement_reps_for(uuid) FROM PUBLIC, anon, authenticated;
