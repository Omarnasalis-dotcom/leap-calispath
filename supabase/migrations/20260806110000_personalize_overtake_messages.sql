-- Personalizes every "You've Been Overtaken!" notification body with the
-- overtaking user's display name instead of the generic "Someone" — no new
-- exposure, display_name is already public on every leaderboard these
-- notifications are about. Pure message-text change, no return signature
-- changes on any of the 5 functions, so plain CREATE OR REPLACE everywhere
-- (no DROP FUNCTION needed).

-- 1. Strength
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
  v_overtaken_user_id uuid;
  v_overtaken_notification_id uuid;
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
  SELECT strength_tier, best_times, display_name INTO v_profile
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

  RETURN jsonb_build_object(
    'success', true,
    'is_first_completion', v_is_first_completion,
    'is_new_best', v_is_new_best,
    'tier_advanced', v_tier_advanced,
    'previous_best_time_seconds', v_prev_best_time,
    'overtaken_notification_id', v_overtaken_notification_id
  );
END;
$function$;

-- 2. Power (also feeds the WRA helper below)
CREATE OR REPLACE FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean, is_promotion boolean, overtaken_notification_id uuid, wra_overtaken_notification_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_current_pullup NUMERIC := 0.0;
    v_current_dip NUMERIC := 0.0;
    v_current_squat NUMERIC := 0.0;
    v_current_muscleup NUMERIC := 0.0;
    v_old_points NUMERIC := 0.0;
    v_new_points NUMERIC := 0.0;
    v_old_tier INT := 0;
    v_new_tier INT := 0;
    v_is_new_pb BOOLEAN := false;
    v_last_assessed_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
    v_profile_points NUMERIC := 0.0;
    v_profile_tier INT := 0;
    v_new_profile_points NUMERIC := 0.0;
    v_new_profile_tier INT := 0;
    v_statics_tier NUMERIC := 0.0;
    v_one_mm_points NUMERIC := 0.0;
    v_display_name TEXT;
    v_overtaken_user_id UUID;
    v_overtaken_notification_id UUID;
    v_wra_notification_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF p_pullup < 0 OR p_pullup > 150 OR
       p_dip < 0 OR p_dip > 200 OR
       p_squat < 0 OR p_squat > 300 OR
       p_muscleup < 0 OR p_muscleup > 100
    THEN
        RAISE EXCEPTION 'Assessment values exceed realistic physical limits.' USING ERRCODE = 'P1001';
    END IF;

    SELECT assessed_at INTO v_last_assessed_at
    FROM public.power_assessments
    WHERE user_id = v_user_id;

    IF v_last_assessed_at IS NOT NULL THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_assessed_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait % seconds before submitting again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1002';
        END IF;
    END IF;

    SELECT
        pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm
    INTO
        v_current_pullup, v_current_dip, v_current_squat, v_current_muscleup
    FROM public.power_assessments
    WHERE user_id = v_user_id;

    v_current_pullup  := COALESCE(v_current_pullup, 0.0);
    v_current_dip     := COALESCE(v_current_dip, 0.0);
    v_current_squat   := COALESCE(v_current_squat, 0.0);
    v_current_muscleup := COALESCE(v_current_muscleup, 0.0);

    IF p_pullup > v_current_pullup OR
       p_dip > v_current_dip OR
       p_squat > v_current_squat OR
       p_muscleup > v_current_muscleup
    THEN
        v_is_new_pb := true;
    END IF;

    IF p_force THEN
        v_current_pullup   := p_pullup;
        v_current_dip      := p_dip;
        v_current_squat    := p_squat;
        v_current_muscleup := p_muscleup;
    ELSE
        v_current_pullup   := GREATEST(v_current_pullup, p_pullup);
        v_current_dip      := GREATEST(v_current_dip, p_dip);
        v_current_squat    := GREATEST(v_current_squat, p_squat);
        v_current_muscleup := GREATEST(v_current_muscleup, p_muscleup);
    END IF;

    v_old_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);
    v_new_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);

    IF v_old_points >= 250 THEN v_old_tier := 3;
    ELSIF v_old_points >= 100 THEN v_old_tier := 2;
    ELSE v_old_tier := 1;
    END IF;

    IF v_new_points >= 250 THEN v_new_tier := 3;
    ELSIF v_new_points >= 100 THEN v_new_tier := 2;
    ELSE v_new_tier := 1;
    END IF;

    INSERT INTO public.power_assessments (
        user_id, pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm, power_tier, assessed_at
    )
    VALUES (
        v_user_id, v_current_pullup, v_current_dip, v_current_squat, v_current_muscleup, v_new_tier, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        pullup_1rm   = EXCLUDED.pullup_1rm,
        dip_1rm      = EXCLUDED.dip_1rm,
        squat_1rm    = EXCLUDED.squat_1rm,
        muscleup_1rm = EXCLUDED.muscleup_1rm,
        power_tier   = EXCLUDED.power_tier,
        assessed_at  = EXCLUDED.assessed_at;

    INSERT INTO public.power_assessment_log (user_id, pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm, created_at)
    VALUES (v_user_id, p_pullup, p_dip, p_squat, p_muscleup, NOW());

    -- Ratchet: profile-level power_points/power_tier only ever move up, even
    -- when a forced overwrite lowers the row above. Read the current stored
    -- values first rather than assuming profiles.power_points was already
    -- in sync with power_assessments (it always was under the old
    -- always-GREATEST behavior, but that's no longer guaranteed once a
    -- force bypass exists).
    SELECT COALESCE(power_points, 0.0), COALESCE(power_tier, 0), COALESCE(statics_tier, 0), COALESCE(one_mm_points, 0), display_name
    INTO v_profile_points, v_profile_tier, v_statics_tier, v_one_mm_points, v_display_name
    FROM public.profiles
    WHERE id = v_user_id;

    v_new_profile_points := GREATEST(v_profile_points, v_new_points);
    v_new_profile_tier := GREATEST(v_profile_tier, v_new_tier);

    UPDATE public.profiles
    SET power_points = v_new_profile_points,
        power_tier   = v_new_profile_tier,
        power_assessed_at = COALESCE(power_assessed_at, NOW()),
        updated_at   = NOW()
    WHERE id = v_user_id;

    IF v_new_profile_points > v_profile_points THEN
        SELECT p2.id INTO v_overtaken_user_id
        FROM public.profiles p2
        WHERE p2.power_tier = v_new_profile_tier
          AND p2.id != v_user_id
          AND p2.power_points < v_new_profile_points
          AND p2.power_points >= v_profile_points
        ORDER BY p2.power_points DESC
        LIMIT 1;

        IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.notification_preferences
            WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
        ) THEN
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_overtaken_user_id,
                'leaderboard_overtaken',
                'You''ve Been Overtaken!',
                format('%s just beat your score on the Power World leaderboard. Defend your spot!', COALESCE(v_display_name, 'Someone')),
                jsonb_build_object('screen', 'power-world')
            )
            RETURNING id INTO v_overtaken_notification_id;
        END IF;
    END IF;

    v_wra_notification_id := public._find_and_notify_wra_overtake(
        v_user_id,
        v_statics_tier + v_profile_points + v_one_mm_points,
        v_statics_tier + v_new_profile_points + v_one_mm_points
    );

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier), v_overtaken_notification_id, v_wra_notification_id;
END;
$function$
;

