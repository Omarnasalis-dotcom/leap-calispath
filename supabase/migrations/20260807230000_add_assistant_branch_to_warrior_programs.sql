-- Assistants get insert (new assignments — the actual gating on "no
-- existing active assignment" happens inside assign_program_template, not
-- here) and update (status changes) parity. Deliberately NOT touching
-- "Coaches can delete warrior programs" or "Coaches manage their
-- assignments" (a FOR ALL policy that independently covers delete for the
-- coach) — deleting a client relationship stays coach/admin only, per the
-- permission matrix.
ALTER POLICY "Coaches can insert warrior programs" ON public.warrior_programs
WITH CHECK (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
);

-- Covers both the coach/assistant updating (e.g. pause/activate/complete
-- status) and the warrior updating their own row (e.g. current_week
-- progress) — the warrior branch is untouched.
ALTER POLICY "Users can update warrior programs" ON public.warrior_programs
USING (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
  OR warrior_id = auth.uid()
)
WITH CHECK (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
  OR warrior_id = auth.uid()
);
