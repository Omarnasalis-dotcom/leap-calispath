CREATE OR REPLACE FUNCTION public.get_static_well_rounded_leaderboard()
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    handstand_points NUMERIC,
    front_lever_points NUMERIC,
    back_lever_points NUMERIC,
    planche_points NUMERIC,
    total_points NUMERIC,
    rank BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH movement_points AS (
        SELECT 
            sl.user_id,
            CASE 
                WHEN sl.movement_id IN ('wall_handstand', 'freestanding_handstand', 'one_arm_handstand') THEN 'handstand'
                WHEN sl.movement_id IN ('tuck_front_lever', 'straddle_front_lever', 'full_front_lever') THEN 'front_lever'
                WHEN sl.movement_id IN ('tuck_back_lever', 'straddle_back_lever', 'full_back_lever') THEN 'back_lever'
                WHEN sl.movement_id IN ('tuck_planche', 'straddle_planche', 'full_planche') THEN 'planche'
            END as category,
            sl.points
        FROM public.static_logs sl
    ),
    best_per_category AS (
        SELECT 
            mp.user_id,
            mp.category,
            MAX(mp.points) as best_points
        FROM movement_points mp
        WHERE mp.category IS NOT NULL
        GROUP BY mp.user_id, mp.category
    ),
    pivoted AS (
        SELECT 
            bpc.user_id,
            COALESCE(MAX(CASE WHEN bpc.category = 'handstand' THEN bpc.best_points END), 0) as handstand_pts,
            COALESCE(MAX(CASE WHEN bpc.category = 'front_lever' THEN bpc.best_points END), 0) as front_lever_pts,
            COALESCE(MAX(CASE WHEN bpc.category = 'back_lever' THEN bpc.best_points END), 0) as back_lever_pts,
            COALESCE(MAX(CASE WHEN bpc.category = 'planche' THEN bpc.best_points END), 0) as planche_pts
        FROM best_per_category bpc
        GROUP BY bpc.user_id
    )
    SELECT 
        p.id as user_id,
        p.display_name,
        pv.handstand_pts,
        pv.front_lever_pts,
        pv.back_lever_pts,
        pv.planche_pts,
        (pv.handstand_pts + pv.front_lever_pts + pv.back_lever_pts + pv.planche_pts) as total_score,
        DENSE_RANK() OVER (ORDER BY (pv.handstand_pts + pv.front_lever_pts + pv.back_lever_pts + pv.planche_pts) DESC) as rank
    FROM pivoted pv
    JOIN public.profiles p ON pv.user_id = p.id
    ORDER BY total_score DESC;
END;
$$;
