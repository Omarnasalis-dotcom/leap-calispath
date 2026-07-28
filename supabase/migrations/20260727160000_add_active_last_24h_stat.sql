-- Adds active_last_24h to admin_get_dashboard_overview for a new "Active
-- last 24h" stat card, alongside the existing "Active this week" — same
-- 6-table activity union, just a rolling 24h lookback from now() instead
-- of the Saturday-anchored week boundary. Same signature — CREATE OR
-- REPLACE preserves the existing grants, no REVOKE/GRANT block needed.
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
    'active_last_24h', (
      SELECT count(DISTINCT t.uid) FROM (
        SELECT warrior_id AS uid FROM workout_logs WHERE completed_at >= now() - interval '24 hours'
        UNION SELECT user_id FROM weekly_entries WHERE submitted_at >= now() - interval '24 hours'
        UNION SELECT user_id FROM one_min_max_logs WHERE created_at >= now() - interval '24 hours'
        UNION SELECT user_id FROM static_holds WHERE created_at >= now() - interval '24 hours'
        UNION SELECT user_id FROM trial_history WHERE attempted_at >= now() - interval '24 hours'
        UNION SELECT user_id FROM power_assessments WHERE assessed_at >= now() - interval '24 hours'
      ) t WHERE t.uid IS NOT NULL
    ),
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
