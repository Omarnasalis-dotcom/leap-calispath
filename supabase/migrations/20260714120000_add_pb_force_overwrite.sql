-- Lets a user explicitly choose to overwrite their current best with a
-- lower value (previously a worse submission was always a silent no-op).
-- Each world's storage model differs, so the mechanism differs per world:
--
--   Static (static_holds) and Power (power_assessments) each store a single
--   "current best" row per user(+movement) and simply skip the write when
--   the new value isn't better — both get a new p_force flag that bypasses
--   that comparison gate.
--
--   1MM (one_min_max_logs) has no stored "best" at all: every attempt is
--   already logged unconditionally, and the displayed PB is just
--   MAX(reps) over history at read time. A lower value can never become
--   the recognized PB without a real schema change — this adds
--   excluded_from_pb, a soft "supersede" flag set on previously-higher rows
--   when the user forces a lower one to become current. Full attempt
--   history is preserved (nothing is deleted), it just stops counting
--   toward MAX()-derived PB/points/leaderboard queries.
--
-- Power World's achieved tier (power_tier) and points are additionally
-- pinned at their historical high in the profile sync — consistent with
-- this app's existing "tiers never decrease" rule — even though the raw
-- per-movement PB and the power_assessments row's own total/tier move
-- honestly (can go up or down) when forced. Static/1MM have no discrete
-- tier of their own at risk, so their point totals move honestly with the
-- corrected value.

-- ===========================================================================
-- STATIC: submit_static_hold gets p_force, bypassing the improvement gate.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean)
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

    RETURN QUERY SELECT v_is_new_pb;
END;
$function$
;

-- ===========================================================================
-- POWER: submit_power_assessment gets p_force, bypassing the GREATEST merge
-- for the four movement columns. The profile-level power_points/power_tier
-- sync is changed from a raw overwrite to a ratchet (GREATEST against the
-- currently-stored value) so a forced-lower submission can never regress
-- the achieved tier/points, even though power_assessments' own row (and the
-- per-movement values) reflect the honest, possibly-lower current value.
-- ===========================================================================
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
        updated_at   = NOW()
    WHERE id = v_user_id;

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier);
END;
$function$
;

-- ===========================================================================
-- 1MM: schema change + soft-supersede mechanism.
-- ===========================================================================
ALTER TABLE public.one_min_max_logs
  ADD COLUMN IF NOT EXISTS excluded_from_pb boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean)
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

    v_points := p_reps * v_multiplier;

    INSERT INTO public.one_min_max_logs (
        user_id, movement_id, category_id, reps, points, created_at
    )
    VALUES (
        v_user_id, p_movement_id, v_category_id, p_reps, v_points, NOW()
    );

    PERFORM public.sync_onemm_points(v_user_id);

    RETURN QUERY SELECT v_is_new_pb;
END;
$function$
;

-- sync_onemm_points: exclude superseded rows from the peak-per-pattern calc.
CREATE OR REPLACE FUNCTION public.sync_onemm_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
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

-- get_onemm_well_rounded_leaderboard: same peak-per-pattern calc, same
-- exclusion. Signature (p_community_id) is unchanged from
-- 20260710180000_add_community_filter_to_static_onemm_leaderboards.sql, so
-- CREATE OR REPLACE is sufficient — no DROP FUNCTION needed.
CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL)
 RETURNS TABLE(u_id uuid, d_name text, country text, gender text, t_score numeric, rnk bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH pattern_peaks AS (
        SELECT
            omml.user_id,
            om.pattern_id,
            MAX(omml.points) as best_points
        FROM public.one_min_max_logs omml
        JOIN public.onemm_movements om ON om.id = omml.movement_id
        WHERE NOT omml.excluded_from_pb
        GROUP BY omml.user_id, om.pattern_id
    ),
    user_totals AS (
        SELECT
            pp.user_id,
            SUM(pp.best_points) as total_score
        FROM pattern_peaks pp
        GROUP BY pp.user_id
    )
    SELECT
        p.id as u_id,
        COALESCE(p.display_name, split_part(p.email, '@', 1)) as d_name,
        p.country as country,
        p.gender as gender,
        ut.total_score::NUMERIC as t_score,
        DENSE_RANK() OVER (ORDER BY ut.total_score DESC) as rnk
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
    ORDER BY t_score DESC
    LIMIT 100;
END;
$function$;

-- get_onemm_category_leaderboard is intentionally left untouched: it sums
-- every logged attempt's points within a category (a cumulative-volume
-- metric, not a MAX()-derived "best"), so the concept of a superseded PB
-- doesn't apply to it the same way — out of scope for this change.
