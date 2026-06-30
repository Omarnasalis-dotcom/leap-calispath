-- submit_weekly_score had no submission cooldown — the last world without
-- one after this session's fixes to Static (30s), 1MM (30s), Power (30s),
-- and Trials (30s via Edge Function). weekly_entries stores submitted_at
-- which is always updated on each upsert, so the cooldown can check that
-- timestamp directly — no new table needed, same approach as Power World.
-- Also adds P1001/P1002 error codes for structured client-side handling.
CREATE OR REPLACE FUNCTION public.submit_weekly_score(p_challenge_id uuid, p_score numeric, p_metadata jsonb)
 RETURNS TABLE(is_better boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_scoring_type TEXT;
    v_current_score NUMERIC;
    v_is_better BOOLEAN := false;
    v_last_submitted_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Fetch challenge scoring type (also validates challenge exists and is active)
    SELECT scoring_type INTO v_scoring_type
    FROM public.weekly_challenges
    WHERE id = p_challenge_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active challenge not found.';
    END IF;

    -- Validate score bounds
    IF p_score <= 0 OR p_score > 10000 THEN
        RAISE EXCEPTION 'Submitted score exceeds realistic limits.' USING ERRCODE = 'P1001';
    END IF;

    -- Per-user cooldown: check submitted_at on the existing entry for this
    -- user + challenge. Only fires if an entry already exists (first submission
    -- is never rate-limited). Mirrors Power World's assessed_at approach.
    SELECT submitted_at INTO v_last_submitted_at
    FROM public.weekly_entries
    WHERE challenge_id = p_challenge_id AND user_id = v_user_id;

    IF v_last_submitted_at IS NOT NULL THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_submitted_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait % seconds before submitting again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1002';
        END IF;
    END IF;

    -- Fetch existing score for PB comparison
    SELECT score INTO v_current_score
    FROM public.weekly_entries
    WHERE challenge_id = p_challenge_id AND user_id = v_user_id;

    IF v_current_score IS NULL THEN
        v_is_better := true;
    ELSE
        IF v_scoring_type = 'time' THEN
            IF p_score < v_current_score THEN v_is_better := true; END IF;
        ELSE
            IF p_score > v_current_score THEN v_is_better := true; END IF;
        END IF;
    END IF;

    IF v_is_better THEN
        INSERT INTO public.weekly_entries (
            challenge_id,
            user_id,
            score,
            metadata,
            submitted_at
        )
        VALUES (
            p_challenge_id,
            v_user_id,
            p_score,
            p_metadata,
            NOW()
        )
        ON CONFLICT (challenge_id, user_id) DO UPDATE
        SET
            score        = EXCLUDED.score,
            metadata     = EXCLUDED.metadata,
            submitted_at = EXCLUDED.submitted_at;
    END IF;

    RETURN QUERY SELECT v_is_better;
END;
$function$
;
