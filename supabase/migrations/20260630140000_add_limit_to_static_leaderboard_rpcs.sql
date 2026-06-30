-- All three Static leaderboard RPCs returned every user who has ever
-- logged a hold, unbounded. Same class of issue flagged in the Static
-- World audit (STATIC_WORLD_AUDIT_TASKS.md 🟡 Medium) and already fixed
-- for the 1MM well-rounded leaderboard. Return types are unchanged so
-- CREATE OR REPLACE works without a DROP.

-- Movement leaderboard: top 100 per movement by points
CREATE OR REPLACE FUNCTION public.get_static_movement_leaderboard(m_id text)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, best_time_seconds numeric, points numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT ROW_NUMBER() OVER (ORDER BY sh.points DESC, sh.created_at ASC) as rank,
    sh.user_id,
    COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    sh.hold_seconds as best_time_seconds,
    sh.points
  FROM public.static_holds sh
  JOIN public.profiles p ON sh.user_id = p.id
  WHERE sh.movement_id = m_id
  ORDER BY sh.points DESC
  LIMIT 100;
END;
$function$
;

-- Level leaderboard: top 100 per level (combination of movements)
CREATE OR REPLACE FUNCTION public.get_static_level_leaderboard(l_id integer, m_ids text[])
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, total_points numeric, movement_times jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  ORDER BY total_points DESC
  LIMIT 100;
END;
$function$
;

-- Well-rounded leaderboard: top 100 by cross-category total score.
-- Body is the JOIN-based version from 20260629121000 (static_movements
-- reference table), not the old CASE version from the base schema.
CREATE OR REPLACE FUNCTION public.get_static_well_rounded_leaderboard()
 RETURNS TABLE(u_id uuid, d_name text, hs_pts numeric, fl_pts numeric, bl_pts numeric, pl_pts numeric, t_score numeric, rnk bigint, country text, gender text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH best_per_category AS (
        SELECT sh.user_id, sm.category, MAX(sh.points) as best_points
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
            MAX(CASE WHEN bpc.category = 'planche'     THEN bpc.best_points ELSE 0 END) as pl_pts
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
