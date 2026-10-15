-- Strength Trials audit M1 (docs/technical-audit/STRENGTH_TRIALS_AUDIT_2026-10-16.md):
-- a finished trial can be sent twice: the reply to the first send is lost
-- (gym Wi-Fi), the app resends. The second send used to hit the cooldown
-- ("Please wait 29s") although the trial was saved, and a later retry saved
-- a duplicate that no longer ranked the athlete up (no celebration, no
-- Journey points). Now the app tags each finished trial with an attempt id;
-- the same id again gets the first answer back. Older apps send no id and
-- behave as before.

ALTER TABLE public.trial_history
  ADD COLUMN IF NOT EXISTS client_attempt_id text,
  ADD COLUMN IF NOT EXISTS result jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS trial_history_user_attempt_key
  ON public.trial_history (user_id, client_attempt_id) WHERE client_attempt_id IS NOT NULL;

-- New optional parameter: drop the 3-argument version so calls can't be
-- ambiguous between two overloads.
DROP FUNCTION IF EXISTS public.submit_trial_result(integer, numeric, text);

CREATE FUNCTION public.submit_trial_result(p_tier integer, p_time_seconds numeric, p_mode text, p_attempt_id text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_overtaken_user_id uuid;
  v_overtaken_notification_id uuid;
  -- Anything but a real attempt at the athlete's own tier is practice.
  v_mode text := CASE WHEN p_mode = 'progression' THEN 'progression' ELSE 'practice' END;
  v_row_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- The same finished attempt sent again (the reply to the first send was
  -- lost): answer with what was saved then, never save it twice.
  IF p_attempt_id IS NOT NULL THEN
    IF length(p_attempt_id) NOT BETWEEN 8 AND 64 THEN
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_ATTEMPT');
    END IF;
    SELECT result INTO v_result FROM trial_history
    WHERE user_id = v_user_id AND client_attempt_id = p_attempt_id;
    IF FOUND THEN
      RETURN v_result || jsonb_build_object('replayed', true);
    END IF;
  END IF;

  -- trial_history keeps whole seconds: round first, so the checks below
  -- judge the time that is actually stored.
  p_time_seconds := round(p_time_seconds);

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
  SELECT strength_tier, best_times, display_name INTO v_profile
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  -- Two sends of one attempt at the same moment: the second waited on the
  -- lock above, so the first is saved by now.
  IF p_attempt_id IS NOT NULL THEN
    SELECT result INTO v_result FROM trial_history
    WHERE user_id = v_user_id AND client_attempt_id = p_attempt_id;
    IF FOUND THEN
      RETURN v_result || jsonb_build_object('replayed', true);
    END IF;
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

  INSERT INTO trial_history (user_id, tier_attempted, time_seconds, completed, mode, client_attempt_id)
  VALUES (v_user_id, p_tier, p_time_seconds, true, v_mode, p_attempt_id)
  RETURNING id INTO v_row_id;

  IF v_is_new_best OR v_is_first_completion THEN
    SELECT th.user_id INTO v_overtaken_user_id
    FROM (
      SELECT user_id, MIN(time_seconds) AS best_time
      FROM trial_history
      WHERE tier_attempted = p_tier AND completed = true AND user_id != v_user_id
      GROUP BY user_id
    ) th
    WHERE th.best_time > p_time_seconds AND th.best_time <= COALESCE(v_prev_best_time, 999999)
    ORDER BY th.best_time ASC
    LIMIT 1;

    IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM notification_preferences
      WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
    ) THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_overtaken_user_id,
        'leaderboard_overtaken',
        'You''ve Been Overtaken!',
        format('%s just beat your time in Tier %s. Defend your spot!', COALESCE(v_profile.display_name, 'Someone'), p_tier),
        jsonb_build_object('screen', 'profile')
      )
      RETURNING id INTO v_overtaken_notification_id;
    END IF;
  END IF;

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

  IF v_tier_advanced THEN
    PERFORM public.notify_coach_of_achievement(
      v_user_id,
      'client_achievement',
      'Client Tier Up!',
      format('%s reached Tier %s in Strength.', COALESCE(v_profile.display_name, 'A warrior'), v_new_tier),
      jsonb_build_object('kind', 'tier_promotion', 'world', 'strength', 'new_tier', v_new_tier)
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'is_first_completion', v_is_first_completion,
    'is_new_best', v_is_new_best,
    'tier_advanced', v_tier_advanced,
    'previous_best_time_seconds', v_prev_best_time,
    'overtaken_notification_id', v_overtaken_notification_id
  );
  -- Kept with the row so a resend of this attempt gets the same answer.
  IF p_attempt_id IS NOT NULL THEN
    UPDATE trial_history SET result = v_result WHERE id = v_row_id;
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_trial_result(integer, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_trial_result(integer, numeric, text, text) TO authenticated, service_role;
