-- Retention curve: of all warriors who have reached N weeks of tenure
-- (signup-week + N <= this week), what % were active in that specific
-- week of their tenure. Unlike admin_get_dashboard_trends (calendar weeks
-- on the x-axis), this buckets by weeks-SINCE-SIGNUP — a genuine cohort
-- retention curve, the thing "total warriors" and "active this week" can't
-- tell you: whether growth is people sticking around, not just signing up.
--
-- May return fewer than p_weeks rows for a young app — an offset nobody
-- has reached yet simply produces no group. The frontend must not assume
-- a fixed row count.
--
-- Follows the same admin RPC checklist as every other function in this
-- file family (is_admin() guard first, SECURITY DEFINER, fresh REVOKE/GRANT
-- since this is a brand-new function).
CREATE OR REPLACE FUNCTION public.admin_get_retention_curve(p_weeks integer DEFAULT 8)
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

REVOKE EXECUTE ON FUNCTION public.admin_get_retention_curve(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_retention_curve(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_retention_curve(integer) TO authenticated;
