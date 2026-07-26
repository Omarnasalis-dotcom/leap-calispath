-- Two fixes to admin_get_dashboard_overview:
--
-- 1. workouts_this_week was counting distinct warriors, not total workouts
--    logged — a warrior logging on both day1 and day2 this week showed as
--    "1", not "2". Switches to a plain row count (session volume), matching
--    the stat's label ("Workouts this week"). Still deliberately unfiltered
--    by '[STATUS:MISSED]%' notes, per 20260727100000's reasoning (matches
--    the other "activity" precedents in this function, not the
--    adherence-specific admin_get_client_adherence).
--
-- 2. world_participation.power was reading profiles.power_assessed_at,
--    which is unreliable — prod has 6 power_assessments rows but only 1
--    profile with power_assessed_at set (confirmed via direct query).
--    Reads power_assessments directly instead, the actual source of truth,
--    sidestepping that column entirely for this count regardless of
--    whatever else may or may not keep it in sync.
--
-- Same signature — CREATE OR REPLACE preserves the existing grants
-- (empirically confirmed when this function was first extended), so no
-- REVOKE/GRANT block is needed here.
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
    'world_participation', jsonb_build_object(
      'strength', (SELECT count(DISTINCT user_id) FROM trial_history),
      'power', (SELECT count(DISTINCT user_id) FROM power_assessments),
      'static', (SELECT count(DISTINCT user_id) FROM static_holds),
      'one_mm', (SELECT count(DISTINCT user_id) FROM one_min_max_logs)
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
