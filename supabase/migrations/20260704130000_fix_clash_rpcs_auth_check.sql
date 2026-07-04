-- claim_clash_victory(session_id, claiming_user_id) and finish_clash_session(
-- p_session_id, p_user_id, p_time_seconds, p_is_sender) never checked
-- auth.uid() against the user-id parameter they trusted. Any authenticated
-- caller could invoke either directly (bypassing the app, which only ever
-- passes the caller's own id) with an arbitrary session_id/user_id pair and
-- force a win, a Glory payout, or a finished-session result for two
-- unrelated users. Both functions are currently orphaned in the shipped app
-- (Clash is a locked "Season 2" placeholder, no route reaches BattleScreen),
-- so this closes a direct-API-only window, not an in-app one. Same bug
-- class already fixed once by dropping payout_tournament.
CREATE OR REPLACE FUNCTION public.claim_clash_victory(session_id uuid, claiming_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  updated_rows INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != claiming_user_id THEN
    RETURN false;
  END IF;

  UPDATE public.clash_sessions
  SET
    status = 'finished',
    winner_id = claiming_user_id,
    finished_at = NOW()
  WHERE id = session_id
    AND status IN ('active', 'accepted')
    AND (sender_id = claiming_user_id OR receiver_id = claiming_user_id);

  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  RETURN updated_rows > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_clash_session(p_session_id uuid, p_user_id uuid, p_time_seconds integer, p_is_sender boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session record;
  v_winner_id uuid;
  v_both_finished boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'FORBIDDEN');
  END IF;

  IF p_time_seconds <= 0 OR p_time_seconds > 3600 THEN
    RETURN jsonb_build_object('success', false, 'message', 'INVALID_TIME');
  END IF;

  -- 1. LOCK THE ROW: Prevents any other process from touching this session until we are done
  SELECT * FROM clash_sessions
  WHERE id = p_session_id
  FOR UPDATE INTO v_session;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Session not found');
  END IF;

  -- Caller must actually be the participant they claim to be for this session
  IF (p_is_sender AND v_session.sender_id != p_user_id) OR
     (NOT p_is_sender AND v_session.receiver_id != p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'FORBIDDEN');
  END IF;

  -- 2. IDEMPOTENCY CHECK: If a winner is already crowned, stop immediately
  IF v_session.winner_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session already finalized',
      'winner_id', v_session.winner_id,
      'both_finished', true
    );
  END IF;
  -- 3. Check if user already submitted (prevent double-submit from same user)
  IF (p_is_sender AND v_session.sender_finish_time IS NOT NULL) OR
     (NOT p_is_sender AND v_session.receiver_finish_time IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Score already recorded');
  END IF;
  -- 4. Record the score
  IF p_is_sender THEN
    UPDATE clash_sessions SET sender_finish_time = p_time_seconds WHERE id = p_session_id;
    v_session.sender_finish_time := p_time_seconds;
  ELSE
    UPDATE clash_sessions SET receiver_finish_time = p_time_seconds WHERE id = p_session_id;
    v_session.receiver_finish_time := p_time_seconds;
  END IF;
  -- 5. Check if both are now finished
  IF v_session.sender_finish_time IS NOT NULL AND v_session.receiver_finish_time IS NOT NULL THEN
    v_both_finished := true;

    -- Determine winner
    IF v_session.sender_finish_time < v_session.receiver_finish_time THEN
      v_winner_id := v_session.sender_id;
    ELSIF v_session.receiver_finish_time < v_session.sender_finish_time THEN
      v_winner_id := v_session.receiver_id;
    ELSE
      v_winner_id := NULL; -- Draw (optional handling)
    END IF;
    -- Finalize session
    UPDATE clash_sessions SET
      winner_id = v_winner_id,
      status = 'finished'
    WHERE id = p_session_id;
    -- Award Glory Points to winner
    IF v_winner_id IS NOT NULL THEN
      UPDATE profiles SET glory_score = glory_score + 10 WHERE id = v_winner_id;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'winner_id', v_winner_id,
    'both_finished', v_both_finished
  );
END;
$function$
;
