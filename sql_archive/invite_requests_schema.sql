-- ============================================================
-- INVITE REQUESTS SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Create the invite requests table
CREATE TABLE IF NOT EXISTS public.invite_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE, -- Unique constraint prevents duplicate requests from the same email
  instagram TEXT,
  phone TEXT, -- Optional mobile phone number
  experience TEXT CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
  why_join TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.invite_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe for re-runs)
DROP POLICY IF EXISTS "Anyone can submit invite requests" ON public.invite_requests;
DROP POLICY IF EXISTS "Admins manage invite requests" ON public.invite_requests;

-- Policy 1: Allow anyone (unauthenticated users) to submit the request form
CREATE POLICY "Anyone can submit invite requests" 
  ON public.invite_requests FOR INSERT 
  WITH CHECK (true);

-- Policy 2: Allow only admins to select, update, or delete requests
CREATE POLICY "Admins manage invite requests" 
  ON public.invite_requests FOR ALL 
  TO authenticated
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

-- Index on email to optimize lookup times for duplicate checks
CREATE INDEX IF NOT EXISTS idx_invite_requests_email ON public.invite_requests (email);

-- ALTER TABLE statement to update existing tables in Supabase:
-- Run this single line if you already created the table previously:
-- ALTER TABLE public.invite_requests ADD COLUMN IF NOT EXISTS phone TEXT;

