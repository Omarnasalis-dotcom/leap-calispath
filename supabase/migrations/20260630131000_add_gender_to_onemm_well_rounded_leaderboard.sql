-- get_onemm_well_rounded_leaderboard joined profiles but discarded the
-- gender column from its RETURNS TABLE, forcing the client to issue a
-- second SELECT on profiles for every returned row just to populate gender.
-- Adding gender to the return type eliminates that second round-trip.
-- Postgres requires DROP + recreate when the RETURNS TABLE shape changes.
DROP FUNCTION IF EXISTS public.get_onemm_well_rounded_leaderboard();
CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard()
 RETURNS TABLE(u_id uuid, d_name text, country text, gender text, t_score numeric, rnk bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH pattern_peaks AS (
        SELECT
            omml.user_id,
            om.pattern_id,
            MAX(omml.points) as best_points
        FROM public.one_min_max_logs omml
        JOIN public.onemm_movements om ON om.id = omml.movement_id
        GROUP BY omml.user_id, om.pattern_id
    ),
    user_totals AS (
        SELECT
            pp.user_id,
            SUM(pp.best_points) as total_score
        FROM pattern_peaks pp
        GROUP BY pp.user_id
    )
    SELECT
        p.id as u_id,
        COALESCE(p.display_name, split_part(p.email, '@', 1)) as d_name,
        p.country as country,
        p.gender as gender,
        ut.total_score::NUMERIC as t_score,
        DENSE_RANK() OVER (ORDER BY ut.total_score DESC) as rnk
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    ORDER BY t_score DESC
    LIMIT 100;
END;
$function$
;
