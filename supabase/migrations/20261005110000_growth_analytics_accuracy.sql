-- Growth page accuracy fixes (admin-web Growth audit 2026-10-05):
--   1. Deleted accounts no longer vanish from the signup funnel — their
--      anonymous deleted_accounts rows are counted alongside live profiles.
--      The snapshot gains has_username / assessed / trained so new
--      deletions can be placed on every step they reached.
--   2. "First workout" counts every kind of training: workouts, trials,
--      static holds, 1 Min Max, Weekly Challenge, Power assessments.
--   3. Workouts marked missed ('[STATUS:MISSED]') aren't training or activity.
--   4. "Subscribed" = bought in the store AND has paid access right now —
--      not expired/refunded purchases, not manual grants.
--   5. Daily active users are bucketed by local (Cairo) days, not UTC.
--   6. Admin accounts are left out of the funnel and daily actives.

-- ---------------------------------------------------------------------------
-- Snapshot: three more facts per deleted account. NULL on rows recorded
-- before this migration; the funnel falls back to `onboarded` for those
-- (onboarding implies a username and a finished assessment).
-- ---------------------------------------------------------------------------
ALTER TABLE public.deleted_accounts
  ADD COLUMN IF NOT EXISTS has_username boolean,
  ADD COLUMN IF NOT EXISTS assessed boolean,
  ADD COLUMN IF NOT EXISTS trained boolean;

