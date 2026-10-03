-- Skill holds "All" view: each week also carries how many holds (sets)
-- were done, for the week's total time + sets across every hold movement.
-- Otherwise identical to 20261003100000.

CREATE OR REPLACE FUNCTION public._hold_stats_for(p_user_id uuid)
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
           sl.hold_seconds AS secs,
           COALESCE(sl.source IN ('planned', 'planned_backfill'), false) AS assumed
    FROM workout_set_logs sl
    JOIN workout_logs wl ON wl.id = sl.workout_log_id
    JOIN program_blocks pb ON pb.id = wl.block_id
    JOIN exercise_library el ON el.id = sl.exercise_id
    WHERE wl.warrior_id = p_user_id
      AND wl.warrior_program_id IS NOT NULL
      AND sl.hold_seconds > 0
      AND el.movement_family IN ('front_lever', 'handstand', 'planche', 'back_lever')
  ),
  by_week AS (
    SELECT family, program_id, week,
           sum(secs) AS seconds,
           count(*) AS sets,
           COALESCE(sum(secs) FILTER (WHERE assumed), 0) AS assumed,
           COALESCE(max(secs) FILTER (WHERE NOT assumed), 0) AS longest
    FROM sets GROUP BY family, program_id, week
  ),
  longest_var AS (
    SELECT DISTINCT ON (family, program_id, week) family, program_id, week, variation
    FROM sets WHERE NOT assumed
    ORDER BY family, program_id, week, secs DESC
  ),
  by_avar AS (
    SELECT family, program_id, week, jsonb_object_agg(variation, secs) AS assumed_variations
    FROM (
      SELECT family, program_id, week, variation, sum(secs) AS secs
      FROM sets WHERE assumed
      GROUP BY family, program_id, week, variation
    ) v
    GROUP BY family, program_id, week
  ),
  by_var AS (
    SELECT family, program_id, week, jsonb_object_agg(variation, secs) AS variations
    FROM (
      SELECT family, program_id, week, variation, sum(secs) AS secs
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
             'seconds', w.seconds,
             'sets', w.sets,
             'assumed', w.assumed,
             'longest', w.longest,
             'longest_variation', lv.variation,
             'variations', COALESCE(v.variations, '{}'::jsonb),
             'assumed_variations', COALESCE(av.assumed_variations, '{}'::jsonb)
           ) ORDER BY w.program_id, w.week) AS weeks
    FROM by_week w
    LEFT JOIN by_var v USING (family, program_id, week)
    LEFT JOIN by_avar av USING (family, program_id, week)
    LEFT JOIN longest_var lv USING (family, program_id, week)
    GROUP BY w.family
  ) f;
$function$;

REVOKE EXECUTE ON FUNCTION public._hold_stats_for(uuid) FROM PUBLIC, anon, authenticated;
