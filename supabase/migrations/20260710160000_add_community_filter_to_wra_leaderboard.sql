-- Community feature, phase 4: community-scoped Well-Rounded (WRA) leaderboard.
-- Same trailing-optional-param, filter-before-LIMIT pattern as phase 3's
-- get_tier_leaderboard.
--
-- get_global_well_rounded_leaderboard has two callers: ProfileScreen's WRA
-- modal (gets the new param, wired up in this phase) and CoachScreen.tsx's
-- AI-coach context (deliberately left calling with no p_community_id, per
-- the audited plan — the AI's sense of "where you rank" should stay global,
-- not narrow to a small community).
--
-- CREATE OR REPLACE does not replace a function whose parameter list
-- changed (see get_tier_leaderboard in the previous migration for the full
-- explanation) — without this DROP, the old zero-arg version would keep
-- existing alongside the new one-arg version, and CoachScreen's genuinely
-- still-zero-arg call would become ambiguous between the two and error.
-- Caught by testing that exact call shape before this shipped.
DROP FUNCTION IF EXISTS public.get_global_well_rounded_leaderboard();

CREATE OR REPLACE FUNCTION public.get_global_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, country text, static_pts numeric, power_pts numeric, endurance_pts numeric, total_score numeric)
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
