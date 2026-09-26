-- Reminder cutoff + small hardening (audit 2026-09-25: M15, L21, M8, L6).
-- Bodies of the two functions are the live prod definitions
-- (pg_get_functiondef) with only the marked lines added. Same signatures,
-- so existing grants are preserved.

-- M15: the daily reminder went to every assessed user at 19:00 local, every
-- day, with no inactivity cutoff — 123 of 188 reachable users had neither
-- trained nor opened the app in 14+ days (2026-09-26).
CREATE OR REPLACE FUNCTION public.get_users_needing_daily_reminder()
 RETURNS TABLE(user_id uuid, display_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH eligible AS (
    SELECT id, display_name, COALESCE(NULLIF(timezone, ''), 'UTC') AS tz
    FROM public.profiles
    WHERE assessed_at IS NOT NULL
      AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'UTC')))::int = 19
  ),
  activity AS (
    SELECT warrior_id AS uid, completed_at AS ts FROM public.workout_logs WHERE warrior_id IS NOT NULL
    UNION ALL SELECT user_id, submitted_at FROM public.weekly_entries WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM public.one_min_max_logs WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, logged_at FROM public.static_holds WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, attempted_at FROM public.trial_history WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, assessed_at FROM public.power_assessments WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM public.arena_attempts WHERE user_id IS NOT NULL
  )
  SELECT e.id, e.display_name
  FROM eligible e
  WHERE NOT EXISTS (
    SELECT 1 FROM activity a
    WHERE a.uid = e.id
      AND (a.ts AT TIME ZONE e.tz)::date = (now() AT TIME ZONE e.tz)::date
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = e.id
      AND n.type = 'daily_reminder'
      AND (n.created_at AT TIME ZONE e.tz)::date = (now() AT TIME ZONE e.tz)::date
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.notification_preferences np
    WHERE np.user_id = e.id AND (np.prefs->>'daily_reminder') = 'false'
  )
  -- Only users who trained or opened the app in the last 14 days (M15).
  -- Opening the app refreshes the auth session, so auth.sessions is the
  -- "last app open" signal; profiles.last_active is only written by the
  -- V2-locked Clash code and is stale for everyone.
  AND (
    EXISTS (
      SELECT 1 FROM activity a
      WHERE a.uid = e.id AND a.ts > now() - interval '14 days'
    )
    OR EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.user_id = e.id
        AND GREATEST(COALESCE(s.refreshed_at, s.created_at), s.updated_at) > now() - interval '14 days'
    )
  );
$function$;

-- L21: per-user lock so AI Coach message caps can't be raced.
CREATE OR REPLACE FUNCTION public.ai_coach_log_chat_request(p_platform text DEFAULT 'ios'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_uid uuid := auth.uid();
  v_cap integer;
  v_count integer;
  v_request_id uuid;
  v_period_start timestamptz;
  v_budget numeric;
  v_spent numeric;
  v_limits RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  -- Serialize per user (L21): the caps below are count-then-insert, so
  -- parallel requests could each see the same count and all get through.
  -- Transaction-scoped; released when this call's transaction ends.
  PERFORM pg_advisory_xact_lock(hashtext('ai_coach_log_chat_request:' || v_uid::text));

  v_tier := public.caller_effective_tier();

  IF v_tier = 'free' THEN
    SELECT ai_coach_free_chat_lifetime_cap INTO v_cap
    FROM public.app_config WHERE platform = p_platform;
    v_cap := COALESCE(v_cap, 8);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat';

    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'PRO_REQUIRED: free chat limit reached' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
    VALUES (v_uid, 'chat', public.caller_rc_transaction_id())
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object('success', true, 'tier', 'free', 'request_id', v_request_id, 'cap', v_cap, 'remaining', GREATEST(v_cap - v_count - 1, 0));
  END IF;

  -- Paid tier. Kill-switch-off/admin/coach resolve to 'max' with no real
  -- period on record — default a synthetic period so the checks below
  -- still run sensibly instead of dividing by a NULL.
  SELECT entitlement_period_start, ai_coach_budget_usd
  INTO v_period_start, v_budget
  FROM public.profiles WHERE id = v_uid;
  v_period_start := COALESCE(v_period_start, date_trunc('month', now()));
  v_budget := COALESCE(v_budget, CASE v_tier WHEN 'first' THEN 1.00 WHEN 'pro' THEN 4.00 ELSE 10.00 END);

  SELECT COALESCE(sum(cost_usd), 0) INTO v_spent
  FROM public.ai_coach_requests
  WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

  IF v_spent >= v_budget THEN
    RAISE EXCEPTION 'RATE_LIMIT:BUDGET: AI Coach budget for this period reached';
  END IF;

  SELECT * INTO v_limits FROM public.ai_coach_tier_limits WHERE tier = v_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ERROR: no ai_coach_tier_limits row for tier %', v_tier;
  END IF;

  IF v_limits.steady_daily_cap IS NULL AND v_limits.weekly_msg_cap IS NULL THEN
    -- First: one flat allowance for the whole period, no day-1/steady split.
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

    IF v_count >= v_limits.day1_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:CAP: AI Coach message limit for this period reached';
    END IF;
  ELSIF now() < v_period_start + interval '1 day' THEN
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

    IF v_count >= v_limits.day1_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:DAY1: AI Coach day-1 message limit reached';
    END IF;
  ELSE
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND created_at >= GREATEST(date_trunc('day', now()), v_period_start + interval '1 day');

    IF v_count >= v_limits.steady_daily_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:DAILY: AI Coach daily message limit reached';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= date_trunc('week', now());

    IF v_count >= v_limits.weekly_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:WEEKLY: AI Coach weekly message limit reached';
    END IF;
  END IF;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (v_uid, 'chat', public.caller_rc_transaction_id())
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('success', true, 'tier', v_tier, 'request_id', v_request_id, 'budget_usd', v_budget, 'spent_usd', v_spent);
END;
$function$;

-- M8: any signed-in user could flip ANY tournament from registration to
-- active. Only its participants may now (same rule as the existing
-- "Participants can update their tournament session" policy). V2-locked.
ALTER POLICY "Warriors can ignite tournament" ON public.tournament_sessions
  USING (
    status = 'registration'
    AND EXISTS (
      SELECT 1 FROM public.tournament_participants tp
      WHERE tp.tournament_id = tournament_sessions.id AND tp.user_id = auth.uid()
    )
  );

-- L6: deleting an admin who reviewed an AI Coach report failed on this FK.
ALTER TABLE public.ai_coach_message_reports
  DROP CONSTRAINT ai_coach_message_reports_reviewed_by_fkey,
  ADD CONSTRAINT ai_coach_message_reports_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
