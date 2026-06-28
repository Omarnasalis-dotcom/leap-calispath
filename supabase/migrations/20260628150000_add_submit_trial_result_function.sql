-- Wraps trial_history insert + profile PB/tier update in a single transaction
-- so a failure partway through can't leave a trial_history row with no
-- corresponding profile update (or vice versa).
CREATE OR REPLACE FUNCTION public.submit_trial_result(
  p_user_id uuid,
  p_tier integer,
  p_time_seconds numeric,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_profile record;
  v_best_times jsonb;
  v_current_best numeric;
  v_new_tier integer;
BEGIN
  -- Lock the profile row for the duration of this transaction to avoid
  -- racing concurrent submissions from the same user.
  SELECT strength_tier, best_times INTO v_profile
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF p_tier > v_profile.strength_tier THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  INSERT INTO trial_history (user_id, tier_attempted, time_seconds, completed)
  VALUES (p_user_id, p_tier, p_time_seconds, true);

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

    UPDATE profiles
    SET best_times = v_best_times,
        strength_tier = GREATEST(v_new_tier, v_profile.strength_tier)
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;