-- 3. Static World
CREATE OR REPLACE FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric, p_force boolean DEFAULT false)
RETURNS TABLE(is_new_pb boolean, overtaken_notification_id uuid, wra_overtaken_notification_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_multiplier NUMERIC;
    v_max_hold_seconds NUMERIC;
    v_points NUMERIC;
    v_current_hold NUMERIC := 0.0;
    v_is_new_pb BOOLEAN := false;
    v_last_attempt_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
    v_old_statics_tier NUMERIC := 0.0;
    v_new_statics_tier NUMERIC := 0.0;
    v_power_points NUMERIC := 0.0;
    v_one_mm_points NUMERIC := 0.0;
    v_display_name TEXT;
    v_overtaken_user_id UUID;
    v_overtaken_notification_id UUID;
    v_wra_notification_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF p_hold_seconds < 0 THEN
        RAISE EXCEPTION 'Hold time cannot be negative.' USING ERRCODE = 'P1001';
    END IF;

    SELECT multiplier, max_hold_seconds INTO v_multiplier, v_max_hold_seconds
    FROM public.static_movements
    WHERE id = p_movement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid movement ID.' USING ERRCODE = 'P1002';
    END IF;

    IF p_hold_seconds > v_max_hold_seconds THEN
        RAISE EXCEPTION 'Hold time of %s exceeds the %s ceiling for this movement.', p_hold_seconds, v_max_hold_seconds
          USING ERRCODE = 'P1003';
    END IF;

    SELECT created_at INTO v_last_attempt_at
    FROM public.static_hold_attempts
    WHERE user_id = v_user_id AND movement_id = p_movement_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_attempt_at IS NOT NULL THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_attempt_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait %s before submitting this movement again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1004';
        END IF;
    END IF;

    SELECT hold_seconds INTO v_current_hold
    FROM public.static_holds
    WHERE user_id = v_user_id AND movement_id = p_movement_id;

    v_current_hold := COALESCE(v_current_hold, 0.0);
    v_is_new_pb := p_hold_seconds > v_current_hold;

    SELECT COALESCE(statics_tier, 0), COALESCE(power_points, 0), COALESCE(one_mm_points, 0), display_name
    INTO v_old_statics_tier, v_power_points, v_one_mm_points, v_display_name
    FROM public.profiles WHERE id = v_user_id;

    IF v_is_new_pb OR p_force THEN
        v_points := p_hold_seconds * v_multiplier;

        INSERT INTO public.static_holds (user_id, movement_id, hold_seconds, points, created_at)
        VALUES (v_user_id, p_movement_id, p_hold_seconds, v_points, NOW())
        ON CONFLICT (user_id, movement_id) DO UPDATE
        SET hold_seconds = EXCLUDED.hold_seconds, points = EXCLUDED.points, created_at = EXCLUDED.created_at;

        PERFORM public.sync_static_points(v_user_id);
    END IF;

    INSERT INTO public.static_hold_attempts (user_id, movement_id, hold_seconds, accepted, created_at)
    VALUES (v_user_id, p_movement_id, p_hold_seconds, v_is_new_pb, NOW());

    SELECT COALESCE(statics_tier, 0) INTO v_new_statics_tier FROM public.profiles WHERE id = v_user_id;

    IF v_new_statics_tier > v_old_statics_tier THEN
        SELECT p2.id INTO v_overtaken_user_id
        FROM public.profiles p2
        WHERE p2.id != v_user_id
          AND COALESCE(p2.statics_tier, 0) < v_new_statics_tier
          AND COALESCE(p2.statics_tier, 0) >= v_old_statics_tier
        ORDER BY p2.statics_tier DESC
        LIMIT 1;

        IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.notification_preferences
            WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
        ) THEN
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_overtaken_user_id,
                'leaderboard_overtaken',
                'You''ve Been Overtaken!',
                format('%s just beat your score on the Static World leaderboard. Defend your spot!', COALESCE(v_display_name, 'Someone')),
                jsonb_build_object('screen', 'static-world')
            )
            RETURNING id INTO v_overtaken_notification_id;
        END IF;
    END IF;

    v_wra_notification_id := public._find_and_notify_wra_overtake(
        v_user_id,
        v_old_statics_tier + v_power_points + v_one_mm_points,
        v_new_statics_tier + v_power_points + v_one_mm_points
    );

    RETURN QUERY SELECT v_is_new_pb, v_overtaken_notification_id, v_wra_notification_id;
