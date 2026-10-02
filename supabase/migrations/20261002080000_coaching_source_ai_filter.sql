-- Coaching analytics: AI Coach programs get their own Source filter.
--
-- coach_matches_source() (20260727180000) backs every p_source filter in
-- admin_get_coaching_analytics / admin_get_client_adherence. 'coach' used
-- to mean "anything not self-selected", which lumped AI Coach programs in
-- with human coaches. Now:
--   NULL     everything
--   'self'   self-selected library programs (coach …0001)
--   'ai'     AI Coach programs               (coach …0002)   — new
--   'coach'  a human coach's programs        (neither)
-- Same signature, so every caller picks it up unchanged.

CREATE OR REPLACE FUNCTION public.coach_matches_source(p_coach_id uuid, p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_source IS NULL
    OR (p_source = 'self' AND p_coach_id = '00000000-0000-0000-0000-000000000001'::uuid)
    OR (p_source = 'ai' AND p_coach_id = '00000000-0000-0000-0000-000000000002'::uuid)
    OR (p_source = 'coach' AND p_coach_id NOT IN (
          '00000000-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000002'::uuid));
$$;
