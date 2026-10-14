-- Strength Trial Steps fix (2026-10-15): a trial is the exam to LEAVE a
-- tier, so the steps built from trial T (with trial T+1's new movements) are
-- for athletes of tier T+1, before their trial. strength_step_attempts.tier
-- is now the ATHLETE's tier (1–9): Neos 1 step (Helot-based), Ephebe–Eternity
-- 2. The minimum time is the base trial's (tier − 1). No rows existed yet.

ALTER TABLE public.strength_step_attempts DROP CONSTRAINT IF EXISTS strength_step_attempts_tier_check;
ALTER TABLE public.strength_step_attempts ADD CONSTRAINT strength_step_attempts_tier_check CHECK (tier BETWEEN 1 AND 9);

CREATE OR REPLACE FUNCTION public.submit_strength_step(p_tier integer, p_step integer, p_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_tier  integer;
  v_floor integer;
  v_steps integer;
  v_first boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- p_tier = the athlete's tier: the steps before their own trial.
  SELECT strength_tier INTO v_tier FROM public.profiles WHERE id = v_user;
  IF v_tier IS NULL OR p_tier IS DISTINCT FROM v_tier THEN
    RAISE EXCEPTION 'NOT_CURRENT_TIER' USING ERRCODE = '22023';
  END IF;

  v_steps := CASE WHEN p_tier = 1 THEN 1 WHEN p_tier BETWEEN 2 AND 9 THEN 2 ELSE 0 END;
  IF p_step IS NULL OR p_step < 1 OR p_step > v_steps THEN
    RAISE EXCEPTION 'INVALID_STEP' USING ERRCODE = '22023';
  END IF;

  IF p_step = 2 AND NOT EXISTS (
    SELECT 1 FROM public.strength_step_attempts WHERE user_id = v_user AND tier = p_tier AND step = 1
  ) THEN
    RAISE EXCEPTION 'STEP_LOCKED' USING ERRCODE = '22023';
  END IF;

  -- The base trial's minimum (TIER_HARD_FLOORS[tier − 1] in the app).
  v_floor := (ARRAY[25, 90, 150, 180, 200, 220, 250, 360, 480])[p_tier];
  IF p_seconds IS NULL OR p_seconds < v_floor OR p_seconds > 7200 THEN
    RAISE EXCEPTION 'INVALID_TIME' USING ERRCODE = '22023';
  END IF;

  v_first := NOT EXISTS (
    SELECT 1 FROM public.strength_step_attempts WHERE user_id = v_user AND tier = p_tier AND step = p_step
  );

  INSERT INTO public.strength_step_attempts (user_id, tier, step, seconds)
  VALUES (v_user, p_tier, p_step, p_seconds);

  RETURN jsonb_build_object(
    'first_clear', v_first,
    'best_seconds', (SELECT min(seconds) FROM public.strength_step_attempts
                     WHERE user_id = v_user AND tier = p_tier AND step = p_step)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_strength_step(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_strength_step(integer, integer, integer) TO authenticated, service_role;
