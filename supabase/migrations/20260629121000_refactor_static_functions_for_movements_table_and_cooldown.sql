-- submit_static_hold previously hardcoded all 12 movements' multipliers in
-- a CASE statement (duplicated again in sync_static_points and
-- get_static_well_rounded_leaderboard) and only enforced a single flat 300s
-- ceiling regardless of movement difficulty, with no rate limiting at all —
-- so a single call could instantly claim #1 on every Static leaderboard
-- with a physically implausible time. This rewrite:
--   1. Looks up multiplier + per-movement ceiling from static_movements
--      instead of a hardcoded CASE (also doubles as movement-id validation:
--      no matching row means "Invalid movement ID").
--   2. Enforces a 30s per-(user, movement) cooldown using
--      static_hold_attempts, mirroring submit_trial_result's
--      SUBMISSION_COOLDOWN_SECONDS pattern.
--   3. Logs every validated attempt (pass or fail PB) to
--      static_hold_attempts, mirroring trial_history's "log every attempt"
--      pattern — this is what makes the cooldown check possible, since
--      static_holds only stores the current PB.
-- The PB-upsert logic into static_holds is unchanged in spirit.
CREATE OR REPLACE FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric)
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

    -- Movement metadata lookup also doubles as id validation: a missing
    -- row means an invalid/unknown movement_id.
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

    -- Per-movement cooldown: this user's most recent attempt (pass or
    -- fail) at this specific movement, not a global cooldown across all
    -- movements — a user can immediately test a different movement.
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

    -- Get current PB
    SELECT hold_seconds INTO v_current_hold
    FROM public.static_holds
    WHERE user_id = v_user_id AND movement_id = p_movement_id;

    v_current_hold := COALESCE(v_current_hold, 0.0);

    IF p_hold_seconds > v_current_hold THEN
        v_is_new_pb := true;
        v_points := p_hold_seconds * v_multiplier;

        INSERT INTO public.static_holds (user_id, movement_id, hold_seconds, points, created_at)
        VALUES (v_user_id, p_movement_id, p_hold_seconds, v_points, NOW())
        ON CONFLICT (user_id, movement_id) DO UPDATE
        SET hold_seconds = EXCLUDED.hold_seconds, points = EXCLUDED.points, created_at = EXCLUDED.created_at;

        PERFORM public.sync_static_points(v_user_id);
    END IF;

    -- Logged only on validated attempts (rejections above RAISE EXCEPTION
    -- and roll back the whole call before reaching here) — this is
    -- required, not incidental: if a rejected call also logged, it would
    -- re-stamp created_at and create a self-extending cooldown a user could
    -- never escape.
    INSERT INTO public.static_hold_attempts (user_id, movement_id, hold_seconds, accepted, created_at)
    VALUES (v_user_id, p_movement_id, p_hold_seconds, v_is_new_pb, NOW());

    RETURN QUERY SELECT v_is_new_pb;
END;
$function$
;

-- sync_static_points previously re-derived each movement's category via a
-- hardcoded CASE; now joins static_movements instead. Output (profiles.statics_tier)
-- is computed identically.
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
    SELECT sm.category, sh.points
    FROM public.static_holds sh
    JOIN public.static_movements sm ON sm.id = sh.movement_id
    WHERE sh.user_id = p_user_id
  LOOP
    IF rec.category = 'handstand'    AND rec.points > v_handstand_peak    THEN v_handstand_peak    := rec.points; END IF;
    IF rec.category = 'front_lever'  AND rec.points > v_front_lever_peak  THEN v_front_lever_peak  := rec.points; END IF;
    IF rec.category = 'back_lever'   AND rec.points > v_back_lever_peak   THEN v_back_lever_peak   := rec.points; END IF;
    IF rec.category = 'planche'      AND rec.points > v_planche_peak      THEN v_planche_peak      := rec.points; END IF;
  END LOOP;

  v_total := v_handstand_peak + v_front_lever_peak + v_back_lever_peak + v_planche_peak;

  UPDATE public.profiles SET statics_tier = v_total WHERE id = p_user_id;
END;
$function$
;

-- get_static_well_rounded_leaderboard previously re-derived category via
-- the same hardcoded CASE; now joins static_movements. Output shape
-- (columns, ranking, ordering) is unchanged.
CREATE OR REPLACE FUNCTION public.get_static_well_rounded_leaderboard()
 RETURNS TABLE(u_id uuid, d_name text, hs_pts numeric, fl_pts numeric, bl_pts numeric, pl_pts numeric, t_score numeric, rnk bigint, country text, gender text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH best_per_category AS (
        SELECT sh.user_id, sm.category, MAX(sh.points) as best_points
        FROM public.static_holds sh
        JOIN public.static_movements sm ON sm.id = sh.movement_id
        GROUP BY sh.user_id, sm.category
    ),
    pivoted AS (
        SELECT
            bpc.user_id,
            MAX(CASE WHEN bpc.category = 'handstand' THEN bpc.best_points ELSE 0 END) as hs_pts,
            MAX(CASE WHEN bpc.category = 'front_lever' THEN bpc.best_points ELSE 0 END) as fl_pts,
            MAX(CASE WHEN bpc.category = 'back_lever' THEN bpc.best_points ELSE 0 END) as bl_pts,
            MAX(CASE WHEN bpc.category = 'planche' THEN bpc.best_points ELSE 0 END) as pl_pts
        FROM best_per_category bpc
        WHERE bpc.category IS NOT NULL
        GROUP BY bpc.user_id
    )
    SELECT
        p.id as u_id,
        COALESCE(p.display_name, split_part(p.email, '@', 1)) as d_name,
        pv.hs_pts,
        pv.fl_pts,
        pv.bl_pts,
        pv.pl_pts,
        (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) as t_score,
        DENSE_RANK() OVER (ORDER BY (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) DESC) as rnk,
        p.country,
        p.gender
    FROM pivoted pv
    JOIN public.profiles p ON pv.user_id = p.id
    ORDER BY t_score DESC;
END;
$function$
;
