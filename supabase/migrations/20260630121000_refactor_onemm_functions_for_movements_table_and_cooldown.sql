-- submit_onemm_log previously hardcoded all 16 movements' category/multiplier
-- in a CASE statement (duplicated again in sync_onemm_points and
-- get_onemm_well_rounded_leaderboard) and only enforced a flat 0–150 rep
-- ceiling regardless of movement difficulty, with no rate limiting at all.
-- This rewrite:
--   1. Looks up category_id, pattern_id, multiplier, and per-movement
--      max_reps ceiling from onemm_movements instead of a hardcoded CASE
--      (also doubles as movement-id validation: no matching row = invalid id).
--   2. Enforces a 30s per-(user, movement) cooldown using one_min_max_logs
--      directly — unlike static_holds (PB-only), one_min_max_logs already
--      records every validated submission, so no separate attempts table
--      is needed.
--   3. Error codes P1001–P1004 mirror the static world pattern, enabling
--      the client to distinguish known validation rejections from genuine
--      unexpected errors (skipping console.error for the former).
CREATE OR REPLACE FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer)
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

    -- Movement metadata lookup also doubles as id validation.
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

    -- Per-movement cooldown: check most recent validated submission for
    -- this user+movement in one_min_max_logs (which already logs every
    -- validated attempt, so no separate attempts table needed).
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

    -- Determine PB
    SELECT COALESCE(MAX(reps), 0) INTO v_current_max
    FROM public.one_min_max_logs
    WHERE user_id = v_user_id AND movement_id = p_movement_id;

    IF p_reps >= v_current_max THEN
        v_is_new_pb := true;
    END IF;

    v_points := p_reps * v_multiplier;

    INSERT INTO public.one_min_max_logs (
        user_id,
        movement_id,
        category_id,
        reps,
        points,
        created_at
    )
    VALUES (
        v_user_id,
        p_movement_id,
        v_category_id,
        p_reps,
        v_points,
        NOW()
    );

    PERFORM public.sync_onemm_points(v_user_id);

    RETURN QUERY SELECT v_is_new_pb;
END;
$function$
;

-- sync_onemm_points previously re-derived each movement's pattern_id via a
-- hardcoded CASE; now joins onemm_movements instead. Output
-- (profiles.one_mm_points) is computed identically.
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
    WHERE omml.user_id = p_user_id
    GROUP BY om.pattern_id
  )
  SELECT COALESCE(SUM(best_points), 0.0) INTO v_total
  FROM pattern_peaks;

  UPDATE public.profiles SET one_mm_points = v_total WHERE id = p_user_id;
END;
$function$
;

-- get_onemm_well_rounded_leaderboard previously re-derived each movement's
-- pattern_id via a hardcoded CASE; now joins onemm_movements instead.
-- Output shape (columns, ranking, ordering) is unchanged.
CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard()
 RETURNS TABLE(u_id uuid, d_name text, country text, t_score numeric, rnk bigint)
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
        ut.total_score::NUMERIC as t_score,
        DENSE_RANK() OVER (ORDER BY ut.total_score DESC) as rnk
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    ORDER BY t_score DESC;
END;
$function$
;
