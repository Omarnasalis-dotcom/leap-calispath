-- No indexes existed beyond primary keys on the FK columns every coaching
-- screen filters/joins on. Fine at today's row counts, but every
-- self-service library selection (select_library_template) and every coach
-- assignment/edit clones a fresh program_templates + program_blocks +
-- block_exercises set, so these tables grow specifically as usage grows —
-- exactly the columns that will start showing up as sequential scans first.
-- Purely additive: no data, no query behavior, no RLS/permission changes.
CREATE INDEX IF NOT EXISTS idx_warrior_programs_coach_id ON public.warrior_programs USING btree (coach_id);
CREATE INDEX IF NOT EXISTS idx_warrior_programs_warrior_id ON public.warrior_programs USING btree (warrior_id);
CREATE INDEX IF NOT EXISTS idx_warrior_programs_template_id ON public.warrior_programs USING btree (template_id);

CREATE INDEX IF NOT EXISTS idx_program_templates_coach_id ON public.program_templates USING btree (coach_id);
CREATE INDEX IF NOT EXISTS idx_program_templates_source_library_template_id ON public.program_templates USING btree (source_library_template_id);

CREATE INDEX IF NOT EXISTS idx_program_blocks_template_id ON public.program_blocks USING btree (template_id);

CREATE INDEX IF NOT EXISTS idx_block_exercises_block_id ON public.block_exercises USING btree (block_id);