END;
$function$
;

-- 4. 1MM
CREATE OR REPLACE FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer, p_force boolean DEFAULT false)
RETURNS TABLE(is_new_pb boolean, overtaken_notification_id uuid, wra_overtaken_notification_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_category_id TEXT;
    v_multiplier NUMERIC;
    v_max_reps INTEGER;
    v_points NUMERIC;
    v_current_max INT := 0;
    v_is_new_pb BOOLEAN := false;
    v_last_attempt_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
    v_old_one_mm_points NUMERIC := 0.0;
    v_new_one_mm_points NUMERIC := 0.0;
    v_statics_tier NUMERIC := 0.0;
    v_power_points NUMERIC := 0.0;
    v_display_name TEXT;
    v_overtaken_user_id UUID;
    v_overtaken_notification_id UUID;
    v_wra_notification_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF p_reps < 0 THEN
        RAISE EXCEPTION 'Rep count cannot be negative.' USING ERRCODE = 'P1001';
    END IF;

    SELECT category_id, multiplier, max_reps
    INTO v_category_id, v_multiplier, v_max_reps
    FROM public.onemm_movements
    WHERE id = p_movement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid movement ID.' USING ERRCODE = 'P1002';
    END IF;

    IF p_reps > v_max_reps THEN
        RAISE EXCEPTION 'Rep count of % exceeds the % ceiling for this movement.', p_reps, v_max_reps
          USING ERRCODE = 'P1003';
    END IF;

    SELECT created_at INTO v_last_attempt_at
    FROM public.one_min_max_logs
    WHERE user_id = v_user_id AND movement_id = p_movement_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_attempt_at IS NOT NULL THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_attempt_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait % seconds before submitting this movement again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1004';
        END IF;
    END IF;

    -- Only currently-counted (not superseded) rows determine the PB.
    SELECT COALESCE(MAX(reps), 0) INTO v_current_max
    FROM public.one_min_max_logs
    WHERE user_id = v_user_id AND movement_id = p_movement_id AND NOT excluded_from_pb;

    v_is_new_pb := p_reps >= v_current_max;

    -- Forcing a lower value: soft-supersede every currently-counted row
    -- that's still higher than this submission, so this one becomes the
    -- new recognized PB. Nothing is deleted — superseded rows stay in the
    -- table for history, they just stop counting toward MAX()-derived
    -- PB/points/leaderboard queries below.
    IF p_force AND NOT v_is_new_pb THEN
        UPDATE public.one_min_max_logs
        SET excluded_from_pb = true
        WHERE user_id = v_user_id AND movement_id = p_movement_id
          AND reps > p_reps AND NOT excluded_from_pb;
    END IF;

    SELECT COALESCE(one_mm_points, 0), COALESCE(statics_tier, 0), COALESCE(power_points, 0), display_name
    INTO v_old_one_mm_points, v_statics_tier, v_power_points, v_display_name
    FROM public.profiles WHERE id = v_user_id;

    v_points := p_reps * v_multiplier;

    INSERT INTO public.one_min_max_logs (
        user_id, movement_id, category_id, reps, points, created_at
    )
    VALUES (
        v_user_id, p_movement_id, v_category_id, p_reps, v_points, NOW()
    );

    PERFORM public.sync_onemm_points(v_user_id);

    SELECT COALESCE(one_mm_points, 0) INTO v_new_one_mm_points FROM public.profiles WHERE id = v_user_id;

    IF v_new_one_mm_points > v_old_one_mm_points THEN
        SELECT p2.id INTO v_overtaken_user_id
        FROM public.profiles p2
        WHERE p2.id != v_user_id
          AND COALESCE(p2.one_mm_points, 0) < v_new_one_mm_points
          AND COALESCE(p2.one_mm_points, 0) >= v_old_one_mm_points
        ORDER BY p2.one_mm_points DESC
        LIMIT 1;

        IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.notification_preferences
            WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
        ) THEN
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_overtaken_user_id,
                'leaderboard_overtaken',
                'You''ve Been Overtaken!',
                format('%s just beat your score on the 1MM leaderboard. Defend your spot!', COALESCE(v_display_name, 'Someone')),
                jsonb_build_object('screen', 'one-min-max')
            )
            RETURNING id INTO v_overtaken_notification_id;
        END IF;
    END IF;

    v_wra_notification_id := public._find_and_notify_wra_overtake(
        v_user_id,
        v_statics_tier + v_power_points + v_old_one_mm_points,
        v_statics_tier + v_power_points + v_new_one_mm_points
    );

    RETURN QUERY SELECT v_is_new_pb, v_overtaken_notification_id, v_wra_notification_id;
