-- SUDDEN DEATH FINISH REPORTING RPC
CREATE OR REPLACE FUNCTION finish_clash_session(
    p_session_id UUID,
    p_user_id UUID,
    p_time_seconds INTEGER,
    p_is_sender BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
    v_session public.clash_sessions;
    v_winner_id UUID;
BEGIN
    -- Select the session for update to prevent concurrent race conditions
    SELECT * INTO v_session FROM public.clash_sessions 
    WHERE id = p_session_id 
    FOR UPDATE;

    IF v_session.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session not found');
    END IF;

    -- If already finished, don't allow double-reporting
    IF v_session.status = 'finished' OR v_session.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', true, 'winner_id', v_session.winner_id, 'both_finished', true);
    END IF;

    -- Update the finish time and SET STATUS TO FINISHED IMMEDIATELY (Sudden Death)
    IF p_is_sender THEN
        UPDATE public.clash_sessions 
        SET sender_finish_time = p_time_seconds,
            status = 'finished',
            winner_id = p_user_id,
            updated_at = NOW()
        WHERE id = p_session_id;
    ELSE
        UPDATE public.clash_sessions 
        SET receiver_finish_time = p_time_seconds,
            status = 'finished',
            winner_id = p_user_id,
            updated_at = NOW()
        WHERE id = p_session_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'winner_id', p_user_id,
        'both_finished', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
