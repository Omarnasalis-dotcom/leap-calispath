-- Leaderboard-overtaken notifications, static world board + well-rounded
-- (WRA) piggyback. sync_static_points already computes the exact same
-- 4-category peak-sum formula that get_static_well_rounded_leaderboard
-- ranks by, and writes it straight to profiles.statics_tier — so instead of
-- re-deriving the aggregate separately, this just reads that column before
-- and after the sync call. Global scope (the static leaderboard isn't
-- tier-scoped), same "direct leapfrog, single recipient" pattern as
-- strength/power.
--
-- Postgres refuses to CREATE OR REPLACE a RETURNS TABLE(...) function when
-- the column list changes — drop the old 1-column signature first.
DROP FUNCTION IF EXISTS public.submit_static_hold(text, numeric, boolean);

CREATE FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric, p_force boolean DEFAULT false)
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

    SELECT COALESCE(statics_tier, 0), COALESCE(power_points, 0), COALESCE(one_mm_points, 0)
    INTO v_old_statics_tier, v_power_points, v_one_mm_points
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
                'Someone just beat your score on the Static World leaderboard. Defend your spot!',
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
