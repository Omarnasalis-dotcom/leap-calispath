-- Phase 1: The Foundation - Database Schema
-- Run this in your Supabase SQL Editor

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  strength_tier INT DEFAULT 0,
  power_tier INT DEFAULT NULL,
  statics_tier INT DEFAULT NULL,
  glory_score INT DEFAULT 0,
  streak INT DEFAULT 0,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  assessed_at TIMESTAMPTZ,
  assessment_locked_until TIMESTAMPTZ DEFAULT NULL,
  power_assessed_at TIMESTAMPTZ,
  statics_assessed_at TIMESTAMPTZ,
  best_times JSONB DEFAULT '{}',
  trials_attempted INT DEFAULT 0,
  trials_passed INT DEFAULT 0,
  is_public BOOLEAN DEFAULT TRUE,
  push_token TEXT,
  timezone TEXT DEFAULT 'UTC',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Warriors can only access their own profile
CREATE POLICY "Warriors manage own profile"
  ON profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, timezone, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC'),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile when user signs up
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Revoke EXECUTE from anon to prevent REST API access (security warning fix)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- View for public leaderboard (Phase 5)
CREATE VIEW public_leaderboard AS
  SELECT 
    id, 
    display_name, 
    strength_tier, 
    power_tier, 
    statics_tier,
    glory_score, 
    streak, 
    trials_passed, 
    last_active, 
    is_public
  FROM profiles
  WHERE is_public = TRUE
  ORDER BY glory_score DESC;

-- Function to calculate glory score (Phase 4)
CREATE OR REPLACE FUNCTION calculate_glory(
  s_tier INT, 
  p_tier INT, 
  st_tier INT,
  pullups INT, 
  pushups INT, 
  dips INT, 
  mu INT, 
  streak INT
) RETURNS INT
SET search_path = ''
AS $$
BEGIN
  RETURN (
    COALESCE(s_tier,0)*200 + COALESCE(p_tier,0)*150 + COALESCE(st_tier,0)*150 +
    COALESCE(pullups,0)*4 + COALESCE(pushups,0)*2 + COALESCE(dips,0)*3 +
    COALESCE(mu,0)*12 + COALESCE(streak,0)*5
  );
END;
$$ LANGUAGE plpgsql;
-- Add Power World fields to profiles table
ALTER TABLE profiles 
ADD COLUMN power_pbs JSONB DEFAULT '{}',
ADD COLUMN power_points INT DEFAULT 0;

-- Update existing profiles to have default power_pbs structure
UPDATE profiles 
SET power_pbs = '{"pull_up": 0, "dip": 0, "squat": 0, "muscle_up": 0}'
WHERE power_pbs = '{}' OR power_pbs IS NULL;
-- ============================================================
-- STATIC WORLD TABLES
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Table to store individual static hold records
CREATE TABLE IF NOT EXISTS public.static_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_id TEXT NOT NULL,
  hold_seconds NUMERIC NOT NULL,
  points NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, movement_id) -- One record per movement per user (UPSERT logic)
);

-- Row Level Security
ALTER TABLE public.static_holds ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can read holds" ON public.static_holds;
DROP POLICY IF EXISTS "Users manage own holds" ON public.static_holds;

-- Everyone can read holds (for leaderboards)
CREATE POLICY "Anyone can read holds"
  ON public.static_holds FOR SELECT
  USING (true);

-- Users can manage their own holds
CREATE POLICY "Users manage own holds"
  ON public.static_holds FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_static_holds_movement_points
  ON public.static_holds (movement_id, points DESC);

-- ============================================================
-- LEADERBOARD FUNCTIONS FOR STATIC WORLD
-- ============================================================

-- Function to get leaderboard for a specific movement
CREATE OR REPLACE FUNCTION public.get_static_movement_leaderboard(m_id TEXT)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  display_name TEXT,
  best_time_seconds NUMERIC,
  points NUMERIC
)
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY sh.points DESC, sh.created_at ASC) as rank,
    sh.user_id,
    COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    sh.hold_seconds as best_time_seconds,
    sh.points
  FROM public.static_holds sh
  JOIN public.profiles p ON sh.user_id = p.id
  WHERE sh.movement_id = m_id
  ORDER BY sh.points DESC;