END;
$function$
;

-- 5. Well-Rounded helper (shared by 2-4 above)
CREATE OR REPLACE FUNCTION public._find_and_notify_wra_overtake(p_user_id uuid, p_old_wra numeric, p_new_wra numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_overtaken_user_id uuid;
  v_display_name text;
  v_notification_id uuid;
BEGIN
  IF p_new_wra <= p_old_wra THEN
    RETURN NULL;
  END IF;

  SELECT p2.id INTO v_overtaken_user_id
  FROM public.profiles p2
  WHERE p2.id != p_user_id
    AND (COALESCE(p2.statics_tier, 0) + COALESCE(p2.power_points, 0) + COALESCE(p2.one_mm_points, 0)) < p_new_wra
    AND (COALESCE(p2.statics_tier, 0) + COALESCE(p2.power_points, 0) + COALESCE(p2.one_mm_points, 0)) >= p_old_wra
  ORDER BY (COALESCE(p2.statics_tier, 0) + COALESCE(p2.power_points, 0) + COALESCE(p2.one_mm_points, 0)) DESC
  LIMIT 1;

  IF v_overtaken_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT display_name INTO v_display_name FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_overtaken_user_id,
    'leaderboard_overtaken',
    'You''ve Been Overtaken!',
    format('%s just beat your score on the Well-Rounded leaderboard. Defend your spot!', COALESCE(v_display_name, 'Someone')),
    jsonb_build_object('screen', 'profile')
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;
