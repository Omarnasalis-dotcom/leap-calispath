-- Adds `gender` to get_global_well_rounded_leaderboard so the client no longer
-- needs a second profiles round trip to attach it. LeaderboardService currently
-- issues `profiles.select('id, gender').in('id', userIds)` right after the RPC
-- (the "// RPC lacks it" gender N+1). The function already SELECTs from profiles
-- and already returns `country`, so `gender` is a one-field addition to the same
-- row — killing the extra request.
--
-- Adding a column to a function's RETURNS TABLE(...) is a return-type change,
-- and CREATE OR REPLACE FUNCTION refuses to change an existing function's return
-- type ("cannot change return type of existing function"). So this must DROP
-- then recreate — the same trap the community-filter migrations already hit for
-- their signature changes (see 20260710150000 / 160000 / 180000). The recreate
-- re-declares SECURITY DEFINER (LANGUAGE + body are otherwise identical to
-- 20260710160000, aside from profiles.gender added to the SELECT).
--
-- No GRANT is issued, matching the sibling leaderboard functions: CREATE
-- FUNCTION already grants EXECUTE to PUBLIC and nothing revokes it, so these
-- boards stay publicly readable (anon + authenticated). An explicit grant to
-- `authenticated` would be a no-op that misleadingly implies anon is excluded.
DROP FUNCTION IF EXISTS public.get_global_well_rounded_leaderboard(uuid);

CREATE OR REPLACE FUNCTION public.get_global_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, country text, gender text, static_pts numeric, power_pts numeric, endurance_pts numeric, total_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        ROW_NUMBER() OVER (ORDER BY (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) DESC) as rank,
        id as user_id,
        profiles.display_name,
        profiles.country,
        profiles.gender,
        COALESCE(statics_tier, 0) as static_pts,
        COALESCE(power_points, 0) as power_pts,
        COALESCE(one_mm_points, 0) as endurance_pts,
        (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) as total_score
    FROM
        public.profiles
    WHERE
        (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) > 0
        AND (p_community_id IS NULL OR profiles.community_id = p_community_id)
    ORDER BY
        total_score DESC
    LIMIT 100;
END;
$function$;
