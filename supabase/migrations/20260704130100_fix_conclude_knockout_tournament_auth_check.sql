-- conclude_knockout_tournament(p_session_id, p_winner_user_id) verified the
-- asserted winner was *a* participant in the tournament, but never checked
-- that the *caller* had any authority over that tournament at all. Any
-- authenticated user who knew a session_id and a valid participant's id
-- could call this directly, force the tournament to 'completed', and mint
-- tournament_gp/glory_score payouts for arbitrary participants. Tournament
-- is currently a locked "Season 2" placeholder in the shipped app (no route
-- reaches it), so this closes a direct-API-only window. Fix: require the
-- caller to be a participant in the tournament they're concluding — this
-- still allows the real call pattern (any participant's client calling this
-- once it observes the match end, TournamentService.handleTournamentEnd),
-- while rejecting an unrelated caller.
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    SELECT status INTO v_status
    FROM public.tournament_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tournament session not found.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tournament_participants
        WHERE tournament_id = p_session_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized to conclude this tournament.';
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
