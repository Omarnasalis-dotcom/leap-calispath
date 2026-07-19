-- Admin web control panel, phase 2: reusable weekly-challenge templates.
-- The admin panel's bulk week editor can save a challenge as a template and
-- prefill any group/week from one — replacing the fully-manual re-typing
-- flow. Columns mirror weekly_challenges minus week_start/is_active (those
-- are instantiation-time, set when a template is applied to a week).
CREATE TABLE public.challenge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                -- template label, e.g. "Push Endurance A"
  group_id integer,                  -- 1|2|3, or NULL = usable for any group
  title text NOT NULL,
  description text,
  scoring_type text NOT NULL CHECK (scoring_type IN ('time', 'reps')),
  movements jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{name, reps, points}]
  time_limit integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;

-- Same default-privilege hygiene as communities/admin_audit_log: revoke the
-- ambient project-level grant, then grant only what the panel needs. This
-- is an admin-only table end to end.
REVOKE ALL ON TABLE public.challenge_templates FROM anon;
REVOKE ALL ON TABLE public.challenge_templates FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.challenge_templates TO authenticated;

CREATE POLICY "Admins manage challenge templates"
  ON public.challenge_templates
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
