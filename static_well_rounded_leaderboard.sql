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
