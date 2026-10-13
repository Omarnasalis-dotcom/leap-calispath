-- Owner decision 2026-10-13: when an athlete logs a lower result, they choose
-- between KEEP MY CURRENT BEST (nothing changes) and SAVE ANYWAY (the lower
-- value replaces their record). SAVE ANYWAY must also move their world points
-- and leaderboard score right away, in every world. The Power tier
-- (Voltaic / Ampere / Tesla) keeps the highest level reached.
--
-- Supersedes 20261013130200_sync_points_ratchet, which made the sync_*
-- functions ratchet points up only: that would have made SAVE ANYWAY never
-- reach the leaderboards. Kept from it: sync_power_points no longer resets a
-- profile to 0 when the power record is missing.
--
-- Static and Endurance already recompute from their records on every save
-- (submit_static_hold / submit_onemm_log call sync_*), so their sync functions
-- go back to the exact recompute that is live on prod today.

-- Power: save
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

    INSERT INTO public.power_assessments AS pa (
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
        power_tier   = GREATEST(COALESCE(pa.power_tier, 0), EXCLUDED.power_tier),
        assessed_at  = EXCLUDED.assessed_at;

    INSERT INTO public.power_assessment_log (user_id, pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm, created_at)
    VALUES (v_user_id, p_pullup, p_dip, p_squat, p_muscleup, NOW());

    -- Read the stored profile values: the tier ratchet and the overtake /
    -- Well-Rounded notifications below compare against them.
    SELECT COALESCE(power_points, 0.0), COALESCE(power_tier, 0), COALESCE(statics_tier, 0), COALESCE(one_mm_points, 0), display_name
    INTO v_profile_points, v_profile_tier, v_statics_tier, v_one_mm_points, v_display_name
    FROM public.profiles
    WHERE id = v_user_id;

    -- "Save anyway" (p_force) replaces the records above, so the world
    -- points follow them, down too. Otherwise points only go up. The tier
    -- always keeps the highest level reached (owner decision 2026-10-13).
    v_new_profile_points := CASE WHEN p_force THEN v_new_points ELSE GREATEST(v_profile_points, v_new_points) END;
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

    IF v_is_new_pb THEN
        PERFORM public.notify_coach_of_achievement(
            v_user_id,
            'client_achievement',
            'Client PB!',
            format('%s set a new Power World PB.', COALESCE(v_display_name, 'A warrior')),
            jsonb_build_object('kind', 'power_pb', 'world', 'power', 'tier', v_new_profile_tier)
        );
    END IF;

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier), v_overtaken_notification_id, v_wra_notification_id;
END;
$function$
;

-- Power: sync
CREATE OR REPLACE FUNCTION public.sync_power_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_points NUMERIC;
  v_tier INT;
  v_claims TEXT;
BEGIN
  SELECT 
    (COALESCE(pullup_1rm, 0) + COALESCE(dip_1rm, 0) + COALESCE(squat_1rm, 0) + (COALESCE(muscleup_1rm, 0) * 2))::NUMERIC
  INTO v_points
  FROM public.power_assessments
  WHERE user_id = p_user_id;

  -- No power record: nothing to sync from. Leave the profile alone rather
  -- than resetting it to 0.
  IF NOT FOUND THEN
    RETURN;
  ELSE
    IF v_points >= 250 THEN
      v_tier := 3;
    ELSIF v_points >= 100 THEN
      v_tier := 2;
    ELSE
      v_tier := 1;
    END IF;
  END IF;

  -- Update power_assessments to keep values matching
  UPDATE public.power_assessments
  SET power_tier = GREATEST(COALESCE(power_tier, 0), v_tier)
  WHERE user_id = p_user_id;

  v_claims := COALESCE(current_setting('request.jwt.claims', true), '');
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE public.profiles
  SET power_points = v_points,
      power_tier = GREATEST(COALESCE(power_tier, 0), v_tier),
      updated_at = NOW()
  WHERE id = p_user_id;

  IF v_claims <> '' THEN
    PERFORM set_config('request.jwt.claims', v_claims, true);
  END IF;
END;
$function$
;

-- Static: sync (prod definition, exact recompute)
CREATE OR REPLACE FUNCTION public.sync_static_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_handstand_peak NUMERIC := 0.0;
  v_front_lever_peak NUMERIC := 0.0;
  v_back_lever_peak NUMERIC := 0.0;
  v_planche_peak NUMERIC := 0.0;
  v_total NUMERIC := 0.0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      CASE
        WHEN movement_id IN ('wall_handstand', 'freestanding_handstand', 'one_arm_handstand') THEN 'handstand'
        WHEN movement_id IN ('tuck_front_lever', 'straddle_front_lever', 'full_front_lever') THEN 'front_lever'
        WHEN movement_id IN ('tuck_back_lever', 'straddle_back_lever', 'full_back_lever') THEN 'back_lever'
        WHEN movement_id IN ('tuck_planche', 'straddle_planche', 'full_planche') THEN 'planche'
      END as category,
      points
    FROM public.static_holds
    WHERE user_id = p_user_id
  LOOP
    IF rec.category = 'handstand'    AND rec.points > v_handstand_peak    THEN v_handstand_peak    := rec.points; END IF;
    IF rec.category = 'front_lever'  AND rec.points > v_front_lever_peak  THEN v_front_lever_peak  := rec.points; END IF;
    IF rec.category = 'back_lever'   AND rec.points > v_back_lever_peak   THEN v_back_lever_peak   := rec.points; END IF;
    IF rec.category = 'planche'      AND rec.points > v_planche_peak      THEN v_planche_peak      := rec.points; END IF;
  END LOOP;

  v_total := v_handstand_peak + v_front_lever_peak + v_back_lever_peak + v_planche_peak;

  UPDATE public.profiles
  SET statics_tier = v_total,
      statics_assessed_at = COALESCE(statics_assessed_at, NOW())
  WHERE id = p_user_id;
END;
$function$
;

-- Endurance: sync (prod definition, exact recompute)
CREATE OR REPLACE FUNCTION public.sync_onemm_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC := 0.0;
BEGIN
  WITH pattern_peaks AS (
    SELECT
      om.pattern_id,
      MAX(omml.points) as best_points
    FROM public.one_min_max_logs omml
    JOIN public.onemm_movements om ON om.id = omml.movement_id
    WHERE omml.user_id = p_user_id AND NOT omml.excluded_from_pb
    GROUP BY om.pattern_id
  )
  SELECT COALESCE(SUM(best_points), 0.0) INTO v_total
  FROM pattern_peaks;

  UPDATE public.profiles SET one_mm_points = v_total WHERE id = p_user_id;
END;
$function$
;
