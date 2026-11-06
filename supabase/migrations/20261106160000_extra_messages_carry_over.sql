-- Owner rule 2026-11-06: Pro and Max no longer have a separate first-24-hours
-- limit. Each plan period gives a one-time extra on top of the normal day
-- (Pro 10 + 10, Max 15 + 15, from ai_coach_tier_limits.day1_msg_cap). Every
-- message spends the extra first; what's left carries over until it's used up
-- or the period ends. Example on Pro: 6 messages on day one, day two allows 14.
-- The weekly limit always applies, on every day of the period.
--
-- Changes the Pro/Max section of ai_coach_log_chat_request only. The caps'
-- values, Free, First, the budget, the lock and the return shape are the same.
-- RATE_LIMIT:DAY1 is no longer raised. get_ai_coach_usage follows the same rule.

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
  ELSE
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= date_trunc('week', now());

    IF v_count >= v_limits.weekly_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:WEEKLY: AI Coach weekly message limit reached';
    END IF;

    -- day1_msg_cap is the normal day plus a one-time extra for the plan
    -- period. Messages spend the extra first, and what's left carries over
    -- until it's used up or the period ends.
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND created_at >= v_period_start AND created_at < date_trunc('day', now());
    v_extra_left := GREATEST(v_limits.day1_msg_cap - v_limits.steady_daily_cap - v_count, 0);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
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
    WHERE user_id = v_uid AND kind = 'chat';

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
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

    v_window := 'period';
    v_limit := v_limits.day1_msg_cap;
    v_left := v_limit - v_count;
    v_resets := v_until;
  ELSE
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND created_at >= v_period_start AND created_at < date_trunc('day', now());
    v_day_limit := v_limits.steady_daily_cap + GREATEST(v_limits.day1_msg_cap - v_limits.steady_daily_cap - v_count, 0);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND created_at >= GREATEST(date_trunc('day', now()), v_period_start);
    v_day_left := v_day_limit - v_count;

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= date_trunc('week', now());
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
