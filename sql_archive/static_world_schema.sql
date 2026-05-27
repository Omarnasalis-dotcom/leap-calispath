-- ============================================================
-- STATIC WORLD TABLES
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Table to store individual static hold records
CREATE TABLE IF NOT EXISTS public.static_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_id TEXT NOT NULL,
  hold_seconds NUMERIC NOT NULL,
  points NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, movement_id) -- One record per movement per user (UPSERT logic)
);

-- Row Level Security
ALTER TABLE public.static_holds ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can read holds" ON public.static_holds;
DROP POLICY IF EXISTS "Users manage own holds" ON public.static_holds;

-- Everyone can read holds (for leaderboards)
CREATE POLICY "Anyone can read holds"
  ON public.static_holds FOR SELECT
  USING (true);

-- Users can manage their own holds
CREATE POLICY "Users manage own holds"
  ON public.static_holds FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_static_holds_movement_points
  ON public.static_holds (movement_id, points DESC);

-- ============================================================
-- LEADERBOARD FUNCTIONS FOR STATIC WORLD
-- ============================================================

-- Function to get leaderboard for a specific movement
CREATE OR REPLACE FUNCTION public.get_static_movement_leaderboard(m_id TEXT)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  display_name TEXT,
  best_time_seconds NUMERIC,
  points NUMERIC
)
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY sh.points DESC, sh.created_at ASC) as rank,
    sh.user_id,
    COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    sh.hold_seconds as best_time_seconds,
    sh.points
  FROM public.static_holds sh
  JOIN public.profiles p ON sh.user_id = p.id
  WHERE sh.movement_id = m_id
  ORDER BY sh.points DESC;
END;
$$;

-- Function to get leaderboard for a specific level (sum of points in that level)
CREATE OR REPLACE FUNCTION public.get_static_level_leaderboard(l_id INTEGER, m_ids TEXT[])
RETURNS TABLE (rank BIGINT, user_id UUID, display_name TEXT, total_points NUMERIC, movement_times JSONB)
LANGUAGE plpgsql SECURITY DEFINER AS 
$BODY$
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
  ORDER BY total_points DESC;
END;
$BODY$;

NOTIFY pgrst, 'reload schema';

-- Grant permissions
REVOKE EXECUTE ON FUNCTION public.get_static_movement_leaderboard(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_static_level_leaderboard(INTEGER, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_static_movement_leaderboard(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_static_level_leaderboard(INTEGER, TEXT[]) TO authenticated, anon;
