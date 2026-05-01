-- Phase 1: The Foundation - Database Schema
-- Run this in your Supabase SQL Editor

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  strength_tier INT DEFAULT 0,
  power_tier INT DEFAULT NULL,
  statics_tier INT DEFAULT NULL,
  glory_score INT DEFAULT 0,
  streak INT DEFAULT 0,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  assessed_at TIMESTAMPTZ,
  assessment_locked_until TIMESTAMPTZ DEFAULT NULL,
  power_assessed_at TIMESTAMPTZ,
  statics_assessed_at TIMESTAMPTZ,
  best_times JSONB DEFAULT '{}',
  trials_attempted INT DEFAULT 0,
  trials_passed INT DEFAULT 0,
  is_public BOOLEAN DEFAULT TRUE,
  push_token TEXT,
  timezone TEXT DEFAULT 'UTC',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Warriors can only access their own profile
CREATE POLICY "Warriors manage own profile"
  ON profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, timezone, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC'),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile when user signs up
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Revoke EXECUTE from anon to prevent REST API access (security warning fix)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- View for public leaderboard (Phase 5)
CREATE VIEW public_leaderboard AS
  SELECT 
    id, 
    display_name, 
    strength_tier, 
    power_tier, 
    statics_tier,
    glory_score, 
    streak, 
    trials_passed, 
    last_active, 
    is_public
  FROM profiles
  WHERE is_public = TRUE
  ORDER BY glory_score DESC;

-- Function to calculate glory score (Phase 4)
CREATE OR REPLACE FUNCTION calculate_glory(
  s_tier INT, 
  p_tier INT, 
  st_tier INT,
  pullups INT, 
  pushups INT, 
  dips INT, 
  mu INT, 
  streak INT
) RETURNS INT
SET search_path = ''
AS $$
BEGIN
  RETURN (
    COALESCE(s_tier,0)*200 + COALESCE(p_tier,0)*150 + COALESCE(st_tier,0)*150 +
    COALESCE(pullups,0)*4 + COALESCE(pushups,0)*2 + COALESCE(dips,0)*3 +
    COALESCE(mu,0)*12 + COALESCE(streak,0)*5
  );
END;
$$ LANGUAGE plpgsql;
