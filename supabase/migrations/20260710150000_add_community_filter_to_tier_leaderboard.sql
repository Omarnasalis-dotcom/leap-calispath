-- Community feature, phase 3: community-scoped Strength leaderboard.
-- Trailing optional param, same pattern as save_program_template etc. —
-- existing callers with no p_community_id keep today's global behavior.
--
-- Filtering happens INSIDE the query, before LIMIT 100 — filtering the
-- already-limited top-100 result client-side would return empty/near-empty
-- results for any community not already in the global top 100, which is
-- the normal case for a small community. See the audited plan for the
-- full reasoning.
--
-- CREATE OR REPLACE does NOT replace a function whose parameter list
-- changed — Postgres treats a different arg count/types as a distinct
-- overload, so without this DROP the old 1-arg get_tier_leaderboard(int)
-- would keep existing alongside the new 2-arg one. Every caller in this
-- app happens to always pass both args, so it isn't an active bug here,
-- but it's exactly what broke get_global_well_rounded_leaderboard's
-- zero-arg CoachScreen caller in the next migration — fixing it here too
-- rather than leaving a second dead overload in place.
DROP FUNCTION IF EXISTS public.get_tier_leaderboard(integer);

CREATE OR REPLACE FUNCTION public.get_tier_leaderboard(tier_num integer, p_community_id uuid DEFAULT NULL)
 RETURNS TABLE(user_id uuid, display_name text, best_time integer, total_attempts bigint, country text, gender text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    th.user_id,
    p.display_name,
    MIN(th.time_seconds) as best_time,
    COUNT(th.id) as total_attempts,
    p.country,
    p.gender
  FROM trial_history th
  JOIN profiles p ON p.id = th.user_id
  WHERE th.tier_attempted = tier_num
    AND th.completed = true
    AND (p_community_id IS NULL OR p.community_id = p_community_id)
  GROUP BY th.user_id, p.display_name, p.country, p.gender
  ORDER BY best_time ASC
  LIMIT 100;
$function$;
