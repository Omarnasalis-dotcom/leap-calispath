-- "Users can view relevant workout logs" had a self-referential tautology
-- (wp.warrior_id = wp.warrior_id, always true) instead of joining against
-- workout_logs.warrior_id. Since RLS policies are OR'd together, this let
-- any coach with at least one client read every warrior's workout logs
-- platform-wide, not just their own clients'.
DROP POLICY IF EXISTS "Users can view relevant workout logs" ON "public"."workout_logs";

CREATE POLICY "Users can view relevant workout logs"
ON "public"."workout_logs"
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  (auth.uid() = warrior_id)
  OR (EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.warrior_id = workout_logs.warrior_id
      AND wp.coach_id = auth.uid()
  ))
);
