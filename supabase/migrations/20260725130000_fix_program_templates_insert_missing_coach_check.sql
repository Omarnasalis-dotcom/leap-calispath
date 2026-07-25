-- program_templates' INSERT RLS only checked coach_id = auth.uid(), never
-- is_coach = true, so any authenticated non-coach account could insert a
-- self-owned template row. Confirmed exploitable locally: an
-- is_coach = false test account successfully inserted into program_templates
-- with coach_id set to its own uid.
--
-- Patching just "Coaches can insert templates" is not enough on its own:
-- "Coaches manage own templates" (FOR ALL, using (coach_id = auth.uid()),
-- no WITH CHECK) is a second permissive policy that also covers INSERT —
-- Postgres combines multiple permissive policies for the same command with
-- OR, and a FOR ALL policy with no explicit WITH CHECK reuses its USING
-- expression as the check for new rows. So it independently permits the same
-- unrestricted insert regardless of how the INSERT-specific policy is
-- tightened. Confirmed locally: after only patching the INSERT policy, the
-- non-coach insert still succeeded via this second policy.
--
-- "Coaches manage own templates" is otherwise fully redundant: SELECT is
-- already covered by "Coaches and assigned warriors can view templates",
-- UPDATE by "Coaches can update templates", DELETE by "Coaches can delete
-- templates" — all coach_id = auth.uid() scoped. Dropping it entirely and
-- replacing the INSERT policy with an is_coach-checked version closes the
-- gap without touching legitimate coach SELECT/UPDATE/DELETE access. Same
-- pattern as the program_blocks / exercise_library FOR ALL cleanups in the
-- 2026-06-29 coaching audit.
--
-- Re-tested locally after this fix: non-coach insert blocked (42501),
-- non-coach impersonating another coach's coach_id still blocked, real
-- coach insert/select/update/delete on their own templates unaffected,
-- unrelated coach still blocked from updating another coach's template.

DROP POLICY IF EXISTS "Coaches manage own templates" ON "public"."program_templates";

DROP POLICY IF EXISTS "Coaches can insert templates" ON "public"."program_templates";

CREATE POLICY "Coaches can insert templates"
ON "public"."program_templates"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  coach_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_coach = true
  )
);
