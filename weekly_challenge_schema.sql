-- ============================================================
-- WEEKLY CHALLENGE TABLES
-- Run this in your Supabase SQL Editor
-- Safe to re-run: uses IF NOT EXISTS and DROP IF EXISTS
-- ============================================================

-- Weekly challenges table
CREATE TABLE IF NOT EXISTS public.weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  group_id SMALLINT NOT NULL CHECK (group_id IN (1, 2, 3)),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  scoring_type TEXT NOT NULL CHECK (scoring_type IN ('time', 'reps')),
  movements JSONB NOT NULL DEFAULT '[]',
  time_limit INT DEFAULT NULL, -- in minutes, for reps-based challenges
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly entries (leaderboard submissions)
CREATE TABLE IF NOT EXISTS public.weekly_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.weekly_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}', -- Stores breakdown of rounds/reps
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (challenge_id, user_id)  -- one entry per user per challenge (upserted)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe to re-run)
DROP POLICY IF EXISTS "Anyone can read challenges" ON public.weekly_challenges;
DROP POLICY IF EXISTS "Admins manage challenges" ON public.weekly_challenges;
DROP POLICY IF EXISTS "Anyone can read entries" ON public.weekly_entries;
DROP POLICY IF EXISTS "Users manage own entries" ON public.weekly_entries;

-- Everyone can read challenges
CREATE POLICY "Anyone can read challenges"
  ON public.weekly_challenges FOR SELECT
  USING (true);

-- Only admins can insert/update/delete challenges
CREATE POLICY "Admins manage challenges"
  ON public.weekly_challenges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Everyone can read entries (for leaderboard)
CREATE POLICY "Anyone can read entries"
  ON public.weekly_entries FOR SELECT
  USING (true);

-- Users can insert/update their own entries
CREATE POLICY "Users manage own entries"
  ON public.weekly_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ADD is_admin column to profiles if it doesn't exist
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_weekly_challenges_group_week
  ON public.weekly_challenges (group_id, week_start, is_active);

CREATE INDEX IF NOT EXISTS idx_weekly_entries_challenge
  ON public.weekly_entries (challenge_id, score);
