-- Growth page: a "Key events" summary — people in the range who saw the
-- paywall, dismissed it, subscribed, renewed or unlocked a plan with a code.
-- "Subscribed" joins the app's purchase_completed event with the RevenueCat
-- webhook's store_purchase (logged from 29 Oct 2026), so a purchase counts
-- once even when only one of them arrived. Store test purchases are left
-- out: rows the webhook marks environment = SANDBOX, and — for rows logged
-- before it recorded that — accounts with two store events under a day
-- apart (the sandbox renews every few minutes; real renewals are weekly at
-- the shortest).

CREATE OR REPLACE FUNCTION public.admin_get_growth_analytics(
  p_days integer DEFAULT 30,
  p_tz text DEFAULT 'Africa/Cairo'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_tz text := COALESCE((SELECT name FROM pg_timezone_names WHERE name = p_tz), 'Africa/Cairo');
  v_since timestamptz := now() - make_interval(days => v_days);
  v_prev timestamptz := now() - make_interval(days => v_days * 2);
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH admins AS (
    SELECT id FROM profiles WHERE is_admin
  ),
  -- Every finished piece of training, tagged by feature. Missed workouts and
  -- abandoned trials are left out.
  training AS (
    SELECT 'workouts' AS feature, warrior_id AS uid, completed_at AS ts FROM workout_logs
      WHERE warrior_id IS NOT NULL AND COALESCE(notes, '') NOT LIKE '[STATUS:MISSED]%'
    UNION ALL SELECT 'trials', user_id, attempted_at FROM trial_history WHERE completed
    UNION ALL SELECT 'trials', user_id, created_at FROM strength_step_attempts
    UNION ALL SELECT 'static', user_id, logged_at FROM static_holds
    UNION ALL SELECT 'static', user_id, created_at FROM static_hold_attempts
    UNION ALL SELECT 'one_min_max', user_id, created_at FROM one_min_max_logs
    UNION ALL SELECT 'weekly', user_id, submitted_at FROM weekly_entries
    UNION ALL SELECT 'power', user_id, assessed_at FROM power_assessments
    UNION ALL SELECT 'power', user_id, created_at FROM power_assessment_log
    UNION ALL SELECT 'team', user_id, entered_at FROM team_attempt_results WHERE user_id IS NOT NULL
    UNION ALL SELECT 'live', user_id, entered_at FROM live_half_results WHERE user_id IS NOT NULL
    UNION ALL SELECT 'arena', user_id, created_at FROM arena_attempts
  ),
  -- Anything a person did: training, abandoned trials, the AI Coach,
  -- bodyweight logs and any app event (app_opened from 27 Sep 2026).
  activity AS (
    SELECT uid, ts FROM training
    UNION ALL SELECT user_id, attempted_at FROM trial_history WHERE NOT COALESCE(completed, false)
    UNION ALL SELECT user_id, created_at FROM ai_coach_requests WHERE user_id IS NOT NULL
    UNION ALL SELECT warrior_id, logged_at FROM bodyweight_logs
    UNION ALL SELECT user_id, created_at FROM app_events
  ),
  -- Live accounts that signed up in the window, admins excluded.
  live AS (
    SELECT p.id, u.created_at,
           p.display_name IS NOT NULL AS has_username,
           p.assessed_at IS NOT NULL AS assessed,
           p.onboarding_completed_at IS NOT NULL AS onboarded,
           EXISTS (SELECT 1 FROM training t WHERE t.uid = p.id) AS trained,
           EXISTS (SELECT 1 FROM app_events e WHERE e.user_id = p.id
                     AND e.event IN ('workout_started', 'quick_workout_started', 'trial_started')) AS opened_workout,
           u.created_at <= now() - interval '14 days' AS old_enough,
           EXISTS (SELECT 1 FROM activity a WHERE a.uid = p.id
                     AND a.ts >= u.created_at + interval '7 days'
                     AND a.ts <  u.created_at + interval '14 days') AS week2
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.created_at >= v_since
      AND p.id NOT IN (SELECT id FROM admins)
  ),
  -- Deleted accounts that signed up in the window. Older rows lack the
  -- per-step flags; onboarding implies a username and an assessment. Their
  -- events went with them, so week 2 is approximated by last activity.
  gone AS (
    SELECT d.signed_up_at AS created_at,
           COALESCE(d.has_username, d.onboarded, false) AS has_username,
           COALESCE(d.assessed, d.onboarded, false) AS assessed,
           COALESCE(d.onboarded, false) AS onboarded,
           COALESCE(d.trained, COALESCE(d.workouts_logged, 0) > 0) AS trained,
           false AS opened_workout,
           d.signed_up_at <= now() - interval '14 days' AS old_enough,
           COALESCE(d.last_active_at >= d.signed_up_at + interval '7 days', false) AS week2
    FROM deleted_accounts d
    WHERE d.signed_up_at >= v_since
  ),
  cohort AS (
    SELECT has_username, assessed, onboarded, trained, opened_workout OR trained AS opened_workout,
           old_enough, week2, false AS deleted FROM live
    UNION ALL
    SELECT has_username, assessed, onboarded, trained, opened_workout OR trained,
           old_enough, week2, true FROM gone
  ),
  funnel AS (
    SELECT 1 AS step_order, 'signed_up' AS key, 'Signed up' AS step, count(*) AS users, NULL::bigint AS eligible,
           count(*) FILTER (WHERE deleted) AS deleted FROM cohort
    UNION ALL SELECT 2, 'username', 'Chose a username', count(*) FILTER (WHERE has_username), NULL,
           count(*) FILTER (WHERE has_username AND deleted) FROM cohort
    UNION ALL SELECT 3, 'assessed', 'Finished the assessment', count(*) FILTER (WHERE assessed), NULL,
           count(*) FILTER (WHERE assessed AND deleted) FROM cohort
    UNION ALL SELECT 4, 'onboarded', 'Finished onboarding', count(*) FILTER (WHERE onboarded), NULL,
           count(*) FILTER (WHERE onboarded AND deleted) FROM cohort
    UNION ALL SELECT 5, 'opened_workout', 'Opened a workout', count(*) FILTER (WHERE opened_workout), NULL,
           count(*) FILTER (WHERE opened_workout AND deleted) FROM cohort
    UNION ALL SELECT 6, 'trained', 'Finished a first workout', count(*) FILTER (WHERE trained), NULL,
           count(*) FILTER (WHERE trained AND deleted) FROM cohort
    -- Only signups at least 14 days old have had a whole week 2.
    UNION ALL SELECT 7, 'week2', 'Active in week 2',
           count(*) FILTER (WHERE old_enough AND week2),
           count(*) FILTER (WHERE old_enough),
           count(*) FILTER (WHERE old_enough AND week2 AND deleted) FROM cohort
  ),
  real_activity AS (
    SELECT uid, ts FROM activity WHERE uid NOT IN (SELECT id FROM admins)
  ),
  -- Local calendar days in v_tz; today is partial and flagged as such.
  days AS (
    SELECT d::date AS day
    FROM generate_series((v_since AT TIME ZONE v_tz)::date, (now() AT TIME ZONE v_tz)::date, interval '1 day') AS d
  ),
  daily AS (
    SELECT dd.day,
           (SELECT count(DISTINCT a.uid) FROM real_activity a
             WHERE a.ts >= (dd.day::timestamp AT TIME ZONE v_tz)
               AND a.ts <  ((dd.day + 1)::timestamp AT TIME ZONE v_tz)) AS active_users,
           dd.day = (now() AT TIME ZONE v_tz)::date AS partial
    FROM days dd
  ),
  -- People per feature in the range (a feature with nobody is left out).
  -- `days` = person-days of use: workout_logs has a row per logged block,
  -- so raw rows overstate sessions. Bodyweight is left out: most logs are
  -- the onboarding entry.
  features AS (
    SELECT feature, count(DISTINCT uid) AS users,
           count(DISTINCT (uid, (ts AT TIME ZONE v_tz)::date)) AS days
    FROM (
      SELECT feature, uid, ts FROM training
      UNION ALL SELECT 'ai_coach', user_id, created_at FROM ai_coach_requests WHERE user_id IS NOT NULL
      UNION ALL SELECT 'share', user_id, created_at FROM app_events WHERE event = 'leaderboard_shared'
    ) f
    WHERE ts >= v_since AND uid NOT IN (SELECT id FROM admins)
    GROUP BY feature
  ),
  paying AS (
    SELECT rc_original_transaction_id IS NOT NULL AS store
    FROM profiles
    WHERE NOT is_admin
      AND subscription_tier IS NOT NULL AND subscription_tier <> 'free'
      AND (access_expires_at IS NULL OR access_expires_at > now())
  ),
  signups AS (
    SELECT u.created_at FROM profiles p JOIN auth.users u ON u.id = p.id
      WHERE u.created_at >= v_prev AND p.id NOT IN (SELECT id FROM admins)
    UNION ALL SELECT signed_up_at FROM deleted_accounts WHERE signed_up_at >= v_prev
  ),
  events AS (
    SELECT event, count(*) AS events, count(DISTINCT user_id) AS users
    FROM app_events
    WHERE created_at >= v_since AND user_id NOT IN (SELECT id FROM admins)
    GROUP BY event
  ),
  sandbox_users AS (
    SELECT user_id FROM app_events
      WHERE event LIKE 'store\_%' AND properties->>'environment' = 'SANDBOX'
    UNION
    SELECT a.user_id FROM app_events a
      JOIN app_events b ON b.user_id = a.user_id AND b.id <> a.id
       AND b.event LIKE 'store\_%'
       AND b.created_at > a.created_at AND b.created_at < a.created_at + interval '1 day'
      WHERE a.event LIKE 'store\_%'
  ),
  range_events AS (
    SELECT user_id, event FROM app_events
    WHERE created_at >= v_since AND user_id NOT IN (SELECT id FROM admins)
      AND NOT (event IN ('purchase_completed', 'store_purchase', 'store_renewal', 'redeem_code_unlocked')
               AND user_id IN (SELECT user_id FROM sandbox_users WHERE user_id IS NOT NULL))
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'tz', v_tz,
    'headline', jsonb_build_object(
      'signups', (SELECT count(*) FROM signups WHERE created_at >= v_since),
      'prev_signups', (SELECT count(*) FROM signups WHERE created_at < v_since),
      'paying_store', (SELECT count(*) FROM paying WHERE store),
      'paying_other', (SELECT count(*) FROM paying WHERE NOT store),
      'wau', (SELECT count(DISTINCT uid) FROM real_activity WHERE ts >= now() - interval '7 days'),
      'mau', (SELECT count(DISTINCT uid) FROM real_activity WHERE ts >= now() - interval '30 days')
    ),
    'funnel', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.step_order), '[]'::jsonb) FROM funnel f),
    'daily', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day), '[]'::jsonb) FROM daily d),
    'features', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.users DESC), '[]'::jsonb) FROM features x),
    'key_events', jsonb_build_object(
      'paywall_viewed', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'paywall_viewed'),
      'paywall_dismissed', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'purchase_cancelled'),
      'subscribed', (SELECT count(DISTINCT user_id) FROM range_events WHERE event IN ('purchase_completed', 'store_purchase')),
      'renewed', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'store_renewal'),
      'code_unlocked', (SELECT count(DISTINCT uid) FROM (
          SELECT user_id AS uid FROM range_events WHERE event = 'redeem_code_unlocked'
          UNION SELECT user_id FROM promo_code_redemptions
            WHERE claimed_at >= v_since AND user_id NOT IN (SELECT id FROM admins)
              AND user_id NOT IN (SELECT user_id FROM sandbox_users WHERE user_id IS NOT NULL)) c),
      'offer_shown', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'offer_screen_viewed')
    ),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.events DESC), '[]'::jsonb) FROM events e)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer, text) TO authenticated, service_role;
