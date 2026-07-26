-- Admin dashboard charts support: extends two existing admin RPCs with the
-- week-over-week deltas and coach-engagement percentage the new dashboard
-- charts need, and adds one new trend RPC for the 8-week growth/activity
-- history. Same checklist as 20260719120300_add_admin_read_rpcs.sql:
--   1. SECURITY DEFINER + SET search_path TO 'public'
--   2. First statement is the is_admin() rejection — before any query runs
--   3. GRANT EXECUTE to authenticated, REVOKE from anon/PUBLIC
--   4. Negative-tested: a non-admin JWT must get an error, never data
--
-- admin_get_dashboard_overview and admin_get_coaching_analytics keep their
-- existing signatures (CREATE OR REPLACE preserves prior grants), so only
-- admin_get_dashboard_trends — a genuinely new function — needs a fresh
-- REVOKE/GRANT block below.

-- 1. Dashboard overview: add total_users_delta (signups since this week's
--    Saturday), active_this_week_delta (vs. the prior 7-day window), and
--    workouts_this_week (distinct warriors with a workout_logs row this
--    week — replaces pending_invite_requests now that invite codes are
--    optional at signup and that stat has stopped being a useful signal).
--    workouts_this_week intentionally does NOT filter '[STATUS:MISSED]%'
--    notes — matches this function's own active_this_week and
--    admin_get_coaching_analytics's active_warriors_last_7_days, both of
--    which count workout_logs rows unfiltered by missed-status; only the
--    adherence-specific admin_get_client_adherence splits completed/missed.
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
      SELECT count(DISTINCT warrior_id) FROM workout_logs WHERE completed_at >= v_week_start
    ),
    'world_participation', jsonb_build_object(
      'strength', (SELECT count(DISTINCT user_id) FROM trial_history),
      'power', (SELECT count(*) FROM profiles WHERE power_assessed_at IS NOT NULL),
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

-- 2. Coaching analytics: add active_clients_this_week per coach (distinct
--    warriors with a workout_logs row, this week, under that coach's active
--    assignments) alongside the existing active_clients total. Joins on
--    warrior_program_id, matching admin_get_client_adherence's join shape —
--    scopes to workouts logged under that specific active assignment, not
--    just any workout ever logged by a warrior who happens to be assigned
--    to this coach. Purely additive; existing fields/ordering unchanged.
CREATE OR REPLACE FUNCTION public.admin_get_coaching_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := current_date - ((extract(dow FROM current_date)::int + 1) % 7);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'templates', jsonb_build_object(
      'total', (SELECT count(*) FROM program_templates),
      'library_count', (SELECT count(*) FROM program_templates WHERE is_library_template = true),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(coalesce(s.status, 'unknown'), s.n), '{}'::jsonb)
        FROM (SELECT status, count(*) AS n FROM program_templates GROUP BY status) s
      )
    ),
    'assignments', jsonb_build_object(
      'total', (SELECT count(*) FROM warrior_programs),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(coalesce(s.status, 'unknown'), s.n), '{}'::jsonb)
        FROM (SELECT status, count(*) AS n FROM warrior_programs GROUP BY status) s
      )
    ),
    'workout_logs', jsonb_build_object(
      'total', (SELECT count(*) FROM workout_logs),
      'last_7_days', (SELECT count(*) FROM workout_logs WHERE completed_at >= now() - interval '7 days'),
      'last_28_days', (SELECT count(*) FROM workout_logs WHERE completed_at >= now() - interval '28 days'),
      'active_warriors_last_7_days', (
        SELECT count(DISTINCT warrior_id) FROM workout_logs
        WHERE completed_at >= now() - interval '7 days'
      )
    ),
    'coach_leaderboard', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.active_clients DESC, x.templates DESC), '[]'::jsonb)
      FROM (
        SELECT p.id AS coach_id, p.display_name,
               (SELECT count(DISTINCT wp.warrior_id) FROM warrior_programs wp
                WHERE wp.coach_id = p.id AND wp.status = 'active') AS active_clients,
               (SELECT count(DISTINCT wp2.warrior_id) FROM warrior_programs wp2
                JOIN workout_logs wl ON wl.warrior_program_id = wp2.id
                WHERE wp2.coach_id = p.id AND wp2.status = 'active'
                  AND wl.completed_at >= v_week_start) AS active_clients_this_week,
               (SELECT count(*) FROM program_templates pt WHERE pt.coach_id = p.id) AS templates,
               (SELECT count(*) FROM program_templates pt
                WHERE pt.coach_id = p.id AND pt.status = 'published') AS published_templates
        FROM profiles p
        WHERE p.is_coach = true OR p.is_admin = true
        LIMIT 100
      ) x
    )
  );
END;
$function$;

-- 3. New: weekly warrior-growth + active-warrior trend, for the dashboard's
--    line and bar charts. Deliberately NOT folded into
--    admin_get_dashboard_overview — that function is fetched on every route
--    (AppShell's challenge-gap banner), so bloating it with a weekly time
--    series only the Dashboard page needs would cost every page navigation.
--    One row per week, oldest first; the weekly-activity chart (6 weeks)
--    just slices the last 6 rows off this same 8-week result client-side.
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_trends(p_weeks_back integer DEFAULT 8)
RETURNS TABLE(week_start date, cumulative_warriors bigint, active_warriors bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := current_date - ((extract(dow FROM current_date)::int + 1) % 7);
  v_weeks_back integer := greatest(coalesce(p_weeks_back, 8), 1);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    bucket.week_start,
    (
      SELECT count(*) FROM profiles p JOIN auth.users u ON u.id = p.id
      WHERE u.created_at <= bucket.week_start
    ) AS cumulative_warriors,
    (
      SELECT count(DISTINCT t.uid) FROM (
        SELECT warrior_id AS uid FROM workout_logs
          WHERE completed_at >= bucket.week_start AND completed_at < bucket.week_start + 7
        UNION SELECT user_id FROM weekly_entries
          WHERE submitted_at >= bucket.week_start AND submitted_at < bucket.week_start + 7
        UNION SELECT user_id FROM one_min_max_logs
          WHERE created_at >= bucket.week_start AND created_at < bucket.week_start + 7
        UNION SELECT user_id FROM static_holds
          WHERE created_at >= bucket.week_start AND created_at < bucket.week_start + 7
        UNION SELECT user_id FROM trial_history
          WHERE attempted_at >= bucket.week_start AND attempted_at < bucket.week_start + 7
        UNION SELECT user_id FROM power_assessments
          WHERE assessed_at >= bucket.week_start AND assessed_at < bucket.week_start + 7
      ) t WHERE t.uid IS NOT NULL
    ) AS active_warriors
  FROM (
    SELECT (v_week_start - (n * 7))::date AS week_start
    FROM generate_series(0, v_weeks_back - 1) AS n
  ) bucket
  ORDER BY bucket.week_start ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_trends(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_trends(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_trends(integer) TO authenticated;
