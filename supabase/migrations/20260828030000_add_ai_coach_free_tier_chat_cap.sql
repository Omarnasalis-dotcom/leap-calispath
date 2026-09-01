-- Freemium gating redesign (2026-08-28): AI Coach chat is no longer hidden
-- from free users entirely (see the client-side change removing
-- canAccessCoach's Pro gate). Instead, free users get a small LIFETIME
-- (not daily) allowance — enough to have the AI build a program card, then
-- the paywall trigger is "Start Program" (see the following migration).
-- A daily reset was deliberately rejected: it would let a free user chat
-- forever, just paced, defeating the point of a limited taste.
--
-- Reuses the existing ai_coach_requests(kind='chat') counter — already one
-- row per chat turn — rather than building new session/lifetime-scoped
-- infrastructure. Pro's cap stays the same flat 40/day as before, now just
-- configurable via app_config instead of a hardcoded literal (and is the
-- noted future home for a higher "Max" tier value, not built yet).
ALTER TABLE public.app_config ADD COLUMN ai_coach_free_chat_lifetime_cap integer NOT NULL DEFAULT 8;
ALTER TABLE public.app_config ADD COLUMN ai_coach_pro_chat_daily_cap integer NOT NULL DEFAULT 40;

CREATE OR REPLACE FUNCTION public.ai_coach_log_chat_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_pro boolean;
  v_count integer;
  v_cap integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  v_is_pro := public.caller_has_pro_access();

  IF v_is_pro THEN
    SELECT max(ai_coach_pro_chat_daily_cap) INTO v_cap FROM public.app_config;
    v_cap := COALESCE(v_cap, 40);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = auth.uid() AND kind = 'chat' AND created_at >= date_trunc('day', now());

    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT: chat daily limit reached';
    END IF;
  ELSE
    SELECT max(ai_coach_free_chat_lifetime_cap) INTO v_cap FROM public.app_config;
    v_cap := COALESCE(v_cap, 8);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = auth.uid() AND kind = 'chat';

    -- Deliberately PRO_REQUIRED/42501, not RATE_LIMIT — this is a lifetime
    -- cap, not a daily one, so "try again tomorrow" (the client's existing
    -- RATE_LIMIT copy) would be false. Reusing PRO_REQUIRED means this rides
    -- the client's existing 403 -> router.push('/paywall') handling in
    -- CoachScreen.tsx with no new client code needed for this path.
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'PRO_REQUIRED: free chat limit reached' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.ai_coach_requests (user_id, kind)
  VALUES (auth.uid(), 'chat');

  RETURN jsonb_build_object(
    'success', true,
    'is_pro', v_is_pro,
    'cap', v_cap,
    'remaining', GREATEST(v_cap - v_count - 1, 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_log_chat_request() TO authenticated;
