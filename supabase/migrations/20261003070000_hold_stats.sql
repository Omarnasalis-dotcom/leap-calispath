-- Skill holds: weekly hold time per hold movement (front lever, handstand,
-- planche, back lever), for the "Skill holds" chart in the admin panel and
-- the app's My progress. Same shape as _movement_reps_for (20261003050000),
-- in seconds:
--   seconds        total hold time (logged + assumed)
--   assumed        the part filled from the plan (sources 'planned' /
--                  'planned_backfill' — a completed block nobody confirmed)
--   longest        longest single *logged* hold
--   longest_variation  the variation it was done in
--   variations     logged seconds per variation
-- by program week (program_blocks.week_number) per program. Hold seconds
-- come from workout_set_logs.hold_seconds: ticked hold sets (set row in hold
-- mode), the log sheet's Hold stepper, and the planned fill.

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
           sl.source IN ('planned', 'planned_backfill') AS assumed
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
           COALESCE(sum(secs) FILTER (WHERE assumed), 0) AS assumed,
           COALESCE(max(secs) FILTER (WHERE NOT assumed), 0) AS longest
    FROM sets GROUP BY family, program_id, week
  ),
  longest_var AS (
    SELECT DISTINCT ON (family, program_id, week) family, program_id, week, variation
    FROM sets WHERE NOT assumed
    ORDER BY family, program_id, week, secs DESC
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
             'assumed', w.assumed,
             'longest', w.longest,
             'longest_variation', lv.variation,
             'variations', COALESCE(v.variations, '{}'::jsonb)
           ) ORDER BY w.program_id, w.week) AS weeks
    FROM by_week w
    LEFT JOIN by_var v USING (family, program_id, week)
    LEFT JOIN longest_var lv USING (family, program_id, week)
    GROUP BY w.family
  ) f;
$function$;

REVOKE EXECUTE ON FUNCTION public._hold_stats_for(uuid) FROM PUBLIC, anon, authenticated;

-- Both readers now also return 'holds'.
CREATE OR REPLACE FUNCTION public.admin_get_user_performance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  RETURN public._performance_for(p_user_id)
      || jsonb_build_object(
           'movements', public._movement_reps_for(p_user_id),
           'holds', public._hold_stats_for(p_user_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_performance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN public._performance_for(v_uid)
      || jsonb_build_object(
           'movements', public._movement_reps_for(v_uid),
           'holds', public._hold_stats_for(v_uid));
END;
$function$;
