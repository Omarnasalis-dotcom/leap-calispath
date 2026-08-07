-- Leaderboard-overtaken notifications, 1MM board + well-rounded (WRA)
-- piggyback — same pattern as static (20260805190000). sync_onemm_points
-- already computes the exact peak-per-pattern sum that
-- get_onemm_well_rounded_leaderboard ranks by and writes it to
-- profiles.one_mm_points, so this just reads that column before/after the
-- sync call rather than re-deriving the aggregate. Global scope.
DROP FUNCTION IF EXISTS public.submit_onemm_log(text, integer, boolean);

CREATE FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer, p_force boolean DEFAULT false)
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

    SELECT COALESCE(one_mm_points, 0), COALESCE(statics_tier, 0), COALESCE(power_points, 0)
    INTO v_old_one_mm_points, v_statics_tier, v_power_points
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
                'Someone just beat your score on the 1MM leaderboard. Defend your spot!',
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
