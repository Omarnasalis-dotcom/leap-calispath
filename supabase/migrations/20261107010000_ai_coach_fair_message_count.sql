-- Fair message counting (owner decision 2026-11-06). Found live: a request the
-- server lost mid-answer still used one of the athlete's messages, and the
-- automatic "Hi" sent when a chat starts used one too. An athlete on 10 a day
-- was stopped mid-build partly by those.
--
-- · A message with no recorded cost, 3 minutes after it started, never produced
--   an answer: it stops counting. ai-coach is cut off at 150s, so nothing can
--   still be running by then. Until then it counts, so parallel sends can't
--   slip past a limit.
-- · The automatic opener doesn't count, once a UTC day, on paid plans only.
--   Free plans keep counting it: their allowance is lifetime, and an uncounted
--   opener could be repeated daily at the owner's cost.
-- · Rows from before 2026-11-01 are left alone. 132 chat rows from before cost
--   tracking have no cost, 30 of them on free accounts, and must keep counting.
-- · The $ budget is unchanged: the opener's real cost still counts against it.
--
-- ai_coach_log_chat_request stays the only judge. get_ai_coach_usage changes
-- the same way, so the app's usage ring keeps matching it.

ALTER TABLE public.ai_coach_requests ADD COLUMN IF NOT EXISTS opener boolean NOT NULL DEFAULT false;

CREATE FUNCTION public._ai_coach_message_counts(p_cost_usd numeric, p_created_at timestamptz, p_opener boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT NOT p_opener
    AND (
      p_cost_usd IS NOT NULL
      OR p_created_at < '2026-11-01'::timestamptz
      OR p_created_at > now() - interval '3 minutes'
    );
$function$;

REVOKE EXECUTE ON FUNCTION public._ai_coach_message_counts(numeric, timestamptz, boolean) FROM PUBLIC, anon, authenticated;

-- Called only by the ai-coach Edge Function with the service key, after it
-- verified the user and saw the app's exact opener as the only message.
CREATE FUNCTION public.ai_coach_mark_opener(p_request_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.ai_coach_requests r
  SET opener = true
  WHERE r.id = p_request_id
    AND r.user_id = p_user_id
    AND r.kind = 'chat'
    AND NOT EXISTS (
      SELECT 1 FROM public.ai_coach_requests o
      WHERE o.user_id = p_user_id AND o.opener AND o.created_at >= date_trunc('day', now())
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_coach_mark_opener(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_coach_mark_opener(uuid, uuid) TO service_role;

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
  v_extra_left integer;
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
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener);

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
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener) AND created_at >= v_period_start;

    IF v_count >= v_limits.day1_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:CAP: AI Coach message limit for this period reached';
    END IF;
  ELSE
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener) AND created_at >= date_trunc('week', now());

    IF v_count >= v_limits.weekly_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:WEEKLY: AI Coach weekly message limit reached';
    END IF;

    -- day1_msg_cap is the normal day plus a one-time extra for the plan
    -- period. Messages spend the extra first, and what's left carries over
    -- until it's used up or the period ends.
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener)
      AND created_at >= v_period_start AND created_at < date_trunc('day', now());
    v_extra_left := GREATEST(v_limits.day1_msg_cap - v_limits.steady_daily_cap - v_count, 0);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener)
      AND created_at >= GREATEST(date_trunc('day', now()), v_period_start);

    IF v_count >= v_limits.steady_daily_cap + v_extra_left THEN
      RAISE EXCEPTION 'RATE_LIMIT:DAILY: AI Coach daily message limit reached';
    END IF;
  END IF;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (v_uid, 'chat', public.caller_rc_transaction_id())
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('success', true, 'tier', v_tier, 'request_id', v_request_id, 'budget_usd', v_budget, 'spent_usd', v_spent);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ai_coach_usage(p_platform text DEFAULT 'ios')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tier text;
  v_cap integer;
  v_count integer;
  v_period_start timestamptz;
  v_expires timestamptz;
  v_until timestamptz;
  v_budget numeric;
  v_spent numeric;
  v_budget_left_pct integer;
  v_limits RECORD;
  v_day_limit integer;
  v_day_left integer;
  v_week_left integer;
  v_window text;
  v_limit integer;
  v_left integer;
  v_resets timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  v_tier := public.caller_effective_tier();

  IF v_tier = 'free' THEN
    SELECT ai_coach_free_chat_lifetime_cap INTO v_cap
    FROM public.app_config WHERE platform = p_platform;
    v_cap := COALESCE(v_cap, 8);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener);

    RETURN jsonb_build_object(
      'tier', 'free',
      'window', 'lifetime',
      'messages_limit', v_cap,
      'messages_left', GREATEST(v_cap - v_count, 0),
      'resets_at', NULL,
      'budget_left_pct', NULL,
      'budget_until', NULL
    );
  END IF;

  SELECT entitlement_period_start, ai_coach_budget_usd, access_expires_at
  INTO v_period_start, v_budget, v_expires
  FROM public.profiles WHERE id = v_uid;
  v_period_start := COALESCE(v_period_start, date_trunc('month', now()));
  v_budget := COALESCE(v_budget, CASE v_tier WHEN 'first' THEN 1.00 WHEN 'pro' THEN 4.00 ELSE 10.00 END);
  -- A date already gone (admins, a late renewal) would read as nonsense.
  v_until := CASE WHEN v_expires > now() THEN v_expires END;

  SELECT COALESCE(sum(cost_usd), 0) INTO v_spent
  FROM public.ai_coach_requests
  WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

  -- Rounds down so it never overstates; 0 only when the budget is really
  -- gone, which is exactly when the next message is refused.
  v_budget_left_pct := CASE
    WHEN v_spent >= v_budget THEN 0
    ELSE GREATEST(floor((v_budget - v_spent) / v_budget * 100)::integer, 1)
  END;

  SELECT * INTO v_limits FROM public.ai_coach_tier_limits WHERE tier = v_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ERROR: no ai_coach_tier_limits row for tier %', v_tier;
  END IF;

  IF v_limits.steady_daily_cap IS NULL AND v_limits.weekly_msg_cap IS NULL THEN
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener) AND created_at >= v_period_start;

    v_window := 'period';
    v_limit := v_limits.day1_msg_cap;
    v_left := v_limit - v_count;
    v_resets := v_until;
  ELSE
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener)
      AND created_at >= v_period_start AND created_at < date_trunc('day', now());
    v_day_limit := v_limits.steady_daily_cap + GREATEST(v_limits.day1_msg_cap - v_limits.steady_daily_cap - v_count, 0);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener)
      AND created_at >= GREATEST(date_trunc('day', now()), v_period_start);
    v_day_left := v_day_limit - v_count;

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND public._ai_coach_message_counts(cost_usd, created_at, opener) AND created_at >= date_trunc('week', now());
    v_week_left := v_limits.weekly_msg_cap - v_count;

    -- The tighter limit shows. With both used up the week is the real wait,
    -- since the new day alone opens nothing.
    IF v_week_left <= 0 OR v_week_left < v_day_left THEN
      v_window := 'week';
      v_limit := v_limits.weekly_msg_cap;
      v_left := v_week_left;
      v_resets := date_trunc('week', now()) + interval '7 days';
    ELSE
      v_window := 'day';
      v_limit := v_day_limit;
      v_left := v_day_left;
      v_resets := date_trunc('day', now()) + interval '1 day';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'window', v_window,
    'messages_limit', v_limit,
    'messages_left', GREATEST(v_left, 0),
    'resets_at', v_resets,
    'budget_left_pct', v_budget_left_pct,
    'budget_until', v_until
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
