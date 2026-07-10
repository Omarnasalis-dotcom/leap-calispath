-- Additive read access for the Workout Templates Library: any authenticated
-- user may SELECT a template (and its blocks/exercises) once it is marked
-- is_library_template = true AND status = 'published'.
--
-- This does NOT touch or replace the existing owner/assigned-warrior SELECT
-- policies restored in 20260628194000_restrict_program_templates_select.sql
-- and its program_blocks/block_exercises equivalents. Postgres RLS combines
-- multiple permissive policies for the same command with OR, so this can
-- only widen visibility for published library rows — it cannot narrow or
-- override the existing coach/assigned-warrior scoping for private
-- (non-library) templates, which remain exactly as locked down as before.

create policy "Library templates readable when published"
on "public"."program_templates"
for select
to authenticated
using (is_library_template = true and status = 'published');

create policy "Library template blocks readable when published"
on "public"."program_blocks"
for select
to authenticated
using (
  exists (
    select 1 from program_templates t
    where t.id = program_blocks.template_id
      and t.is_library_template = true
      and t.status = 'published'
  )
);

create policy "Library template exercises readable when published"
on "public"."block_exercises"
for select
to authenticated
using (
  exists (
    select 1
    from program_blocks pb
    join program_templates pt on pt.id = pb.template_id
    where pb.id = block_exercises.block_id
      and pt.is_library_template = true
      and pt.status = 'published'
  )
);
