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
