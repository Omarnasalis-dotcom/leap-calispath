-- Reusable Live Tournament setups (docs/features/LIVE_TOURNAMENT_PLAN.md).
-- The admin panel saves any live challenge's setup as a template and fills
-- a new challenge from one. Columns mirror live_challenges minus the dates
-- and visibility, which are set each time a challenge is published. Weekly
-- templates (challenge_templates) have one exercise list and no halves, so
-- live ones get their own table, admin-only end to end like that one.
CREATE TABLE public.live_challenge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  -- Same shape as live_challenges.halves. Fully validated when a challenge
  -- is published from it (admin_upsert_live_challenge).
  halves jsonb NOT NULL CHECK (jsonb_typeof(halves) = 'array'),
  rest_sec integer NOT NULL DEFAULT 60 CHECK (rest_sec BETWEEN 0 AND 600),
  team_size smallint NOT NULL CHECK (team_size BETWEEN 1 AND 6),
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_challenge_templates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.live_challenge_templates FROM anon;
REVOKE ALL ON TABLE public.live_challenge_templates FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.live_challenge_templates TO authenticated;

CREATE POLICY "Admins manage live challenge templates"
  ON public.live_challenge_templates
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
