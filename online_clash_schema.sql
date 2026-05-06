-- ⚔️ ONLINE CLASH ENGINE SCHEMA
-- Bracket Definitions:
-- Developing: Tiers 2-4
-- Elite: Tiers 5-8

-- 1. CLASH SESSIONS TABLE
CREATE TABLE IF NOT EXISTS clash_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'active', 'finished', 'cancelled')),
    bracket TEXT CHECK (bracket IN ('developing', 'elite')),
    workout_protocol JSONB NOT NULL,
    start_time TIMESTAMPTZ,
    winner_id UUID REFERENCES profiles(id),
    sender_finish_time INTEGER, -- In seconds
    receiver_finish_time INTEGER, -- In seconds
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for Clash Progress
ALTER PUBLICATION supabase_realtime ADD TABLE clash_sessions;

-- 2. CLASH SCORING FUNCTION
CREATE OR REPLACE FUNCTION handle_clash_victory()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        -- Case: Clear Winner
        IF NEW.winner_id IS NOT NULL THEN
            -- Add Glory to Winner
            UPDATE profiles SET glory_score = glory_score + 25 WHERE id = NEW.winner_id;
            
            -- Deduct Glory from Loser
            IF NEW.winner_id = NEW.sender_id THEN
                UPDATE profiles SET glory_score = GREATEST(0, glory_score - 15) WHERE id = NEW.receiver_id;
            ELSE
                UPDATE profiles SET glory_score = GREATEST(0, glory_score - 15) WHERE id = NEW.sender_id;
            END IF;
        
        -- Case: Draw (Split Glory)
        ELSIF NEW.sender_finish_time IS NOT NULL AND NEW.receiver_finish_time IS NOT NULL THEN
            UPDATE profiles SET glory_score = glory_score + 5 WHERE id IN (NEW.sender_id, NEW.receiver_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. TRIGGER FOR SCORING
CREATE TRIGGER on_clash_finished
AFTER UPDATE ON clash_sessions
FOR EACH ROW
EXECUTE FUNCTION handle_clash_victory();

-- 4. HELPER: GET USER BRACKET
CREATE OR REPLACE FUNCTION get_user_clash_bracket(user_tier INTEGER)
RETURNS TEXT AS $$
BEGIN
    IF user_tier >= 2 AND user_tier <= 4 THEN
        RETURN 'developing';
    ELSIF user_tier >= 5 AND user_tier <= 8 THEN
        RETURN 'elite';
    ELSE
        RETURN 'none';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. FUNCTION: SEND CLASH CHALLENGE
CREATE OR REPLACE FUNCTION send_clash_challenge(receiver_display_name TEXT)
RETURNS UUID AS $$
DECLARE
    sender_profile profiles%ROWTYPE;
    receiver_profile profiles%ROWTYPE;
    new_clash_id UUID;
    v_bracket TEXT;
BEGIN
    -- Get sender profile
    SELECT * INTO sender_profile FROM profiles WHERE id = auth.uid();
    
    -- Get receiver profile
    SELECT * INTO receiver_profile FROM profiles WHERE display_name = receiver_display_name LIMIT 1;
    
    IF receiver_profile.id IS NULL THEN
        RAISE EXCEPTION 'Warrior not found.';
    END IF;
    
    -- Check Brackets
    v_bracket := get_user_clash_bracket(sender_profile.strength_tier);
    IF v_bracket = 'none' THEN
        RAISE EXCEPTION 'You must be at least Tier 2 to start a clash.';
    END IF;
    
    IF v_bracket != get_user_clash_bracket(receiver_profile.strength_tier) THEN
        RAISE EXCEPTION 'Opponent is not in your battle bracket.';
    END IF;

    -- Create Clash Session
    INSERT INTO clash_sessions (sender_id, receiver_id, bracket, workout_protocol)
    VALUES (sender_profile.id, receiver_profile.id, v_bracket, '{"movements": []}') -- Workout to be populated by app logic
    RETURNING id INTO new_clash_id;

    RETURN new_clash_id;
END;
$$ LANGUAGE plpgsql;

-- 3. ATOMIC FINISH REPORTING RPC (SUDDEN DEATH)
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
