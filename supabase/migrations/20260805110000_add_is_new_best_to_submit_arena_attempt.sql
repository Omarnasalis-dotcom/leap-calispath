-- submit_arena_attempt never told the caller whether an attempt was a
-- personal best — every successful submission looked identical client-side.
-- Needed to fire a "New Arena PB!" notification only on a genuine
-- improvement, same pattern as is_new_best on submit_trial_result. Lower
-- time is better here (timed phases), and a first-ever attempt on a phase
-- counts as a best by definition (nothing to compare against).
CREATE OR REPLACE FUNCTION public.submit_arena_attempt(
  p_phase_id text,
  p_time_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_strength_tier integer;
  v_floor integer;
  v_max integer;
  v_last_attempt_at timestamptz;
  v_cooldown_seconds CONSTANT numeric := 30;
  v_seconds_since_last numeric;
  v_previous_best integer;
  v_is_new_best boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT floor_seconds, max_seconds INTO v_floor, v_max
  FROM public.arena_phase_hard_floors
  WHERE phase_id = p_phase_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHASE');
  END IF;

  IF p_time_seconds IS NULL OR p_time_seconds <= 0 OR p_time_seconds > v_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIME');
  END IF;

  IF p_time_seconds < v_floor THEN
    RETURN jsonb_build_object('success', false, 'error', 'DISHONOR',
      'message', format('Time %ss is below the minimum for this phase (%ss).', p_time_seconds, v_floor));
  END IF;

  SELECT strength_tier INTO v_strength_tier
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_strength_tier < 9 THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN',
      'message', 'Champions Arena requires Eternity tier.');
  END IF;

  -- Per-user cooldown: check this user's most recent attempt directly,
  -- mirroring submit_power_assessment's cooldown pattern (no separate
  -- rate-limit table needed).
  SELECT created_at INTO v_last_attempt_at
  FROM public.arena_attempts
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_attempt_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (now() - v_last_attempt_at));
    IF v_seconds_since_last < v_cooldown_seconds THEN
      RETURN jsonb_build_object('success', false, 'error', 'TOO_FAST',
        'message', format('Please wait %ss before submitting again.', CEIL(v_cooldown_seconds - v_seconds_since_last)));
    END IF;
  END IF;

  SELECT MIN(time_in_seconds) INTO v_previous_best
  FROM public.arena_attempts
  WHERE user_id = v_user_id AND phase_id = p_phase_id;

  v_is_new_best := v_previous_best IS NULL OR p_time_seconds < v_previous_best;

  INSERT INTO public.arena_attempts (user_id, phase_id, time_in_seconds)
  VALUES (v_user_id, p_phase_id, p_time_seconds);

  RETURN jsonb_build_object('success', true, 'time_in_seconds', p_time_seconds, 'is_new_best', v_is_new_best);
END;
$function$;
