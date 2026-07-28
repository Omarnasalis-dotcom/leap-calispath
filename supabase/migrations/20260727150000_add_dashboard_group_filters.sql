-- Tier-group filter (Recruits/Warriors/Legends) for the dashboard's Warrior
-- growth, Weekly activity, Retention curve, and World participation charts
-- — reuses the exact tier-range mapping already hardcoded in
-- admin-web/src/shared/constants.ts and src/lib/weeklyChallenge.ts
-- (group 1 = tiers 0-2, group 2 = tiers 3-5, group 3 = tiers 6-8), now
-- given a single database-side source of truth instead of two duplicated
-- JS copies.
--
-- Adding a parameter changes a function's signature (a new overload, not a
-- replace) and CREATE OR REPLACE can't do it in place — same trap the
-- community-filter leaderboard migrations already hit (see
-- 20260710150000/160000/180000). Each changed function below is DROPped by
-- its old signature first, then recreated with fresh REVOKE/GRANT — the
-- DROP wipes prior grants entirely, unlike a same-signature CREATE OR
-- REPLACE, which preserves them.

-- 1. Shared tier-range mapping. Pure computation, no table access, so no
--    admin gating or grant changes needed — safe for anyone to call.
CREATE OR REPLACE FUNCTION public.tier_in_group(p_tier integer, p_group_id integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_group_id IS NULL
    OR (p_group_id = 1 AND p_tier BETWEEN 0 AND 2)
    OR (p_group_id = 2 AND p_tier BETWEEN 3 AND 5)
    OR (p_group_id = 3 AND p_tier BETWEEN 6 AND 8);
$$;

-- 2. admin_get_dashboard_trends: add p_group_id.
DROP FUNCTION IF EXISTS public.admin_get_dashboard_trends(integer);

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_trends(p_weeks_back integer DEFAULT 8, p_group_id integer DEFAULT NULL)
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
        AND public.tier_in_group(p.strength_tier, p_group_id)
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
      ) t
      JOIN profiles p2 ON p2.id = t.uid
      WHERE t.uid IS NOT NULL
        AND public.tier_in_group(p2.strength_tier, p_group_id)
    ) AS active_warriors
  FROM (
    SELECT (v_week_start - (n * 7))::date AS week_start
    FROM generate_series(0, v_weeks_back - 1) AS n
  ) bucket
  ORDER BY bucket.week_start ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_trends(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_trends(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_trends(integer, integer) TO authenticated;

-- 3. admin_get_retention_curve: add p_group_id.
DROP FUNCTION IF EXISTS public.admin_get_retention_curve(integer);

CREATE OR REPLACE FUNCTION public.admin_get_retention_curve(p_weeks integer DEFAULT 8, p_group_id integer DEFAULT NULL)
RETURNS TABLE(weeks_since_signup integer, eligible_users bigint, active_users bigint, retention_pct numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := current_date - ((extract(dow FROM current_date)::int + 1) % 7);
  v_weeks integer := greatest(coalesce(p_weeks, 8), 1);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH users_with_signup_week AS (
    SELECT
      p.id,
      (u.created_at::date - ((extract(dow FROM u.created_at)::int + 1) % 7)) AS signup_week
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE public.tier_in_group(p.strength_tier, p_group_id)
  ),
  user_offsets AS (
    SELECT
      uw.id AS user_id,
      off.n AS offset_weeks,
      uw.signup_week + (off.n * 7) AS target_week
    FROM users_with_signup_week uw
    CROSS JOIN generate_series(0, v_weeks - 1) AS off(n)
    WHERE uw.signup_week + (off.n * 7) <= v_week_start
  ),
  user_offset_activity AS (
    SELECT
      uo.offset_weeks,
      EXISTS (
        SELECT 1 FROM (
          SELECT warrior_id AS uid FROM workout_logs WHERE completed_at >= uo.target_week AND completed_at < uo.target_week + 7
          UNION SELECT user_id FROM weekly_entries WHERE submitted_at >= uo.target_week AND submitted_at < uo.target_week + 7
          UNION SELECT user_id FROM one_min_max_logs WHERE created_at >= uo.target_week AND created_at < uo.target_week + 7
          UNION SELECT user_id FROM static_holds WHERE created_at >= uo.target_week AND created_at < uo.target_week + 7
          UNION SELECT user_id FROM trial_history WHERE attempted_at >= uo.target_week AND attempted_at < uo.target_week + 7
          UNION SELECT user_id FROM power_assessments WHERE assessed_at >= uo.target_week AND assessed_at < uo.target_week + 7
        ) t WHERE t.uid = uo.user_id
      ) AS is_active
    FROM user_offsets uo
  )
  SELECT
    offset_weeks,
    count(*) AS eligible_users,
    count(*) FILTER (WHERE is_active) AS active_users,
    round(100.0 * count(*) FILTER (WHERE is_active) / nullif(count(*), 0), 1) AS retention_pct
  FROM user_offset_activity
  GROUP BY offset_weeks
  ORDER BY offset_weeks ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_retention_curve(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_retention_curve(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_retention_curve(integer, integer) TO authenticated;

-- 4. New: world_participation extracted out of admin_get_dashboard_overview
--    into its own filterable RPC (that function is fetched on every route
--    today and isn't a good home for a per-chart filter parameter).
CREATE OR REPLACE FUNCTION public.admin_get_world_participation(p_group_id integer DEFAULT NULL)
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

  RETURN jsonb_build_object(
    'strength', (
      SELECT count(DISTINCT th.user_id) FROM trial_history th
      JOIN profiles p ON p.id = th.user_id
      WHERE public.tier_in_group(p.strength_tier, p_group_id)
    ),
    'power', (
      SELECT count(DISTINCT pa.user_id) FROM power_assessments pa
      JOIN profiles p ON p.id = pa.user_id
      WHERE public.tier_in_group(p.strength_tier, p_group_id)
    ),
    'static', (
      SELECT count(DISTINCT sh.user_id) FROM static_holds sh
      JOIN profiles p ON p.id = sh.user_id
      WHERE public.tier_in_group(p.strength_tier, p_group_id)
    ),
    'one_mm', (
      SELECT count(DISTINCT ol.user_id) FROM one_min_max_logs ol
      JOIN profiles p ON p.id = ol.user_id
      WHERE public.tier_in_group(p.strength_tier, p_group_id)
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_world_participation(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_world_participation(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_world_participation(integer) TO authenticated;

-- 5. admin_get_dashboard_overview: drop world_participation now that it
--    lives in its own RPC. Same signature (no params before, none now) —
--    CREATE OR REPLACE preserves existing grants, no DROP/REVOKE/GRANT
--    needed.
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
