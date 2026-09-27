-- First-party product analytics (audit 2026-09-25, M5 + M18).
--
-- Owner chose an in-house event log over a third-party SDK: no new vendor or
-- native dependency, data stays in this Supabase project. Most of the funnel
-- is derived from data that already exists (profiles, activity tables, auth);
-- app_events only records what nothing else does — app opens, the
-- complete-profile step and its errors, paywall views/outcomes, AI Coach opens.

CREATE TABLE public.app_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event ~ '^[a-z][a-z0-9_]{1,47}$'),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(properties) <= 2048),
  platform text CHECK (platform IN ('ios', 'android', 'web')),
  app_version text CHECK (char_length(app_version) <= 20),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_events_event_created_at_idx ON public.app_events (event, created_at);
CREATE INDEX app_events_user_id_created_at_idx ON public.app_events (user_id, created_at);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_events FROM anon;
-- Signed-in users can only write their own events and can't read any.
CREATE POLICY "Users log their own events" ON public.app_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins read events" ON public.app_events
  FOR SELECT TO authenticated USING (public.is_admin());

-- Admin growth report for admin-web's Growth page, as one JSON document:
--   funnel  — signups in the last p_days and how far each got
--   daily   — daily active users (trained, logged anything, or opened the app)
--   events  — app_events counts in the window
CREATE OR REPLACE FUNCTION public.admin_get_growth_analytics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

  WITH cohort AS (
    SELECT p.id, u.created_at, p.display_name, p.assessed_at, p.onboarding_completed_at,
           p.rc_original_transaction_id
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.created_at >= v_since
  ),
  activity AS (
    SELECT warrior_id AS uid, completed_at AS ts FROM workout_logs WHERE warrior_id IS NOT NULL
    UNION ALL SELECT user_id, attempted_at FROM trial_history
    UNION ALL SELECT user_id, logged_at FROM static_holds
    UNION ALL SELECT user_id, created_at FROM one_min_max_logs
    UNION ALL SELECT user_id, submitted_at FROM weekly_entries
    UNION ALL SELECT user_id, assessed_at FROM power_assessments
    UNION ALL SELECT user_id, created_at FROM ai_coach_requests WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM app_events
  ),
  funnel AS (
    SELECT 1 AS step_order, 'Signed up' AS step, count(*) AS users, NULL::bigint AS eligible FROM cohort
    UNION ALL SELECT 2, 'Chose a username', count(*) FILTER (WHERE display_name IS NOT NULL), NULL FROM cohort
    UNION ALL SELECT 3, 'Finished assessment', count(*) FILTER (WHERE assessed_at IS NOT NULL), NULL FROM cohort
    UNION ALL SELECT 4, 'Finished onboarding', count(*) FILTER (WHERE onboarding_completed_at IS NOT NULL), NULL FROM cohort
    UNION ALL SELECT 5, 'First workout or trial',
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM workout_logs w WHERE w.warrior_id = c.id)
                          OR EXISTS (SELECT 1 FROM trial_history t WHERE t.user_id = c.id)), NULL
      FROM cohort c
    -- Only users who signed up at least 7 days ago can have come back after day 7.
    UNION ALL SELECT 6, 'Came back after day 7',
      count(*) FILTER (WHERE c.created_at <= now() - interval '7 days' AND (
        EXISTS (SELECT 1 FROM activity a WHERE a.uid = c.id AND a.ts >= c.created_at + interval '7 days')
        OR EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = c.id
                   AND GREATEST(COALESCE(s.refreshed_at, s.created_at), s.updated_at) >= c.created_at + interval '7 days'))),
      count(*) FILTER (WHERE c.created_at <= now() - interval '7 days')
      FROM cohort c
    UNION ALL SELECT 7, 'Saw the paywall',
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_events e WHERE e.user_id = c.id AND e.event = 'paywall_viewed')), NULL
      FROM cohort c
    UNION ALL SELECT 8, 'Subscribed', count(*) FILTER (WHERE rc_original_transaction_id IS NOT NULL), NULL FROM cohort
  ),
  daily AS (
    SELECT d::date AS day,
           (SELECT count(DISTINCT a.uid) FROM activity a
             WHERE a.ts >= d AND a.ts < d + interval '1 day') AS active_users
    FROM generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') AS d
  ),
  events AS (
    SELECT event, count(*) AS events, count(DISTINCT user_id) AS users
    FROM app_events WHERE created_at >= v_since
    GROUP BY event
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'funnel', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.step_order), '[]'::jsonb) FROM funnel f),
    'daily', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day), '[]'::jsonb) FROM daily d),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.events DESC), '[]'::jsonb) FROM events e)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_growth_analytics(integer) TO authenticated, service_role;
