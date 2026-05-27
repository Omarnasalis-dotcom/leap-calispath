-- Fix leaderboard RLS issue
-- This creates a function that bypasses RLS to show all users on leaderboards

-- Create function to get leaderboard for a tier
-- This runs with the privileges of the function owner (postgres), not the calling user
CREATE OR REPLACE FUNCTION public.get_tier_leaderboard(tier_num INTEGER)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  best_time INTEGER,
  total_attempts BIGINT
)
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    th.user_id,
    COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    MIN(th.time_seconds)::INTEGER as best_time,
    COUNT(*)::BIGINT as total_attempts
  FROM public.trial_history th
  JOIN public.profiles p ON th.user_id = p.id
  WHERE th.tier_attempted = tier_num
    AND th.completed = true
  GROUP BY th.user_id, p.display_name, p.email
  ORDER BY best_time ASC;
END;
$$;

-- Grant permissions to authenticated users
REVOKE EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) TO authenticated;

-- Also grant to anon for testing (remove in production if needed)
GRANT EXECUTE ON FUNCTION public.get_tier_leaderboard(INTEGER) TO anon;
