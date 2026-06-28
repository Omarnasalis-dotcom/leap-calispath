-- "Coaches and admin can manage exercises" was FOR ALL with no created_by
-- check, so any coach could update/delete any other coach's exercises —
-- the UI hides the delete button for non-owned exercises
-- (ExerciseLibraryScreen.tsx:448-449, `isAdmin || (isCoach && isOwner)`),
-- but that's UI-only; the DB allowed it regardless.
--
-- exercise_library.created_by is NULL on any row created before that column
-- existed (legacy data) — for those, "is this someone else's" doesn't apply,
-- so they remain editable by any coach (admins always can, regardless of
-- created_by). This avoids accidentally locking every coach out of legacy
-- catalog entries if such rows exist.
--
-- SELECT stays untouched ("Anyone can view exercises" is intentional — it's
-- a shared catalog). INSERT is unaffected since there's no existing creator
-- to compare against yet.
DROP POLICY IF EXISTS "Coaches and admin can manage exercises" ON "public"."exercise_library";

CREATE POLICY "Coaches and admin can insert exercises"
ON "public"."exercise_library"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND (profiles.is_coach = true OR profiles.is_admin = true)
  )
);

CREATE POLICY "Coaches update own exercises, admins update any"
ON "public"."exercise_library"
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR (created_by IS NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true
  ))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
)
WITH CHECK (
  created_by = auth.uid()
  OR (created_by IS NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true
  ))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
);

CREATE POLICY "Coaches delete own exercises, admins delete any"
ON "public"."exercise_library"
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR (created_by IS NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true
  ))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
);
