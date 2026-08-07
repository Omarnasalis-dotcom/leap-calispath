-- Assistants get full parity on master template management (create/edit/
-- delete/view), matching the coach they're assisting. Pause is checked
-- against the coach being acted for, not the assistant themselves — an
-- assistant's own account is never "paused" (only real coaches are), what
-- matters is whether the coach they're acting on behalf of currently is.
ALTER POLICY "Coaches and assigned warriors can view templates" ON public.program_templates
USING (
  (coach_id = auth.uid())
  OR (EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.template_id = program_templates.id AND wp.warrior_id = auth.uid()
  ))
  OR public.is_assistant_for(coach_id)
);

ALTER POLICY "Coaches can insert templates" ON public.program_templates
WITH CHECK (
  (
    coach_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true)
    AND NOT public.is_coaching_paused(auth.uid())
  )
  OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
);

ALTER POLICY "Coaches can update templates" ON public.program_templates
USING (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
)
WITH CHECK (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
);

ALTER POLICY "Coaches can delete templates" ON public.program_templates
USING (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
);
