-- World points: the results behind each world's score, for the admin panel's
-- World points tiles. Mirrors how _performance_for sums the score:
--   static  best hold (max points) per category  → movement + seconds
--   onemm   best set (max points) per pattern     → movement + reps
--             (excluded_from_pb rows don't count)
--   power   best 1RM per lift (kg)
-- Movement ids are returned as-is (e.g. 'tuck_front_lever'); the panel
-- formats them.

CREATE OR REPLACE FUNCTION public._world_bests_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'static', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'category', q.category, 'movement', q.movement_id,
               'seconds', q.hold_seconds, 'points', q.points, 'at', q.logged_at
             ) ORDER BY q.points DESC), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (sm.category) sm.category, sh.movement_id, sh.hold_seconds, sh.points, sh.logged_at
        FROM static_holds sh
        JOIN static_movements sm ON sm.id = sh.movement_id
        WHERE sh.user_id = p_user_id AND sm.category IS NOT NULL
        ORDER BY sm.category, sh.points DESC, sh.logged_at DESC
      ) q
    ),
    'onemm', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'category', q.pattern_id, 'movement', q.movement_id,
               'reps', q.reps, 'points', q.points, 'at', q.created_at
             ) ORDER BY q.points DESC), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (om.pattern_id) om.pattern_id, l.movement_id, l.reps, l.points, l.created_at
        FROM one_min_max_logs l
        JOIN onemm_movements om ON om.id = l.movement_id
        WHERE l.user_id = p_user_id AND NOT l.excluded_from_pb
        ORDER BY om.pattern_id, l.points DESC, l.created_at DESC
      ) q
    ),
    'power', (
      SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
               'pullup', max(pullup_1rm), 'dip', max(dip_1rm),
               'squat', max(squat_1rm), 'muscleup', max(muscleup_1rm),
               'at', max(created_at)) END
      FROM power_assessment_log
      WHERE user_id = p_user_id
    )
  );
$function$;

REVOKE EXECUTE ON FUNCTION public._world_bests_for(uuid) FROM PUBLIC, anon, authenticated;

-- Both readers now also return 'world_bests'.
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
           'holds', public._hold_stats_for(p_user_id),
           'world_bests', public._world_bests_for(p_user_id));
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
           'holds', public._hold_stats_for(v_uid),
           'world_bests', public._world_bests_for(v_uid));
END;
$function$;
