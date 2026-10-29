-- Analytics: one definition of training/activity for every admin report,
-- and a faster Growth report (analytics gap check 2026-10-29).
--   1. Views analytics_training / analytics_activity / analytics_store_test_users
--      replace the table lists copied into each report — the copies drifted
--      (new training kinds were missing from the Dashboard). Add a new kind
--      of training to analytics_training and every report picks it up.
--   2. admin_get_growth_analytics reads each table once, only from the dates
--      it needs, instead of re-scanning everything per user and per day
--      (~1 s for 90 days at 700 users and growing toward the 8 s timeout).
--   3. Dashboard reports (overview, trends, retention) use the shared
--      training: admins, missed workouts and abandoned trials are left out,
--      and strength steps, hold attempts, Team, Live, Arena and the Power log
--      count. Their Saturday weeks are unchanged (Weekly Challenge weeks).
--   4. The Offers report leaves out store test (sandbox) purchases too.
--   5. Growth lists every store subscriber ever (username, plan, dates,
--      paying now); Key events "Subscribed" is counted from that list.

-- ---------------------------------------------------------------------------
-- Shared sources. Read only by SECURITY DEFINER admin functions; views run
-- with their owner's rights, so clients get no access at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.analytics_training AS
  SELECT 'workouts'::text AS feature, warrior_id AS uid, completed_at AS ts FROM workout_logs
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
  UNION ALL SELECT 'arena', user_id, created_at FROM arena_attempts;

-- Anything a person did: training, abandoned trials, the AI Coach,
-- bodyweight logs and any app event (app_opened from 27 Sep 2026).
CREATE OR REPLACE VIEW public.analytics_activity AS
  SELECT uid, ts FROM analytics_training
  UNION ALL SELECT user_id, attempted_at FROM trial_history WHERE NOT COALESCE(completed, false)
  UNION ALL SELECT user_id, created_at FROM ai_coach_requests WHERE user_id IS NOT NULL
  UNION ALL SELECT warrior_id, logged_at FROM bodyweight_logs
  UNION ALL SELECT user_id, created_at FROM app_events;

-- Accounts whose store purchases were tests: the webhook marks them SANDBOX,
-- and before it recorded that, two store events under a day apart give
-- them away (the sandbox renews every few minutes; real renewals are weekly
-- at the shortest).
CREATE OR REPLACE VIEW public.analytics_store_test_users AS
  SELECT user_id FROM app_events
    WHERE event LIKE 'store\_%' AND properties->>'environment' = 'SANDBOX' AND user_id IS NOT NULL
  UNION
  SELECT a.user_id FROM app_events a
    JOIN app_events b ON b.user_id = a.user_id AND b.id <> a.id
     AND b.event LIKE 'store\_%'
     AND b.created_at > a.created_at AND b.created_at < a.created_at + interval '1 day'
    WHERE a.event LIKE 'store\_%' AND a.user_id IS NOT NULL;

REVOKE ALL ON public.analytics_training, public.analytics_activity, public.analytics_store_test_users
  FROM PUBLIC, anon, authenticated;

-- Date-range reads with no leading user/event filter.
CREATE INDEX IF NOT EXISTS app_events_created_at_idx ON public.app_events (created_at);
CREATE INDEX IF NOT EXISTS workout_logs_completed_at_idx ON public.workout_logs (completed_at);

