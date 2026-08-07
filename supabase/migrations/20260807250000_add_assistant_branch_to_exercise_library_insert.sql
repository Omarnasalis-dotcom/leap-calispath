-- Add-only for assistants: the insert policy gains an assistant branch,
-- checked against created_by (the admin-web client sets created_by to the
-- coach being assisted, not the assistant's own id, so the new exercise
-- lands in the coach's library). Update/delete policies are deliberately
-- left untouched — no assistant branch there at all.
ALTER POLICY "Coaches and admin can insert exercises" ON public.exercise_library
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND ((profiles.is_coach = true AND NOT public.is_coaching_paused(auth.uid())) OR profiles.is_admin = true)
  )
  OR (public.is_assistant_for(created_by) AND NOT public.is_coaching_paused(created_by))
);
