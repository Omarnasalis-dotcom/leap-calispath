-- get_static_well_rounded_leaderboard returned hs_pts/fl_pts/bl_pts/pl_pts
-- but not the per-category hold times (hs_time/fl_time/bl_time/pl_time)
-- that StaticService.getWellRoundedLeaderboard() maps on the client side,
-- so those four fields were always 0. Adding MAX(hold_seconds) per category
-- alongside the existing MAX(points), so both are available in one query.
-- RETURNS TABLE shape changes (4 new columns) → must DROP before recreating.
DROP FUNCTION IF EXISTS public.get_static_well_rounded_leaderboard();
CREATE OR REPLACE FUNCTION public.get_static_well_rounded_leaderboard()
 RETURNS TABLE(
   u_id uuid, d_name text,
   hs_pts numeric, fl_pts numeric, bl_pts numeric, pl_pts numeric,
   hs_time numeric, fl_time numeric, bl_time numeric, pl_time numeric,
   t_score numeric, rnk bigint, country text, gender text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH best_per_category AS (
        SELECT
            sh.user_id,
            sm.category,
            MAX(sh.points)       as best_points,
            MAX(sh.hold_seconds) as best_time
        FROM public.static_holds sh
        JOIN public.static_movements sm ON sm.id = sh.movement_id
        GROUP BY sh.user_id, sm.category
    ),
    pivoted AS (
        SELECT
            bpc.user_id,
            MAX(CASE WHEN bpc.category = 'handstand'   THEN bpc.best_points ELSE 0 END) as hs_pts,
            MAX(CASE WHEN bpc.category = 'front_lever' THEN bpc.best_points ELSE 0 END) as fl_pts,
            MAX(CASE WHEN bpc.category = 'back_lever'  THEN bpc.best_points ELSE 0 END) as bl_pts,
            MAX(CASE WHEN bpc.category = 'planche'     THEN bpc.best_points ELSE 0 END) as pl_pts,
            MAX(CASE WHEN bpc.category = 'handstand'   THEN bpc.best_time   ELSE 0 END) as hs_time,
            MAX(CASE WHEN bpc.category = 'front_lever' THEN bpc.best_time   ELSE 0 END) as fl_time,
            MAX(CASE WHEN bpc.category = 'back_lever'  THEN bpc.best_time   ELSE 0 END) as bl_time,
            MAX(CASE WHEN bpc.category = 'planche'     THEN bpc.best_time   ELSE 0 END) as pl_time
        FROM best_per_category bpc
        WHERE bpc.category IS NOT NULL
        GROUP BY bpc.user_id
    )
    SELECT
        p.id as u_id,
        COALESCE(p.display_name, split_part(p.email, '@', 1)) as d_name,
        pv.hs_pts, pv.fl_pts, pv.bl_pts, pv.pl_pts,
        pv.hs_time, pv.fl_time, pv.bl_time, pv.pl_time,
        (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) as t_score,
        DENSE_RANK() OVER (ORDER BY (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) DESC) as rnk,
        p.country,
        p.gender
    FROM pivoted pv
    JOIN public.profiles p ON pv.user_id = p.id
    ORDER BY t_score DESC
    LIMIT 100;
END;
$function$
;