-- The delete-user-account Edge Function spreads this jsonb straight into the
-- deleted_accounts insert, so the new keys are recorded with no function deploy.
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'signed_up_at', u.created_at,
    'plan', CASE
              WHEN p.subscription_tier IS NOT NULL AND p.subscription_tier <> 'free'
                   AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
                THEN p.subscription_tier
              ELSE 'free'
            END,
    'strength_tier', p.strength_tier,
    'onboarded', p.onboarding_completed_at IS NOT NULL,
    'has_username', p.display_name IS NOT NULL,
    'assessed', p.assessed_at IS NOT NULL,
    'trained', EXISTS (SELECT 1 FROM workout_logs w WHERE w.warrior_id = u.id
                         AND COALESCE(w.notes, '') NOT LIKE '[STATUS:MISSED]%')
            OR EXISTS (SELECT 1 FROM trial_history t WHERE t.user_id = u.id)
            OR EXISTS (SELECT 1 FROM static_holds s WHERE s.user_id = u.id)
            OR EXISTS (SELECT 1 FROM one_min_max_logs o WHERE o.user_id = u.id)
            OR EXISTS (SELECT 1 FROM weekly_entries x WHERE x.user_id = u.id)
            OR EXISTS (SELECT 1 FROM power_assessments pa WHERE pa.user_id = u.id),
    'last_active_at', (SELECT max(e.created_at) FROM app_events e WHERE e.user_id = u.id),
    'workouts_logged', (SELECT count(*) FROM workout_logs w
                        WHERE w.warrior_id = u.id
                          AND COALESCE(w.notes, '') NOT LIKE '[STATUS:MISSED]%'),
    'country', p.country
  )
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.account_deletion_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_snapshot(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Growth report. New p_tz param → DROP the old signature first (CREATE OR
-- REPLACE with an extra param would add a second overload, not replace it).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_growth_analytics(integer);

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
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH admins AS (
    SELECT id FROM profiles WHERE is_admin
  ),
  -- Every kind of training, missed workouts excluded.
  training AS (
    SELECT warrior_id AS uid, completed_at AS ts FROM workout_logs
      WHERE warrior_id IS NOT NULL AND COALESCE(notes, '') NOT LIKE '[STATUS:MISSED]%'
    UNION ALL SELECT user_id, attempted_at FROM trial_history
    UNION ALL SELECT user_id, logged_at FROM static_holds
    UNION ALL SELECT user_id, created_at FROM one_min_max_logs
    UNION ALL SELECT user_id, submitted_at FROM weekly_entries
    UNION ALL SELECT user_id, assessed_at FROM power_assessments
  ),
  activity AS (
    SELECT uid, ts FROM training
    UNION ALL SELECT user_id, created_at FROM ai_coach_requests WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM app_events
  ),
  -- Live accounts that signed up in the window, admins excluded.
  live AS (
    SELECT p.id, u.created_at,
           p.display_name IS NOT NULL AS has_username,
           p.assessed_at IS NOT NULL AS assessed,
           p.onboarding_completed_at IS NOT NULL AS onboarded,
           EXISTS (SELECT 1 FROM training t WHERE t.uid = p.id) AS trained,
           u.created_at <= now() - interval '7 days' AS old_enough,
           (EXISTS (SELECT 1 FROM activity a WHERE a.uid = p.id AND a.ts >= u.created_at + interval '7 days')
            OR EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = p.id
                       AND GREATEST(COALESCE(s.refreshed_at, s.created_at), s.updated_at) >= u.created_at + interval '7 days'))
             AS came_back,
           EXISTS (SELECT 1 FROM app_events e WHERE e.user_id = p.id AND e.event = 'paywall_viewed') AS saw_paywall,
           (p.rc_original_transaction_id IS NOT NULL
            AND p.subscription_tier IS NOT NULL AND p.subscription_tier <> 'free'
            AND (p.access_expires_at IS NULL OR p.access_expires_at > now())) AS subscribed
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.created_at >= v_since
      AND p.id NOT IN (SELECT id FROM admins)
  ),
  -- Deleted accounts that signed up in the window. Older rows lack the
  -- per-step flags; onboarding implies a username and an assessment.
  gone AS (
    SELECT d.signed_up_at AS created_at,
           COALESCE(d.has_username, d.onboarded, false) AS has_username,
           COALESCE(d.assessed, d.onboarded, false) AS assessed,
           COALESCE(d.onboarded, false) AS onboarded,
           COALESCE(d.trained, COALESCE(d.workouts_logged, 0) > 0) AS trained,
           d.signed_up_at <= now() - interval '7 days' AS old_enough,
           COALESCE(d.last_active_at >= d.signed_up_at + interval '7 days', false) AS came_back,
           false AS saw_paywall,  -- their events were deleted with them
           false AS subscribed
    FROM deleted_accounts d
    WHERE d.signed_up_at >= v_since
  ),
  cohort AS (
    SELECT created_at, has_username, assessed, onboarded, trained, old_enough, came_back, saw_paywall, subscribed, false AS deleted FROM live
    UNION ALL
    SELECT created_at, has_username, assessed, onboarded, trained, old_enough, came_back, saw_paywall, subscribed, true FROM gone
  ),
  funnel AS (
    SELECT 1 AS step_order, 'Signed up' AS step, count(*) AS users, NULL::bigint AS eligible,
           count(*) FILTER (WHERE deleted) AS deleted FROM cohort
    UNION ALL SELECT 2, 'Chose a username', count(*) FILTER (WHERE has_username), NULL, count(*) FILTER (WHERE has_username AND deleted) FROM cohort
    UNION ALL SELECT 3, 'Finished assessment', count(*) FILTER (WHERE assessed), NULL, count(*) FILTER (WHERE assessed AND deleted) FROM cohort
    UNION ALL SELECT 4, 'Finished onboarding', count(*) FILTER (WHERE onboarded), NULL, count(*) FILTER (WHERE onboarded AND deleted) FROM cohort
    UNION ALL SELECT 5, 'First training', count(*) FILTER (WHERE trained), NULL, count(*) FILTER (WHERE trained AND deleted) FROM cohort
    -- Only users who signed up at least 7 days ago can have come back after day 7.
    UNION ALL SELECT 6, 'Came back after day 7',
      count(*) FILTER (WHERE old_enough AND came_back),
      count(*) FILTER (WHERE old_enough),
      count(*) FILTER (WHERE old_enough AND came_back AND deleted) FROM cohort
    UNION ALL SELECT 7, 'Saw the paywall', count(*) FILTER (WHERE saw_paywall), NULL, 0 FROM cohort
    UNION ALL SELECT 8, 'Subscribed', count(*) FILTER (WHERE subscribed), NULL, 0 FROM cohort
  ),
  -- Local calendar days in v_tz; today is partial and flagged as such.
  days AS (
    SELECT d::date AS day
    FROM generate_series((v_since AT TIME ZONE v_tz)::date, (now() AT TIME ZONE v_tz)::date, interval '1 day') AS d
  ),
  daily AS (
    SELECT dd.day,
           (SELECT count(DISTINCT a.uid) FROM activity a
             WHERE a.uid NOT IN (SELECT id FROM admins)
               AND a.ts >= (dd.day::timestamp AT TIME ZONE v_tz)
               AND a.ts <  ((dd.day + 1)::timestamp AT TIME ZONE v_tz)) AS active_users,
           dd.day = (now() AT TIME ZONE v_tz)::date AS partial
    FROM days dd
  ),
  events AS (
    SELECT event, count(*) AS events, count(DISTINCT user_id) AS users
    FROM app_events
    WHERE created_at >= v_since AND user_id NOT IN (SELECT id FROM admins)
    GROUP BY event
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'tz', v_tz,
    'funnel', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.step_order), '[]'::jsonb) FROM funnel f),
    'daily', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day), '[]'::jsonb) FROM daily d),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.events DESC), '[]'::jsonb) FROM events e)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer, text) TO authenticated, service_role;
