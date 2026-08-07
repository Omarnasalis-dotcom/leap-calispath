-- Gap found live: program_templates itself got an assistant branch in
-- 20260807220000, but its child tables — program_blocks and
-- block_exercises, which hold the actual week/day/block/exercise content —
-- never did. loadTemplateWeeks() reads these two tables directly (no RPC),
-- so an assistant opening a client's program saw a blank grid; and
-- save_program_template is SECURITY INVOKER (no internal auth checks of its
-- own), so its block/exercise writes ride these same RLS policies too.
--
-- Each table has a FOR ALL "Coaches manage ..." policy that already covers
-- SELECT/INSERT/UPDATE/DELETE for the owning coach — extending that one
-- policy per table is sufficient (RLS OR's permissive policies, so the
-- narrower per-command policies alongside it don't need touching; they
-- already grant nothing extra beyond what the FOR ALL policy covers).
ALTER POLICY "Coaches manage blocks" ON public.program_blocks
USING (
  EXISTS (
    SELECT 1 FROM public.program_templates
    WHERE program_templates.id = program_blocks.template_id
      AND (
        program_templates.coach_id = auth.uid()
        OR public.is_assistant_for(program_templates.coach_id)
      )
  )
);

ALTER POLICY "Coaches manage block exercises" ON public.block_exercises
USING (
  EXISTS (
    SELECT 1 FROM public.program_blocks pb
    JOIN public.program_templates pt ON pt.id = pb.template_id
    WHERE pb.id = block_exercises.block_id
      AND (
        pt.coach_id = auth.uid()
        OR public.is_assistant_for(pt.coach_id)
      )
  )
);