-- ---------------------------------------------------------------------------
-- Growth report: same output as 20261029190000, computed set-wise.
-- ---------------------------------------------------------------------------
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
  -- Earliest activity any part of the report reads: the range (from the
  -- start of its first local day) or the last 30 days for MAU.
  v_from timestamptz := LEAST(v_since, now() - interval '30 days') - interval '1 day';
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH admins AS (
    SELECT id FROM profiles WHERE is_admin
  ),
  test_users AS (
    SELECT user_id FROM analytics_store_test_users
  ),
  act AS MATERIALIZED (
    SELECT uid, ts FROM analytics_activity
    WHERE ts >= v_from AND uid IS NOT NULL AND uid NOT IN (SELECT id FROM admins)
  ),
  trn AS MATERIALIZED (
    SELECT feature, uid, ts FROM analytics_training
    WHERE ts >= v_from AND uid IS NOT NULL AND uid NOT IN (SELECT id FROM admins)
  ),
  -- Live accounts that signed up in the window. Nobody trains before signing
  -- up, so their training all falls inside trn.
  signed AS (
    SELECT p.id, u.created_at,
           p.display_name IS NOT NULL AS has_username,
           p.assessed_at IS NOT NULL AS assessed,
           p.onboarding_completed_at IS NOT NULL AS onboarded
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.created_at >= v_since AND NOT p.is_admin
  ),
  trained AS (
    SELECT DISTINCT uid FROM trn
  ),
  opened AS (
    SELECT DISTINCT user_id AS uid FROM app_events
    WHERE created_at >= v_since AND event IN ('workout_started', 'quick_workout_started', 'trial_started')
  ),
  week2 AS (
    SELECT DISTINCT s.id AS uid FROM signed s
    JOIN act a ON a.uid = s.id
     AND a.ts >= s.created_at + interval '7 days' AND a.ts < s.created_at + interval '14 days'
  ),
  live AS (
    SELECT s.has_username, s.assessed, s.onboarded,
           t.uid IS NOT NULL AS trained,
           o.uid IS NOT NULL AS opened_workout,
           s.created_at <= now() - interval '14 days' AS old_enough,
           w.uid IS NOT NULL AS week2
    FROM signed s
    LEFT JOIN trained t ON t.uid = s.id
    LEFT JOIN opened o ON o.uid = s.id
    LEFT JOIN week2 w ON w.uid = s.id
  ),
  -- Deleted accounts that signed up in the window. Older rows lack the
  -- per-step flags; onboarding implies a username and an assessment. Their
  -- events went with them, so week 2 is approximated by last activity.
  gone AS (
    SELECT COALESCE(d.has_username, d.onboarded, false) AS has_username,
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
  -- Local calendar days in v_tz; today is partial and flagged as such.
  days AS (
    SELECT d::date AS day
    FROM generate_series((v_since AT TIME ZONE v_tz)::date, (now() AT TIME ZONE v_tz)::date, interval '1 day') AS d
  ),
  per_day AS (
    SELECT (ts AT TIME ZONE v_tz)::date AS day, count(DISTINCT uid) AS active_users
    FROM act GROUP BY 1
  ),
  daily AS (
    SELECT dd.day, COALESCE(pd.active_users, 0) AS active_users,
           dd.day = (now() AT TIME ZONE v_tz)::date AS partial
    FROM days dd LEFT JOIN per_day pd ON pd.day = dd.day
  ),
  -- People per feature in the range; `days` = person-days of use.
  -- Bodyweight is left out: most logs are the onboarding entry.
  features AS (
    SELECT feature, count(DISTINCT uid) AS users,
           count(DISTINCT (uid, (ts AT TIME ZONE v_tz)::date)) AS days
    FROM (
      SELECT feature, uid, ts FROM trn
      UNION ALL SELECT 'ai_coach', user_id, created_at FROM ai_coach_requests
        WHERE user_id IS NOT NULL AND created_at >= v_since
      UNION ALL SELECT 'share', user_id, created_at FROM app_events
        WHERE event = 'leaderboard_shared' AND created_at >= v_since
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
      WHERE u.created_at >= v_prev AND NOT p.is_admin
    UNION ALL SELECT signed_up_at FROM deleted_accounts WHERE signed_up_at >= v_prev
  ),
  range_events AS MATERIALIZED (
    SELECT user_id, event FROM app_events
    WHERE created_at >= v_since AND user_id NOT IN (SELECT id FROM admins)
      AND NOT (event IN ('purchase_completed', 'store_purchase', 'store_renewal', 'redeem_code_unlocked')
               AND user_id IN (SELECT user_id FROM test_users))
  ),
  events AS (
    SELECT event, count(*) AS events, count(DISTINCT user_id) AS users
    FROM app_events
    WHERE created_at >= v_since AND user_id NOT IN (SELECT id FROM admins)
    GROUP BY event
  ),
  -- Everyone who ever bought a store subscription (all time; the page
  -- filters by range): purchase events, plus store subscriptions from before
  -- purchase tracking — a profile's store period that isn't a logged
  -- renewal. A period under 2 days is a test or a refund (e.g. the App Store
  -- reviewer's sandbox Pro on 23 Sep 2026). Deleted accounts aren't listed.
  sub_purchases AS (
    SELECT user_id AS uid, created_at AS ts FROM app_events
      WHERE event IN ('purchase_completed', 'store_purchase')
    UNION ALL
    SELECT p.id, p.entitlement_period_start FROM profiles p
      WHERE p.rc_original_transaction_id IS NOT NULL
        AND p.entitlement_source = 'rc_subscription'
        AND p.entitlement_period_start IS NOT NULL
        AND p.access_expires_at > p.entitlement_period_start + interval '2 days'
        AND NOT EXISTS (SELECT 1 FROM app_events r WHERE r.user_id = p.id AND r.event = 'store_renewal'
                          AND abs(extract(epoch FROM r.created_at - p.entitlement_period_start)) < 3600)
  ),
  subs AS (
    SELECT uid, min(ts) AS first_at, max(ts) AS last_at FROM sub_purchases
    WHERE uid IS NOT NULL
      AND uid NOT IN (SELECT id FROM admins)
      AND uid NOT IN (SELECT user_id FROM test_users)
    GROUP BY uid
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'tz', v_tz,
    'headline', jsonb_build_object(
      'signups', (SELECT count(*) FROM signups WHERE created_at >= v_since),
      'prev_signups', (SELECT count(*) FROM signups WHERE created_at < v_since),
      'paying_store', (SELECT count(*) FROM paying WHERE store),
      'paying_other', (SELECT count(*) FROM paying WHERE NOT store),
      'wau', (SELECT count(DISTINCT uid) FROM act WHERE ts >= now() - interval '7 days'),
      'mau', (SELECT count(DISTINCT uid) FROM act WHERE ts >= now() - interval '30 days')
    ),
    'key_events', jsonb_build_object(
      'paywall_viewed', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'paywall_viewed'),
      'paywall_dismissed', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'purchase_cancelled'),
      'subscribed', (SELECT count(*) FROM subs WHERE last_at >= v_since),
      'renewed', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'store_renewal'),
      'code_unlocked', (SELECT count(DISTINCT uid) FROM (
          SELECT user_id AS uid FROM range_events WHERE event = 'redeem_code_unlocked'
          UNION SELECT user_id FROM promo_code_redemptions
            WHERE claimed_at >= v_since AND user_id NOT IN (SELECT id FROM admins)
              AND user_id NOT IN (SELECT user_id FROM test_users)) c),
      'offer_shown', (SELECT count(DISTINCT user_id) FROM range_events WHERE event = 'offer_screen_viewed')
    ),
    'subscribers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'username', p.display_name,
        'plan', p.subscription_tier,
        'first_at', s.first_at,
        'last_at', s.last_at,
        'ends_at', p.access_expires_at,
        'paying', p.rc_original_transaction_id IS NOT NULL
                  AND p.subscription_tier IS NOT NULL AND p.subscription_tier <> 'free'
                  AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
      ) ORDER BY s.last_at DESC), '[]'::jsonb)
      FROM subs s JOIN profiles p ON p.id = s.uid),
    'funnel', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.step_order), '[]'::jsonb) FROM funnel f),
    'daily', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day), '[]'::jsonb) FROM daily d),
    'features', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.users DESC), '[]'::jsonb) FROM features x),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.events DESC), '[]'::jsonb) FROM events e)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dashboard: shared training, admins left out. Signatures unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

  SELECT count(DISTINCT t.uid) FILTER (WHERE t.ts >= v_week_start),
         count(DISTINCT t.uid) FILTER (WHERE t.ts < v_week_start)
    INTO v_active_this_week, v_active_last_week
  FROM analytics_training t
  WHERE t.ts >= v_last_week_start AND t.uid IS NOT NULL
    AND t.uid NOT IN (SELECT id FROM profiles WHERE is_admin);

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
      SELECT count(*) FROM analytics_training
      WHERE feature = 'workouts' AND ts >= v_week_start
        AND uid NOT IN (SELECT id FROM profiles WHERE is_admin)
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

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_trends(p_weeks_back integer DEFAULT 8, p_group_id integer DEFAULT NULL::integer)
 RETURNS TABLE(week_start date, cumulative_warriors bigint, active_warriors bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  WITH buckets AS (
    SELECT (v_week_start - (n * 7))::date AS week_start
    FROM generate_series(0, v_weeks_back - 1) AS n
  ),
  active AS (
    SELECT b.week_start, count(DISTINCT t.uid) AS active_warriors
    FROM analytics_training t
    JOIN profiles p2 ON p2.id = t.uid
    JOIN buckets b ON t.ts >= b.week_start AND t.ts < b.week_start + 7
    WHERE t.ts >= v_week_start - (v_weeks_back - 1) * 7
      AND NOT p2.is_admin
      AND public.tier_in_group(p2.strength_tier, p_group_id)
    GROUP BY b.week_start
  )
  SELECT
    b.week_start,
    (
      SELECT count(*) FROM profiles p JOIN auth.users u ON u.id = p.id
      WHERE u.created_at <= b.week_start
        AND public.tier_in_group(p.strength_tier, p_group_id)
    ) AS cumulative_warriors,
    COALESCE(a.active_warriors, 0)::bigint AS active_warriors
  FROM buckets b
  LEFT JOIN active a ON a.week_start = b.week_start
  ORDER BY b.week_start ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_retention_curve(p_weeks integer DEFAULT 8, p_group_id integer DEFAULT NULL::integer)
 RETURNS TABLE(weeks_since_signup integer, eligible_users bigint, active_users bigint, retention_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    WHERE NOT p.is_admin
      AND public.tier_in_group(p.strength_tier, p_group_id)
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
  -- Each person's training weeks, once, instead of a lookup per offset.
  trained_weeks AS (
    SELECT DISTINCT t.uid, (t.ts::date - ((extract(dow FROM t.ts)::int + 1) % 7)) AS week
    FROM analytics_training t
    WHERE t.uid IN (SELECT id FROM users_with_signup_week)
  ),
  user_offset_activity AS (
    SELECT uo.offset_weeks, tw.uid IS NOT NULL AS is_active
    FROM user_offsets uo
    LEFT JOIN trained_weeks tw ON tw.uid = uo.user_id AND tw.week = uo.target_week
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

-- ---------------------------------------------------------------------------
-- Offers report: store test (sandbox) purchases left out, as in Growth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_offer_analytics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH ev AS (
    SELECT e.user_id, e.event, e.properties, e.platform
    FROM app_events e
    WHERE e.created_at >= v_since
      AND e.user_id NOT IN (SELECT id FROM profiles WHERE is_admin)
      AND NOT (e.event IN ('purchase_completed', 'store_purchase', 'store_renewal', 'redeem_code_unlocked')
               AND e.user_id IN (SELECT user_id FROM analytics_store_test_users))
  ),
  moments AS (
    SELECT m.moment, m.ord,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_screen_viewed' AND properties->>'trigger' = m.moment) AS shown,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_claim_tapped' AND properties->>'trigger' = m.moment) AS claimed,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_code_tapped' AND properties->>'trigger' = m.moment) AS code_tapped,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_dismissed' AND properties->>'trigger' = m.moment) AS dismissed,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'paywall_viewed' AND properties->>'source' = 'welcome_offer_' || m.moment) AS paywall,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'purchase_completed' AND properties->>'source' = 'welcome_offer_' || m.moment) AS bought
    FROM (VALUES ('assessment', 1), ('program_complete', 2), ('banner', 3)) AS m(moment, ord)
  ),
  add_week AS (
    SELECT
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'add_week_locked_tapped') AS tapped,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'paywall_viewed' AND properties->>'source' LIKE 'add_week_%') AS paywall,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'purchase_completed' AND properties->>'source' LIKE 'add_week_%') AS bought
  ),
  -- How it was paid. Google reports a code purchase as INTRO with the Play
  -- offer id in offer_code (ours end in "-code"); Apple reports offer codes
  -- as PROMOTIONAL with the code's name. The intro itself has no code on
  -- iOS and a "-intro" offer id on Android.
  store AS (
    SELECT event,
           CASE
             WHEN properties->>'period_type' = 'PROMOTIONAL'
               OR properties->>'offer_code' LIKE '%-code'
               OR (platform = 'ios' AND COALESCE(properties->>'offer_code', '') <> '') THEN 'CODE'
             WHEN properties->>'period_type' IN ('INTRO', 'TRIAL') THEN properties->>'period_type'
             WHEN properties->>'period_type' = 'NORMAL' THEN 'NORMAL'
             ELSE 'UNKNOWN'
           END AS period_type,
           COALESCE(properties->>'tier', '?') AS tier, platform,
           count(*) AS events, count(DISTINCT user_id) AS users
    FROM ev
    WHERE event IN ('store_purchase', 'store_renewal')
    GROUP BY 1, 2, 3, 4
  ),
  codes AS (
    SELECT COALESCE(properties->>'platform', platform, '?') AS platform,
      count(DISTINCT user_id) FILTER (WHERE event = 'redeem_code_submitted') AS submitted,
      count(DISTINCT user_id) FILTER (WHERE event = 'redeem_code_unlocked') AS unlocked
    FROM ev
    WHERE event IN ('redeem_code_submitted', 'redeem_code_unlocked')
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'moments', (SELECT coalesce(jsonb_agg(to_jsonb(m) - 'ord' ORDER BY m.ord), '[]'::jsonb) FROM moments m),
    'add_week', (SELECT to_jsonb(a) FROM add_week a),
    'store', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.event, s.period_type, s.tier), '[]'::jsonb) FROM store s),
    'codes', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.platform), '[]'::jsonb) FROM codes c)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_offer_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_offer_analytics(integer) TO authenticated, service_role;