END;
$$;

-- Function to get leaderboard for a specific level (sum of points in that level)
CREATE OR REPLACE FUNCTION public.get_static_level_leaderboard(l_id INTEGER, m_ids TEXT[])
RETURNS TABLE (rank BIGINT, user_id UUID, display_name TEXT, total_points NUMERIC, movement_times JSONB)
LANGUAGE plpgsql SECURITY DEFINER AS 
$BODY$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY SUM(sh.points) DESC) as rank,
    sh.user_id, 
    COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    SUM(sh.points) as total_points,
    jsonb_object_agg(sh.movement_id, sh.hold_seconds) as movement_times
  FROM public.static_holds sh 
  JOIN public.profiles p ON sh.user_id = p.id
  WHERE sh.movement_id = ANY(m_ids) 
  GROUP BY sh.user_id, p.display_name, p.email
  ORDER BY total_points DESC;
END;
$BODY$;

NOTIFY pgrst, 'reload schema';

-- Grant permissions
REVOKE EXECUTE ON FUNCTION public.get_static_movement_leaderboard(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_static_level_leaderboard(INTEGER, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_static_movement_leaderboard(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_static_level_leaderboard(INTEGER, TEXT[]) TO authenticated, anon;
-- ⚔️ ONLINE CLASH ENGINE SCHEMA
-- Bracket Definitions:
-- Developing: Tiers 3-5
-- Elite: Tiers 6-8

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
    IF user_tier >= 3 AND user_tier <= 5 THEN
        RETURN 'developing';
    ELSIF user_tier >= 6 AND user_tier <= 8 THEN
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
        RAISE EXCEPTION 'You must be at least Tier 3 to start a clash.';
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
-- CHAMPIONS ARENA SCHEMA
-- Stores international calisthenics competitions and pro athlete benchmarks

-- 1. Arena Competitions (e.g., Leap World Series 2024)
CREATE TABLE public.arena_competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    difficulty_tier INTEGER DEFAULT 8, -- Usually Titan/Demigod level
    category TEXT DEFAULT 'strength',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Arena Phases (Quarter, Semi, Final)
CREATE TABLE public.arena_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competition_id UUID REFERENCES public.arena_competitions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- 'Quarter Finals', 'Semi-Finals', 'The Final'
    order_index INTEGER NOT NULL,
    total_pro_benchmark_time INTEGER, -- The record time for this phase
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Arena Workout Steps (The Circuits)
CREATE TABLE public.arena_workout_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phase_id UUID REFERENCES public.arena_phases(id) ON DELETE CASCADE,
    movement_name TEXT NOT NULL,
    reps INTEGER,
    added_weight_kg INTEGER DEFAULT 0,
    is_unbroken BOOLEAN DEFAULT false,
    special_notes TEXT,
    order_index INTEGER NOT NULL
);

-- 4. Arena Pro Results (The Legends)
CREATE TABLE public.arena_pro_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phase_id UUID REFERENCES public.arena_phases(id) ON DELETE CASCADE,
    athlete_name TEXT NOT NULL,
    time_seconds INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. User Arena Attempts
CREATE TABLE public.arena_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES public.arena_phases(id) ON DELETE CASCADE,
    time_seconds INTEGER NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.arena_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_workout_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_pro_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_attempts ENABLE ROW LEVEL SECURITY;

-- Public Read Access for Arena Content
CREATE POLICY "Allow public read access for arena competitions" ON public.arena_competitions FOR SELECT USING (true);
CREATE POLICY "Allow public read access for arena phases" ON public.arena_phases FOR SELECT USING (true);
CREATE POLICY "Allow public read access for arena steps" ON public.arena_workout_steps FOR SELECT USING (true);
CREATE POLICY "Allow public read access for arena pro results" ON public.arena_pro_results FOR SELECT USING (true);

-- User Access for Attempts
CREATE POLICY "Users can view their own arena attempts" ON public.arena_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own arena attempts" ON public.arena_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CHAMPIONS ARENA SEEDING & LEADERBOARD ENGINE

-- 1. SEED DATA (Competitions & Phases)
INSERT INTO public.arena_competitions (id, name, description, difficulty_tier)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6', 'LEAP WORLD SERIES', 'The ultimate international strength circuit.', 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.arena_phases (id, competition_id, name, order_index, pro_benchmark_time)
VALUES 
('phase-q', 'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6', 'QUARTER FINALS', 1, 309),
('phase-s', 'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6', 'SEMI-FINALS', 2, 518),
('phase-f', 'a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6', 'THE FINAL (GAUNTLET)', 3, 735)
ON CONFLICT (id) DO NOTHING;

-- 2. SEED PRO RESULTS
INSERT INTO public.arena_pro_results (phase_id, athlete_name, time_seconds, rank)
VALUES 
-- Quarters
('phase-q', 'Jamie', 309, 1),
('phase-q', 'Sergio', 311, 2),
('phase-q', 'Bruno', 322, 3),
-- Semis
('phase-s', 'Sergio', 518, 1),
('phase-s', 'Jamie', 567, 2),
('phase-s', 'Florian', 576, 3),
('phase-s', 'Tonight', 732, 4),
-- Final
('phase-f', 'Sergio', 735, 1),
('phase-f', 'Jamie', 777, 2)
ON CONFLICT DO NOTHING;

-- 3. UNIFIED LEADERBOARD FUNCTION
-- This function merges Pros and a specific User into one sorted list
CREATE OR REPLACE FUNCTION public.get_arena_worldwide_rankings(p_phase_id UUID, p_user_id UUID)
RETURNS TABLE (
    athlete_name TEXT,
    time_seconds INTEGER,
    is_user BOOLEAN,
    official_rank BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH combined_results AS (
        -- Get Pro Results
        SELECT 
            apr.athlete_name,
            apr.time_seconds,
            false as is_user
        FROM public.arena_pro_results apr
        WHERE apr.phase_id = p_phase_id
        
        UNION ALL
        
        -- Get User's Best Attempt
        SELECT 
            COALESCE(p.name, 'YOU') as athlete_name,
            MIN(aa.time_seconds) as time_seconds,
            true as is_user
        FROM public.arena_attempts aa
        LEFT JOIN public.profiles p ON p.id = aa.user_id
        WHERE aa.phase_id = p_phase_id AND aa.user_id = p_user_id
        GROUP BY p.name, aa.user_id
    )
    SELECT 
        cr.athlete_name,
        cr.time_seconds,
        cr.is_user,
        RANK() OVER (ORDER BY cr.time_seconds ASC) as official_rank
    FROM combined_results cr
    ORDER BY cr.time_seconds ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================
-- WEEKLY CHALLENGE TABLES
-- Run this in your Supabase SQL Editor
-- Safe to re-run: uses IF NOT EXISTS and DROP IF EXISTS
-- ============================================================

-- Weekly challenges table
CREATE TABLE IF NOT EXISTS public.weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  group_id SMALLINT NOT NULL CHECK (group_id IN (1, 2, 3)),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  scoring_type TEXT NOT NULL CHECK (scoring_type IN ('time', 'reps')),
  movements JSONB NOT NULL DEFAULT '[]',
  time_limit INT DEFAULT NULL, -- in minutes, for reps-based challenges
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly entries (leaderboard submissions)
CREATE TABLE IF NOT EXISTS public.weekly_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.weekly_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}', -- Stores breakdown of rounds/reps
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (challenge_id, user_id)  -- one entry per user per challenge (upserted)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe to re-run)
DROP POLICY IF EXISTS "Anyone can read challenges" ON public.weekly_challenges;
DROP POLICY IF EXISTS "Admins manage challenges" ON public.weekly_challenges;
DROP POLICY IF EXISTS "Anyone can read entries" ON public.weekly_entries;
DROP POLICY IF EXISTS "Users manage own entries" ON public.weekly_entries;

-- Everyone can read challenges
CREATE POLICY "Anyone can read challenges"
  ON public.weekly_challenges FOR SELECT
  USING (true);

-- Only admins can insert/update/delete challenges
CREATE POLICY "Admins manage challenges"
  ON public.weekly_challenges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Everyone can read entries (for leaderboard)
CREATE POLICY "Anyone can read entries"
  ON public.weekly_entries FOR SELECT
  USING (true);

-- Users can insert/update their own entries
CREATE POLICY "Users manage own entries"
  ON public.weekly_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ADD is_admin column to profiles if it doesn't exist
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_weekly_challenges_group_week
  ON public.weekly_challenges (group_id, week_start, is_active);

CREATE INDEX IF NOT EXISTS idx_weekly_entries_challenge
  ON public.weekly_entries (challenge_id, score);
-- Fix leaderboard RLS issue
-- This creates a function that bypasses RLS to show all users on leaderboards

-- Create function to get leaderboard for a tier
-- This runs with the privileges of the function owner (postgres), not the calling user
CREATE OR REPLACE FUNCTION public.get_tier_leaderboard(tier_num INTEGER)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  best_time INTEGER,
  total_attempts BIGINT
)
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    th.user_id,
    COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    MIN(th.time_seconds)::INTEGER as best_time,
    COUNT(*)::BIGINT as total_attempts
  FROM public.trial_history th
  JOIN public.profiles p ON th.user_id = p.id
  WHERE th.tier_attempted = tier_num
    AND th.completed = true
  GROUP BY th.user_id, p.display_name, p.email
  ORDER BY best_time ASC;
