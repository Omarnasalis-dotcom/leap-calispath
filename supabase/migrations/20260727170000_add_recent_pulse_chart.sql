-- Replaces the single "Active last 24h" stat card with a proper 3-column
-- chart (New warriors / Active warriors / Workouts logged) that can toggle
-- between a 24h and 48h lookback window.

-- 1. Remove active_last_24h from admin_get_dashboard_overview — superseded
--    by admin_get_recent_pulse below. Same signature, grants preserved.
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Most recent Saturday, matching ChallengeService.getCurrentWeekStart():
  -- dow is 0 (Sun) .. 6 (Sat), so daysBack = (dow + 1) % 7.
  v_week_start date := current_date - ((extract(dow FROM current_date)::int + 1) % 7);
  v_next_week_start date;
  v_last_week_start date;
  v_active_this_week bigint;
  v_active_last_week bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  v_next_week_start := v_week_start + 7;
  v_last_week_start := v_week_start - 7;

  SELECT count(DISTINCT t.uid) INTO v_active_this_week FROM (
    SELECT warrior_id AS uid FROM workout_logs WHERE completed_at >= v_week_start
    UNION SELECT user_id FROM weekly_entries WHERE submitted_at >= v_week_start
    UNION SELECT user_id FROM one_min_max_logs WHERE created_at >= v_week_start
    UNION SELECT user_id FROM static_holds WHERE created_at >= v_week_start
    UNION SELECT user_id FROM trial_history WHERE attempted_at >= v_week_start
    UNION SELECT user_id FROM power_assessments WHERE assessed_at >= v_week_start
  ) t WHERE t.uid IS NOT NULL;

  SELECT count(DISTINCT t.uid) INTO v_active_last_week FROM (
    SELECT warrior_id AS uid FROM workout_logs WHERE completed_at >= v_last_week_start AND completed_at < v_week_start
    UNION SELECT user_id FROM weekly_entries WHERE submitted_at >= v_last_week_start AND submitted_at < v_week_start
    UNION SELECT user_id FROM one_min_max_logs WHERE created_at >= v_last_week_start AND created_at < v_week_start
    UNION SELECT user_id FROM static_holds WHERE created_at >= v_last_week_start AND created_at < v_week_start
    UNION SELECT user_id FROM trial_history WHERE attempted_at >= v_last_week_start AND attempted_at < v_week_start
    UNION SELECT user_id FROM power_assessments WHERE assessed_at >= v_last_week_start AND assessed_at < v_week_start
  ) t WHERE t.uid IS NOT NULL;

  RETURN jsonb_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'total_users_delta', (
      SELECT count(*) FROM profiles p JOIN auth.users u ON u.id = p.id
      WHERE u.created_at >= v_week_start
    ),
    'assessed_users', (SELECT count(*) FROM profiles WHERE assessed_at IS NOT NULL),
    'coaches', (SELECT count(*) FROM profiles WHERE is_coach = true),
    'admins', (SELECT count(*) FROM profiles WHERE is_admin = true),
    'active_this_week', v_active_this_week,
    'active_this_week_delta', v_active_this_week - v_active_last_week,
    'workouts_this_week', (
      SELECT count(*) FROM workout_logs WHERE completed_at >= v_week_start
    ),
    'community_count', (SELECT count(*) FROM communities),
    'week_start', v_week_start,
    'next_week_start', v_next_week_start,
    'this_week_challenge_groups', (
      SELECT coalesce(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
      FROM weekly_challenges WHERE week_start = v_week_start
    ),
    'next_week_challenge_groups', (
      SELECT coalesce(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
      FROM weekly_challenges WHERE week_start = v_next_week_start
    )
  );
END;
$function$;

-- 2. New: recent pulse, a rolling N-hour snapshot (24h or 48h from the
--    UI). new_warriors mirrors total_users_delta's join but with an hourly
--    cutoff; active_warriors is the same 6-table union used everywhere
--    else on this dashboard, just with an hourly instead of weekly
--    boundary; workouts_logged is a raw row count (volume), matching
--    workouts_this_week's fix in 20260727110000.
CREATE OR REPLACE FUNCTION public.admin_get_recent_pulse(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(hours => greatest(coalesce(p_hours, 24), 1));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'new_warriors', (
      SELECT count(*) FROM profiles p JOIN auth.users u ON u.id = p.id
      WHERE u.created_at >= v_since
    ),
    'active_warriors', (
      SELECT count(DISTINCT t.uid) FROM (
        SELECT warrior_id AS uid FROM workout_logs WHERE completed_at >= v_since
        UNION SELECT user_id FROM weekly_entries WHERE submitted_at >= v_since
        UNION SELECT user_id FROM one_min_max_logs WHERE created_at >= v_since
        UNION SELECT user_id FROM static_holds WHERE created_at >= v_since
        UNION SELECT user_id FROM trial_history WHERE attempted_at >= v_since
        UNION SELECT user_id FROM power_assessments WHERE assessed_at >= v_since
      ) t WHERE t.uid IS NOT NULL
    ),
    'workouts_logged', (
      SELECT count(*) FROM workout_logs WHERE completed_at >= v_since
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_recent_pulse(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_recent_pulse(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_recent_pulse(integer) TO authenticated;
