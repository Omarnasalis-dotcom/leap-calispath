-- Audit 2026-10-13 (#5): the self-healing sync_*_points RPCs (called on every
-- Profile open) recomputed world points/tier from the source tables and wrote
-- them to profiles WITHOUT the GREATEST ratchet the submit_* paths use. Per the
-- documented rule ("scores only update if the new total exceeds the stored
-- score; tiers never decrease"), this could LOWER a ratcheted value — e.g. after
-- a 1MM log is excluded_from_pb, a power lift is force-lowered, or (for power)
-- when the assessment row is missing and the value was reset to 0 outright.
-- Each profile UPDATE now ratchets up only; the self-heal of stale-LOW values
-- still works (GREATEST raises them).

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

  IF NOT FOUND THEN
    v_points := 0.0;
    v_tier := 0;
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
  SET power_tier = v_tier
  WHERE user_id = p_user_id;

  v_claims := COALESCE(current_setting('request.jwt.claims', true), '');
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE public.profiles
  SET power_points = GREATEST(COALESCE(power_points, 0), v_points),
      power_tier = GREATEST(COALESCE(power_tier, 0), v_tier),
      updated_at = NOW()
  WHERE id = p_user_id;

  IF v_claims <> '' THEN
    PERFORM set_config('request.jwt.claims', v_claims, true);
  END IF;
END;
$function$
;

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
  SET statics_tier = GREATEST(COALESCE(statics_tier, 0), v_total),
      statics_assessed_at = COALESCE(statics_assessed_at, NOW())
  WHERE id = p_user_id;
END;
$function$
;

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

  UPDATE public.profiles SET one_mm_points = GREATEST(COALESCE(one_mm_points, 0), v_total) WHERE id = p_user_id;
END;
$function$
;
