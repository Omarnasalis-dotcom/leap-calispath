-- Free branch is byte-for-byte unchanged (still the 8-lifetime cap against
-- app_config.ai_coach_free_chat_lifetime_cap, PRO_REQUIRED on exhaustion) —
-- just now reached via caller_effective_tier()='free' instead of a direct
-- caller_has_pro_access() check. Paid branch (first/pro/max) is new: two
-- independent limits, whichever is hit first blocks the call —
--   1. $ budget: SUM(cost_usd) since entitlement_period_start vs
--      ai_coach_budget_usd. RATE_LIMIT:BUDGET on exhaustion (soft ceiling —
--      cost is only known AFTER a Claude call completes, so this can only
--      check already-accumulated spend, never the incoming turn's cost).
--   2. Message-count pacing, tier-specific via ai_coach_tier_limits:
--      First (steady/weekly both NULL) — one flat count-since-period-start
--      vs day1_msg_cap. Pro/Max — day-1 window (rolling 24h from
--      entitlement_period_start) vs day1_msg_cap, else calendar-day count
--      vs steady_daily_cap, else calendar-week count vs weekly_msg_cap.
-- Returns request_id (the newly-inserted ai_coach_requests row) so the edge
-- function can attach real cost to this exact row after the Claude call
-- completes, via ai_coach_record_chat_cost (next migration).
CREATE OR REPLACE FUNCTION public.ai_coach_log_chat_request()
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

  v_tier := public.caller_effective_tier();

  IF v_tier = 'free' THEN
    SELECT max(ai_coach_free_chat_lifetime_cap) INTO v_cap FROM public.app_config;
    v_cap := COALESCE(v_cap, 8);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat';

    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'PRO_REQUIRED: free chat limit reached' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (v_uid, 'chat')
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
    -- GREATEST(...) matters when the day-1 window ends partway through a
    -- calendar day: without it, day-1 burst messages sent earlier that same
    -- calendar day would double-count against this day's steady cap, since
    -- date_trunc('day', now()) alone can't tell "today's steady-state
    -- messages" apart from "day-1 messages that happened to land today."
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

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (v_uid, 'chat')
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('success', true, 'tier', v_tier, 'request_id', v_request_id, 'budget_usd', v_budget, 'spent_usd', v_spent);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_log_chat_request() TO authenticated;
