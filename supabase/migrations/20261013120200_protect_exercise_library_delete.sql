-- Audit 2026-10-13: deleting an exercise_library row CASCADE-removed it from
-- every athlete's program (block_exercises) and every standalone workout, with
-- no warning, and any coach (not just the owner) could delete the shared
-- built-in exercises (created_by IS NULL).

-- 1. An exercise that is referenced by a program or workout can no longer be
--    hard-deleted: the delete fails loudly instead of silently stripping the
--    exercise out of live programs. (workout_set_logs keeps ON DELETE SET NULL
--    so historical logs are unaffected.)
ALTER TABLE public.block_exercises
  DROP CONSTRAINT block_exercises_exercise_id_fkey;
ALTER TABLE public.block_exercises
  ADD CONSTRAINT block_exercises_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE RESTRICT;

ALTER TABLE public.standalone_workout_exercises
  DROP CONSTRAINT standalone_workout_exercises_exercise_id_fkey;
ALTER TABLE public.standalone_workout_exercises
  ADD CONSTRAINT standalone_workout_exercises_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE RESTRICT;

-- 2. Only admins may delete the shared built-in exercises (created_by IS NULL).
--    Coaches may still delete exercises they created themselves.
DROP POLICY IF EXISTS "Coaches delete own exercises, admins delete any" ON public.exercise_library;
CREATE POLICY "Coaches delete own exercises, admins delete any"
  ON public.exercise_library
  FOR DELETE TO authenticated
  USING (
    ((created_by = auth.uid()) AND (NOT public.is_coaching_paused(auth.uid())))
    OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  );
