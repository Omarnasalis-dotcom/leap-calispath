-- Every other submission RPC (submit_static_hold, submit_onemm_log) enforces
-- a 30s per-key cooldown in the DB itself, reading the most recent row in an
-- attempt-log table. submit_trial_result never got the same treatment — it
-- still relies solely on the submit-trial-result Edge Function's cooldown,
-- which is bypassable by calling the RPC directly. Mirror the existing
-- pattern against trial_history.attempted_at, scoped per (user, tier).
CREATE OR REPLACE FUNCTION public.submit_trial_result(
  p_tier integer,
  p_time_seconds numeric,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_best_times jsonb;
  v_current_best numeric;
  v_new_tier integer;
  v_prev_best_time numeric;
  v_prev_completed_count integer;
  v_is_first_completion boolean;
  v_is_new_best boolean;
  v_tier_advanced boolean;
  v_floor integer;
  v_last_attempt_at timestamptz;
  v_seconds_since_last numeric;
  v_cooldown_seconds CONSTANT numeric := 30;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Validate time bounds against the DB-authoritative floor table
  SELECT floor_seconds INTO v_floor
  FROM public.tier_hard_floors
  WHERE tier = p_tier;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIER');
  END IF;

  IF p_time_seconds <= 0 OR p_time_seconds > 3600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIME');
  END IF;

  IF p_time_seconds < v_floor THEN
    RETURN jsonb_build_object('success', false, 'error', 'DISHONOR',
      'message', format('Time %ss is below the minimum for Tier %s (%ss).', p_time_seconds, p_tier, v_floor));
  END IF;

  -- Per-(user, tier) cooldown: mirrors submit_static_hold/submit_onemm_log.
  -- A user can immediately attempt a different tier.
  SELECT attempted_at INTO v_last_attempt_at
  FROM public.trial_history
  WHERE user_id = v_user_id AND tier_attempted = p_tier
  ORDER BY attempted_at DESC LIMIT 1;

  IF v_last_attempt_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_attempt_at));
    IF v_seconds_since_last < v_cooldown_seconds THEN
      RETURN jsonb_build_object('success', false, 'error', 'COOLDOWN',
        'message', format('Please wait %ss before submitting this tier again.',
          CEIL(v_cooldown_seconds - v_seconds_since_last)));
    END IF;
  END IF;

  -- Lock the profile row to avoid racing concurrent submissions
  SELECT strength_tier, best_times INTO v_profile
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF p_tier > v_profile.strength_tier THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT MIN(time_seconds)::numeric, COUNT(*)
  INTO v_prev_best_time, v_prev_completed_count
  FROM trial_history
  WHERE user_id = v_user_id AND tier_attempted = p_tier AND completed = true;

  v_is_first_completion := (v_prev_completed_count = 0);
  v_is_new_best := (NOT v_is_first_completion) AND (p_time_seconds < v_prev_best_time);

  INSERT INTO trial_history (user_id, tier_attempted, time_seconds, completed)
  VALUES (v_user_id, p_tier, p_time_seconds, true);

  v_tier_advanced := false;

  IF p_mode = 'progression' THEN
    v_best_times := COALESCE(v_profile.best_times, '{}'::jsonb);
    v_current_best := (v_best_times ->> p_tier::text)::numeric;

    IF v_current_best IS NULL OR p_time_seconds < v_current_best THEN
      v_best_times := jsonb_set(v_best_times, ARRAY[p_tier::text], to_jsonb(p_time_seconds));
    END IF;

    v_new_tier := CASE WHEN p_tier = v_profile.strength_tier
      THEN LEAST(p_tier + 1, 9)
      ELSE v_profile.strength_tier
    END;
    v_tier_advanced := (v_new_tier > v_profile.strength_tier);

    UPDATE profiles
    SET best_times = v_best_times,
        strength_tier = GREATEST(v_new_tier, v_profile.strength_tier)
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_first_completion', v_is_first_completion,
    'is_new_best', v_is_new_best,
    'tier_advanced', v_tier_advanced,
    'previous_best_time_seconds', v_prev_best_time
  );
END;
$function$;
