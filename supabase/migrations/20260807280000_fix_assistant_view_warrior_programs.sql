-- Gap caught during local testing: assistants got insert/update parity on
-- warrior_programs but were never granted SELECT — meaning ClientsPage's
-- unfiltered fetch returned zero rows for an assistant, breaking the most
-- basic "view coach's clients" capability (the first, unrestricted line of
-- the permission matrix). Read access should be as open as the coach's own.
ALTER POLICY "Users can view warrior programs" ON public.warrior_programs
USING (
  coach_id = auth.uid()
  OR warrior_id = auth.uid()
  OR public.is_assistant_for(coach_id)
);
