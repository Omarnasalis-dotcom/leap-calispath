-- Leaderboard-overtaken notifications, power tier board — same pattern as
-- strength (20260805160000): on a genuine profiles.power_points
-- improvement, find the single competitor within the caller's NEW
-- power_tier (matching getPowerTierLeaderboard's own per-tier scoping)
-- whose points are now worse than the caller's new total but were better
-- than or equal to the caller's old total, and notify just that one person.
--
-- v_profile_points (read before the profile UPDATE) is the only trustworthy
-- "old total" here — v_old_points/v_old_tier further up in this function
-- are computed from v_current_pullup/etc AFTER those locals have already
-- been overwritten with the new values, so they're identical to
-- v_new_points/v_new_tier (a pre-existing quirk, left alone — not touching
-- is_promotion's behavior, just not reusing those particular variables).
--
-- Postgres refuses to CREATE OR REPLACE a RETURNS TABLE(...) function when
-- the column list changes ("cannot change return type of existing
-- function") — the old 2-column signature has to be dropped first.
DROP FUNCTION IF EXISTS public.submit_power_assessment(numeric, numeric, numeric, numeric, boolean);

CREATE FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean, is_promotion boolean, overtaken_notification_id uuid)
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
    v_overtaken_user_id UUID;
    v_overtaken_notification_id UUID;
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
    SELECT COALESCE(power_points, 0.0), COALESCE(power_tier, 0)
    INTO v_profile_points, v_profile_tier
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
                'Someone just beat your score on the Power World leaderboard. Defend your spot!',
                jsonb_build_object('screen', 'power-world')
            )
            RETURNING id INTO v_overtaken_notification_id;
        END IF;
    END IF;

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier), v_overtaken_notification_id;
END;
$function$
;
