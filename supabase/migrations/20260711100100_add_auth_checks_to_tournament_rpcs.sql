-- Five tournament RPCs had no caller check at all, despite being SECURITY
-- DEFINER and GRANTed to anon + authenticated — any unauthenticated request
-- could eliminate arbitrary participants, grief the advance-lock mutex, or
-- force-conclude a tournament and trigger its GP/glory payout early.
--
-- These aren't admin-only actions, though: the client architecture
-- (src/services/TournamentService.ts) calls all five directly from an
-- ordinary participant's own device as a side effect of submitting their own
-- score or opening the lobby (whichever participant happens to trip the
-- "everyone's submitted" / "deadline passed" condition drives the advance).
-- So the fix is not "require admin" — it's "require the caller to actually
-- be a participant in this specific tournament", the same shape already used
-- correctly in conclude_knockout_tournament and claim_clash_victory.
--
-- Signatures are unchanged, so no DROP FUNCTION / client update is needed.

CREATE OR REPLACE FUNCTION public.auto_eliminate_non_submitters(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_round_deadline timestamptz;
    v_current_round integer;
    v_eliminated_count integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tournament_participants
        WHERE tournament_id = p_session_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized for this tournament session.';
    END IF;

    SELECT round_deadline, current_round INTO v_round_deadline, v_current_round
    FROM public.tournament_sessions
    WHERE id = p_session_id;

    IF NOT FOUND OR v_round_deadline IS NULL OR now() <= v_round_deadline THEN
        RETURN 0;
    END IF;

    UPDATE public.tournament_participants
    SET is_eliminated = true
    WHERE tournament_id = p_session_id
      AND is_eliminated = false
      AND NOT (scores ? v_current_round::text);

    GET DIAGNOSTICS v_eliminated_count = ROW_COUNT;
    RETURN v_eliminated_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_tournament_advance_lock(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  updated_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_id = p_session_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this tournament session.';
  END IF;

  -- Only one person can set is_advancing to TRUE at a time
  UPDATE tournament_sessions
  SET is_advancing = TRUE
  WHERE id = p_session_id
    AND is_advancing = FALSE
    AND status = 'active';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_tournament_advance_lock(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_id = p_session_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this tournament session.';
  END IF;

  UPDATE tournament_sessions
  SET is_advancing = FALSE
  WHERE id = p_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminate_tournament_match_losers(p_session_id uuid, p_round integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tournament_participants
        WHERE tournament_id = p_session_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized for this tournament session.';
    END IF;

    UPDATE public.tournament_participants tp
    SET is_eliminated = true
    WHERE tp.tournament_id = p_session_id
      AND tp.is_eliminated = false
      AND NOT EXISTS (
          SELECT 1 FROM public.tournament_matches tm
          WHERE tm.tournament_id = p_session_id
            AND tm.day = p_round
            AND tm.winner_id = tp.user_id
      )
      AND EXISTS (
          -- Only eliminate participants who actually had a match this
          -- round (avoids eliminating byes/unscheduled participants on
          -- rounds where a match for them doesn't exist for some reason).
          SELECT 1 FROM public.tournament_matches tm
          WHERE tm.tournament_id = p_session_id
            AND tm.day = p_round
            AND (tm.user_a = tp.user_id OR tm.user_b = tp.user_id)
      );
END;
$function$;

CREATE OR REPLACE FUNCTION public.conclude_rank_based_tournament(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_status text;
    v_payout_gp integer;
    rec RECORD;
    v_rank integer := 0;
    v_gp_reward integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tournament_participants
        WHERE tournament_id = p_session_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized for this tournament session.';
    END IF;

    SELECT status INTO v_status
    FROM public.tournament_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tournament session not found.';
    END IF;

    -- Idempotency: a concluded tournament can't be concluded (and paid
    -- out) a second time.
    IF v_status = 'completed' THEN
        RETURN;
    END IF;

    SELECT tc.payout_gp INTO v_payout_gp
    FROM public.tournament_sessions ts
    JOIN public.tournament_configs tc ON tc.id = ts.config_id
    WHERE ts.id = p_session_id;

    v_payout_gp := COALESCE(v_payout_gp, 0);

    UPDATE public.tournament_sessions SET status = 'completed' WHERE id = p_session_id;

    FOR rec IN
        SELECT id, user_id
        FROM public.tournament_participants
        WHERE tournament_id = p_session_id
        ORDER BY total_score DESC, last_trial_at ASC
    LOOP
        v_rank := v_rank + 1;

        UPDATE public.tournament_participants SET final_rank = v_rank WHERE id = rec.id;

        v_gp_reward := CASE
            WHEN v_rank = 1 THEN FLOOR(v_payout_gp * 0.75)
            WHEN v_rank = 2 THEN FLOOR(v_payout_gp * 0.25)
            ELSE 0
        END;

        IF v_gp_reward > 0 THEN
            UPDATE public.profiles
            SET tournament_gp = COALESCE(tournament_gp, 0) + v_gp_reward,
                glory_score = COALESCE(glory_score, 0) + v_gp_reward
            WHERE id = rec.user_id;
        END IF;
    END LOOP;
END;
$function$;
