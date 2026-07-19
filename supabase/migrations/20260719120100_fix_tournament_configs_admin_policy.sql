-- Admin web control panel, phase 0: tournament_configs writes were gated
-- by a hardcoded email in the JWT ("Only omarnasalis can manage configs",
-- base schema 20260614102615 line ~3684) rather than profiles.is_admin —
-- the only admin surface in the app not expressed through the is_admin
-- flag. That coupling means a second admin (or the first admin changing
-- their email) silently loses tournament management. Replace it with the
-- standard is_admin gate, same hardening pattern as the
-- add_auth_checks_to_* migrations.
--
-- "Public Read Configs" (SELECT using true) is intentionally kept — config
-- visibility is public by design (the app shows upcoming tournaments to
-- everyone).
DROP POLICY IF EXISTS "Only omarnasalis can manage configs" ON public.tournament_configs;

CREATE POLICY "Admins manage tournament configs"
  ON public.tournament_configs
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
