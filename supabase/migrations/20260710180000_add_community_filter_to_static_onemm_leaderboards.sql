-- Community feature, phase 5: community-scoped Static + 1MM leaderboards.
-- Same trailing p_community_id param, filter-before-LIMIT, and explicit
-- DROP FUNCTION (a changed parameter list is a new overload, not a
-- replacement — see 20260710160000 for the bug this caught) pattern as
-- phases 3-4.
--
-- get_onemm_well_rounded_leaderboard has two callers: OneMMService.
-- getLeaderboard('overall') (feeds the visible leaderboard, gets the new
-- param wired up) and OneMMService.getGloryRank (feeds a user's own "your
-- rank" stat on OneMinMaxScreen/PowerWorldScreen) — left calling with no
-- p_community_id, same "personal rank context stays global" reasoning as
-- CoachScreen's WRA carve-out in phase 4.

DROP FUNCTION IF EXISTS public.get_static_movement_leaderboard(text);
CREATE OR REPLACE FUNCTION public.get_static_movement_leaderboard(m_id text, p_community_id uuid DEFAULT NULL)
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
    AND (p_community_id IS NULL OR p.community_id = p_community_id)
  ORDER BY sh.points DESC
  LIMIT 100;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_static_level_leaderboard(integer, text[]);
CREATE OR REPLACE FUNCTION public.get_static_level_leaderboard(l_id integer, m_ids text[], p_community_id uuid DEFAULT NULL)
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
    AND (p_community_id IS NULL OR p.community_id = p_community_id)
  GROUP BY sh.user_id, p.display_name, p.email
  ORDER BY total_points DESC
  LIMIT 100;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_static_well_rounded_leaderboard();
CREATE OR REPLACE FUNCTION public.get_static_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL)
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
    WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
    ORDER BY t_score DESC
    LIMIT 100;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_onemm_well_rounded_leaderboard();
CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL)
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
    WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
    ORDER BY t_score DESC
    LIMIT 100;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_onemm_category_leaderboard(text);
CREATE OR REPLACE FUNCTION public.get_onemm_category_leaderboard(p_category_id text, p_community_id uuid DEFAULT NULL)
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
    WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
    ORDER BY t_score DESC
    LIMIT 50;
END;
$function$;
