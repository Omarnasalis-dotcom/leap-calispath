-- RPC to get the Global Well-Rounded Athlete Leaderboard
-- Formula: Static Mastery + (Power Mastery * 2) + (Endurance Mastery * 2)

CREATE OR REPLACE FUNCTION public.get_global_well_rounded_leaderboard()
RETURNS TABLE (
    rank BIGINT,
    user_id UUID,
    display_name TEXT,
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
        ROW_NUMBER() OVER (ORDER BY (COALESCE(statics_tier, 0) + (COALESCE(power_points, 0) * 2) + (COALESCE(one_mm_points, 0) * 2)) DESC) as rank,
        id as user_id,
        profiles.display_name,
        COALESCE(statics_tier, 0) as static_pts,
        COALESCE(power_points, 0) * 2 as power_pts,
        COALESCE(one_mm_points, 0) * 2 as endurance_pts,
        (COALESCE(statics_tier, 0) + (COALESCE(power_points, 0) * 2) + (COALESCE(one_mm_points, 0) * 2)) as total_score
    FROM 
        public.profiles
    WHERE 
        (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) > 0
    ORDER BY 
        total_score DESC
    LIMIT 100;
END;
$$;
