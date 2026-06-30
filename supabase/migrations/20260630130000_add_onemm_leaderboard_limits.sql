-- get_onemm_well_rounded_leaderboard was rewritten in 20260630121000 to
-- use JOINs against onemm_movements but the LIMIT was never added.
-- Capping at 100 rows matches get_global_well_rounded_leaderboard's
-- existing limit and avoids unbounded result sets as user base grows.
CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard()
 RETURNS TABLE(u_id uuid, d_name text, country text, t_score numeric, rnk bigint)
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
        ut.total_score::NUMERIC as t_score,
        DENSE_RANK() OVER (ORDER BY ut.total_score DESC) as rnk
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    ORDER BY t_score DESC
    LIMIT 100;
END;
$function$
;

-- OneMMService.getCategoryLeaderboard() was pulling every one_min_max_logs
-- row for a category with no DB limit, then aggregating per-user points
-- and slicing to 50 entirely in JS — O(n) JS work growing with every
-- submission ever logged, for any category, by any user. Replaced by a
-- server-side aggregate that does the sum + sort + limit in SQL and only
-- transfers the final 50 rows. Output shape is identical to the JS
-- aggregation it replaces (SUM of all points per user in category, ranked
-- descending, top 50).
CREATE OR REPLACE FUNCTION public.get_onemm_category_leaderboard(p_category_id text)
 RETURNS TABLE(u_id uuid, d_name text, gender text, t_score numeric, rnk bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH user_totals AS (
        SELECT
            omml.user_id,
            SUM(omml.points) as total_score
        FROM public.one_min_max_logs omml
        WHERE omml.category_id = p_category_id
        GROUP BY omml.user_id
    )
    SELECT
        p.id as u_id,
        COALESCE(p.display_name, split_part(p.email, '@', 1)) as d_name,
        p.gender as gender,
        ut.total_score::NUMERIC as t_score,
        DENSE_RANK() OVER (ORDER BY ut.total_score DESC) as rnk
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    ORDER BY t_score DESC
    LIMIT 50;
END;
$function$
;
