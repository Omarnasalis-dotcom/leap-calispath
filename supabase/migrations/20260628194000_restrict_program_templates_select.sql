-- "Anyone authenticated can view templates" was `using (true)`, letting any
-- logged-in user read every coach's program content. The app's client-side
-- `.eq('coach_id', coachId)` filters (useProgramBuilder.ts, MyClientsScreen.tsx)
-- are UX filters only, not a security boundary.
--
-- Legitimate readers, confirmed by tracing every program_templates query in the app:
--   1. The owning coach (useProgramBuilder.ts, MyClientsScreen.tsx) — already
--      covered by the separate "Coaches manage own templates" policy.
--   2. Admins (MyClientsScreen's isAdmin mode) — already covered by the
--      separate "Admin manages all templates" policy.
--   3. A warrior reading the specific template they're assigned to, via the
--      embedded `program_templates:template_id(...)` join in
--      WarriorProgramScreen.tsx — NOT covered by any existing policy, so this
--      is the one case the replacement policy needs to add.
DROP POLICY IF EXISTS "Anyone authenticated can view templates" ON "public"."program_templates";

CREATE POLICY "Coaches and assigned warriors can view templates"
ON "public"."program_templates"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  coach_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.template_id = program_templates.id
      AND wp.warrior_id = auth.uid()
  )
);