END;
$$;

-- Grant permissions to authenticated users
REVOKE EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) TO authenticated;

-- Also grant to anon for testing (remove in production if needed)
GRANT EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) TO anon;
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
-- RPC to get the Global Well-Rounded Athlete Leaderboard
-- Formula: Static Mastery + (Power Mastery * 2) + (Endurance Mastery * 2)

DROP FUNCTION IF EXISTS public.get_global_well_rounded_leaderboard();

CREATE OR REPLACE FUNCTION public.get_global_well_rounded_leaderboard()
RETURNS TABLE (
    rank BIGINT,
    user_id UUID,
    display_name TEXT,
    country TEXT,
    static_pts INT,
    power_pts INT,
    endurance_pts INT,
    total_score INT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) DESC) as rank,
        id as user_id,
        profiles.display_name,
        profiles.country,
        COALESCE(statics_tier, 0) as static_pts,
        COALESCE(power_points, 0) as power_pts,
        COALESCE(one_mm_points, 0) as endurance_pts,
        (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) as total_score
    FROM 
        public.profiles
    WHERE 
        (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) > 0
    ORDER BY 
        total_score DESC
    LIMIT 100;
END;
$$;

DROP FUNCTION IF EXISTS public.get_onemm_well_rounded_leaderboard();

CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard()
RETURNS TABLE (
    u_id UUID,
    d_name TEXT,
    country TEXT,
    t_score NUMERIC,
    rnk BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH pattern_peaks AS (
        SELECT 
            omml.user_id,
            CASE 
                WHEN omml.movement_id IN ('knee_push_ups', 'incline_push_ups', 'push_ups') THEN 'push'
                WHEN omml.movement_id IN ('inverted_row', 'assisted_pull_ups', 'pull_ups') THEN 'pull'
                WHEN omml.movement_id IN ('bench_dips', 'dips') THEN 'dip'
                WHEN omml.movement_id IN ('air_squats', 'goblet_squats') THEN 'squat'
                WHEN omml.movement_id IN ('deadlift') THEN 'deadlift'
                WHEN omml.movement_id IN ('muscle_ups') THEN 'muscle_up'
                WHEN omml.movement_id IN ('hspu') THEN 'hspu'
                WHEN omml.movement_id IN ('fl_press') THEN 'fl_press'
                WHEN omml.movement_id IN ('fl_pull_ups') THEN 'fl_pull'
                WHEN omml.movement_id IN ('planche_push_ups') THEN 'planche'
            END as pattern_id,
            MAX(omml.points) as best_points
        FROM public.one_min_max_logs omml
        GROUP BY omml.user_id, pattern_id
    ),
    user_totals AS (
        SELECT 
            pp.user_id,
            SUM(pp.best_points) as total_score
        FROM pattern_peaks pp
        WHERE pp.pattern_id IS NOT NULL
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
$$;
CREATE OR REPLACE FUNCTION public.get_static_well_rounded_leaderboard()
RETURNS TABLE (
    u_id UUID,
    d_name TEXT,
    hs_pts NUMERIC,
    fl_pts NUMERIC,
    bl_pts NUMERIC,
    pl_pts NUMERIC,
    t_score NUMERIC,
    rnk BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH best_per_category AS (
        SELECT 
            sh.user_id,
            CASE 
                WHEN sh.movement_id IN ('wall_handstand', 'freestanding_handstand', 'one_arm_handstand') THEN 'handstand'
                WHEN sh.movement_id IN ('tuck_front_lever', 'straddle_front_lever', 'full_front_lever') THEN 'front_lever'
                WHEN sh.movement_id IN ('tuck_back_lever', 'straddle_back_lever', 'full_back_lever') THEN 'back_lever'
                WHEN sh.movement_id IN ('tuck_planche', 'straddle_planche', 'full_planche') THEN 'planche'
            END as category,
            MAX(sh.points) as best_points
        FROM public.static_holds sh
        GROUP BY sh.user_id, category
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
        DENSE_RANK() OVER (ORDER BY (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) DESC) as rnk
    FROM pivoted pv
    JOIN public.profiles p ON pv.user_id = p.id
    ORDER BY t_score DESC;
END;
$$;

-- Secure RPC to submit initial assessment results
-- Runs with SECURITY DEFINER privileges to bypass RLS/direct-client trigger constraints
CREATE OR REPLACE FUNCTION public.submit_initial_assessment(p_tier INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
  v_locked_until := NOW() + INTERVAL '72 hours';
  
  UPDATE public.profiles
  SET strength_tier = p_tier,
      assessed_at = NOW(),
      assessment_locked_until = v_locked_until,
      updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;

-- Revoke execution from public roles, grant exclusively to authenticated users
REVOKE EXECUTE ON FUNCTION public.submit_initial_assessment(INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_initial_assessment(INT) TO authenticated;

-- =========================================================================
-- Missing Tables & RLS Policies Added for Parity & Auditing (Phase 4)
-- =========================================================================

-- 1. trial_history table
CREATE TABLE IF NOT EXISTS public.trial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_attempted INT NOT NULL,
  time_seconds INT NOT NULL,
  completed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on trial_history
ALTER TABLE public.trial_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for trial_history
CREATE POLICY "Warriors can view their own trial history"
  ON public.trial_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Warriors can insert their own trial history"
  ON public.trial_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS trial_history_user_id_idx ON public.trial_history(user_id);

-- 2. power_assessments table
CREATE TABLE IF NOT EXISTS public.power_assessments (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  power_tier INT DEFAULT 0,
  pullup_1rm NUMERIC DEFAULT 0.0,
  dip_1rm NUMERIC DEFAULT 0.0,
  squat_1rm NUMERIC DEFAULT 0.0,
  muscleup_1rm NUMERIC DEFAULT 0.0,
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on power_assessments
ALTER TABLE public.power_assessments ENABLE ROW LEVEL SECURITY;

-- RLS policies for power_assessments
CREATE POLICY "Warriors can view their own power assessments"
  ON public.power_assessments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Warriors can manage their own power assessments"
  ON public.power_assessments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. one_min_max_logs table
CREATE TABLE IF NOT EXISTS public.one_min_max_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  reps INT NOT NULL,
  points NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on one_min_max_logs
ALTER TABLE public.one_min_max_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for one_min_max_logs
CREATE POLICY "Warriors can view their own one min max logs"
  ON public.one_min_max_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Warriors can insert their own one min max logs"
  ON public.one_min_max_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS one_min_max_logs_user_id_idx ON public.one_min_max_logs(user_id);
CREATE INDEX IF NOT EXISTS one_min_max_logs_movement_id_idx ON public.one_min_max_logs(movement_id);

