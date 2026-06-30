-- get_tier_leaderboard had no LIMIT, returning every user who has ever
-- completed a tier. Capped at 100 matching the other leaderboard fixes
-- this session.
CREATE OR REPLACE FUNCTION public.get_tier_leaderboard(tier_num integer)
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
  GROUP BY th.user_id, p.display_name, p.country, p.gender
  ORDER BY best_time ASC
  LIMIT 100;
$function$
;
