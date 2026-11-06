-- Lets the app show how many AI Coach messages are left, when they reset,
-- and how much of the plan period's budget is left, as a percentage.
--
-- Read-only and display-only: ai_coach_log_chat_request stays the only judge
-- of every message, and this function is not called by it. Takes no advisory
-- lock, so it can never make a chat request wait. Keep its rules the same as
-- that function's.

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
  ELSIF now() < v_period_start + interval '1 day' THEN
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

    v_window := 'first_day';
    v_limit := v_limits.day1_msg_cap;
    v_left := v_limit - v_count;
    v_resets := v_period_start + interval '1 day';
  ELSE
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND created_at >= GREATEST(date_trunc('day', now()), v_period_start + interval '1 day');
    v_day_left := v_limits.steady_daily_cap - v_count;

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
      v_limit := v_limits.steady_daily_cap;
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

REVOKE EXECUTE ON FUNCTION public.get_ai_coach_usage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_coach_usage(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
