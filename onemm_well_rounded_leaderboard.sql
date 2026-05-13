CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard()
RETURNS TABLE (
    u_id UUID,
    d_name TEXT,
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
        ut.total_score as t_score,
        DENSE_RANK() OVER (ORDER BY ut.total_score DESC) as rnk
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    ORDER BY t_score DESC;
END;
$$;
