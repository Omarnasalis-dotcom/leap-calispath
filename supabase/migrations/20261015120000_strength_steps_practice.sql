-- Strength Trial Steps as practice on past tiers (owner request 2026-10-15,
-- "variety of training options"). An athlete can save steps of their current
-- tier AND of any tier below it (trials they already passed). Below the
-- current tier the steps are open in any order; the current tier keeps
-- Step 2 after Step 1. Steps still never change tier or touch trial_history.
-- Only the current tier's steps are offered by the Journey checkpoint.

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

  -- p_tier = the athlete tier whose steps these are: the current tier, or a
  -- tier below it (practice).
  SELECT strength_tier INTO v_tier FROM public.profiles WHERE id = v_user;
  IF v_tier IS NULL OR p_tier IS NULL OR p_tier > v_tier THEN
    RAISE EXCEPTION 'NOT_CURRENT_TIER' USING ERRCODE = '22023';
  END IF;

  v_steps := CASE WHEN p_tier = 1 THEN 1 WHEN p_tier BETWEEN 2 AND 9 THEN 2 ELSE 0 END;
  IF p_step IS NULL OR p_step < 1 OR p_step > v_steps THEN
    RAISE EXCEPTION 'INVALID_STEP' USING ERRCODE = '22023';
  END IF;

  IF p_tier = v_tier AND p_step = 2 AND NOT EXISTS (
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
