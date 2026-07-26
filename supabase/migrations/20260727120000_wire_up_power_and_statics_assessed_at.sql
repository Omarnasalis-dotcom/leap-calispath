-- profiles.power_assessed_at and profiles.statics_assessed_at have existed
-- since the base schema but were never written by any revision of
-- submit_power_assessment or sync_static_points — confirmed via full grep
-- across src/, admin-web/, supabase/functions/, supabase/migrations/ and a
-- trigger inventory (none exists to fill the gap). Unlike profiles.assessed_at
-- (Strength — written directly by submit_initial_assessment, no separate PB
-- table to fall out of sync with), Power and Static each grew their own PB
-- table (power_assessments, static_holds) later and the profile-column sync
-- step was simply never added. This wires both up going forward, mirroring
-- assessed_at's pattern: set once, on first assessment, never overwritten
-- afterward (COALESCE keeps it from resetting on every subsequent PB
-- update) — then backfills existing users from the best available history.

-- 1. submit_power_assessment — same signature, full body unchanged except
--    the one added line in the final profile-sync UPDATE.
CREATE OR REPLACE FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean, is_promotion boolean)
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

    UPDATE public.profiles
    SET power_points = GREATEST(v_profile_points, v_new_points),
        power_tier   = GREATEST(v_profile_tier, v_new_tier),
        power_assessed_at = COALESCE(power_assessed_at, NOW()),
        updated_at   = NOW()
    WHERE id = v_user_id;

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier);
END;
$function$
;

-- 2. sync_static_points — same signature, full body unchanged except the
--    one added line in the profile-sync UPDATE.
CREATE OR REPLACE FUNCTION public.sync_static_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
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

-- 3. Backfill existing users. Prefers the earliest per-attempt log entry
--    (true "first assessed" signal) where that history exists, falling back
--    to the PB table's own timestamp for users who assessed before the log
--    tables existed.
UPDATE public.profiles p
SET power_assessed_at = COALESCE(
  (SELECT MIN(pal.created_at) FROM public.power_assessment_log pal WHERE pal.user_id = p.id),
  (SELECT pa.assessed_at FROM public.power_assessments pa WHERE pa.user_id = p.id)
)
WHERE p.power_assessed_at IS NULL
  AND EXISTS (SELECT 1 FROM public.power_assessments pa WHERE pa.user_id = p.id);

UPDATE public.profiles p
SET statics_assessed_at = COALESCE(
  (SELECT MIN(sha.created_at) FROM public.static_hold_attempts sha WHERE sha.user_id = p.id),
  (SELECT MIN(sh.logged_at) FROM public.static_holds sh WHERE sh.user_id = p.id)
)
WHERE p.statics_assessed_at IS NULL
  AND EXISTS (SELECT 1 FROM public.static_holds sh WHERE sh.user_id = p.id);
