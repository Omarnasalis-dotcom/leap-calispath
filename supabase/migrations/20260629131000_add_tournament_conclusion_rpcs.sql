-- payout_tournament(p_user_id uuid, p_gp_reward integer) had no
-- authorization or validation at all - any authenticated user could call
-- it directly with an arbitrary user_id and arbitrary reward amount and
-- mint unlimited tournament_gp/glory_score for anyone, completely
-- independent of whether a tournament actually existed or ended. It's
-- replaced by conclude_rank_based_tournament/conclude_knockout_tournament
-- below, which compute the payout internally from each tournament's own
-- already-trustworthy data rather than trusting a client-supplied amount.
-- Not referenced anywhere else in the codebase (only TournamentService.ts's
-- two call sites, both rewired in this change), so safe to drop entirely
-- rather than leave a dead-but-still-callable vulnerable function behind.
DROP FUNCTION IF EXISTS public.payout_tournament(uuid, integer);

-- Replaces TournamentService.closeRankBasedTournament's direct multi-row
-- writes. Ranking is derived purely from total_score/last_trial_at, which
-- are self-only-writable (no dependency on tournament_matches), so this is
-- fully securable: no client-supplied rank or payout amount, idempotent via
-- a FOR UPDATE lock on the session row plus a status check.
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
$function$
;

-- Replaces TournamentService.handleTournamentEnd's direct multi-row writes.
-- Ranking is winner-first, then by max round reached, then total points -
-- same as before. p_winner_user_id is still a trusted parameter: knockout
-- winner determination is itself derived from tournament_matches.winner_id,
-- which has its own separate, still-open RLS gap ("Allow all update",
-- tracked as a known follow-up, not fixed by this change). This function's
-- job is narrower: given an asserted winner, ensure the resulting payout is
-- idempotent, rank-consistent, and capped by config - not an arbitrary
-- amount to an arbitrary row, which is what the old payout_tournament
-- allowed. It does verify the asserted winner is actually a participant in
-- this session, rejecting unrelated user ids outright.
CREATE OR REPLACE FUNCTION public.conclude_knockout_tournament(p_session_id uuid, p_winner_user_id uuid)
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
    SELECT status INTO v_status
    FROM public.tournament_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tournament session not found.';
    END IF;

    IF v_status = 'completed' THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tournament_participants
        WHERE tournament_id = p_session_id AND user_id = p_winner_user_id
    ) THEN
        RAISE EXCEPTION 'Asserted winner is not a participant in this tournament.';
    END IF;

    SELECT tc.payout_gp INTO v_payout_gp
    FROM public.tournament_sessions ts
    JOIN public.tournament_configs tc ON tc.id = ts.config_id
    WHERE ts.id = p_session_id;

    v_payout_gp := COALESCE(v_payout_gp, 0);

    UPDATE public.tournament_sessions SET status = 'completed' WHERE id = p_session_id;

    FOR rec IN
        SELECT id, user_id, scores
        FROM public.tournament_participants
        WHERE tournament_id = p_session_id
        ORDER BY
            (user_id = p_winner_user_id) DESC,
            COALESCE((SELECT MAX(k::numeric) FROM jsonb_object_keys(scores) k), 0) DESC,
            (SELECT COALESCE(SUM((v->>'final')::numeric), 0) FROM jsonb_each(scores) AS e(k, v)) DESC
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
$function$
;

-- Replaces TournamentService.checkAndAutoEliminate's direct multi-row
-- write. Fully self-contained and re-verifies the deadline server-side
-- rather than trusting the caller's claim that it passed - derives
-- "who's eliminated" purely from round_deadline/current_round/scores, none
-- of which depend on the deferred tournament_matches issue.
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
$function$
;

-- Replaces the nonSurvivors-elimination write inside
-- TournamentService.advanceToRound. Derives survivors from
-- tournament_matches.winner_id for the given round rather than trusting a
-- client-supplied survivor list (which would otherwise be trivially
-- exploitable - pass an empty list to eliminate everyone else, or pass
-- yourself as sole survivor to win outright). This still inherits
-- tournament_matches' own open RLS as a residual, separately-tracked risk
-- (someone could tamper with winner_id there to engineer a false survival),
-- but removes the direct open write path on tournament_participants itself
-- and narrows the blast radius to exactly this round's already-recorded
-- match results, nothing else.
CREATE OR REPLACE FUNCTION public.eliminate_tournament_match_losers(p_session_id uuid, p_round integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
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
$function$
;
