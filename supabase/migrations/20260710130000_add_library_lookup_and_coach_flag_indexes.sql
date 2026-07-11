-- Final coaching-schema audit pass. Two more columns are hit constantly by
-- the self-service library flow specifically — the flow this whole index
-- pass exists to protect against as it grows:
--
-- 1. program_templates(is_library_template, status): filtered on every
--    client recommendation fetch (templateLibrary.ts getRecommendations),
--    every publish's duplicate-check, and is the exact predicate the
--    "Library templates readable when published" RLS policy evaluates on
--    every single read of this table, library or not.
-- 2. profiles(is_coach): the admin-only coach-picker filters added to
--    MyClientsScreen/ProgressTrackingScreen scan this on a table that grows
--    with the whole user base, not just coaches — a plain index is highly
--    selective here since coaches are a small fraction of all profiles.
CREATE INDEX IF NOT EXISTS idx_program_templates_library_status
  ON public.program_templates USING btree (is_library_template, status);

CREATE INDEX IF NOT EXISTS idx_profiles_is_coach
  ON public.profiles USING btree (is_coach);
