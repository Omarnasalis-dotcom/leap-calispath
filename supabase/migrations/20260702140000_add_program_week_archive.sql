-- Program assignment overhaul: a coach can now add weeks to a client's
-- existing program (append), replace it entirely (overwrite, destructive),
-- or archive the current weeks and add new ones on top (archive). This
-- table backs the "archive" option — a row's presence means that
-- (template_id, week_number) is hidden from the warrior's active view.
-- Nothing about archiving deletes data: workout_logs, workout_set_logs,
-- coach_week_notes, program_blocks/block_exercises for an archived week
-- all stay fully intact, readable by the coach (ProgressTrackingScreen and
-- the export builder deliberately ignore this table) — only the warrior's
-- WarriorProgramScreen week list filters it out.
CREATE TABLE "public"."program_week_archive" (
  "template_id" uuid NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "archived_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("template_id", "week_number")
);

ALTER TABLE "public"."program_week_archive" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON TABLE "public"."program_week_archive" TO "authenticated";

-- Coach who owns the template manages its archive rows directly (the RPCs
-- below also write here, but keeping direct-table access consistent with
-- the rest of this schema rather than routing everything through RPCs).
CREATE POLICY "Coaches manage own template week archive"
  ON "public"."program_week_archive"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.program_templates pt
    WHERE pt.id = program_week_archive.template_id AND pt.coach_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.program_templates pt
    WHERE pt.id = program_week_archive.template_id AND pt.coach_id = auth.uid()
  ));

-- Warriors need to read this to filter their own program's week list.
CREATE POLICY "Warriors view their own program week archive"
  ON "public"."program_week_archive"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.template_id = program_week_archive.template_id AND wp.warrior_id = auth.uid()
  ));

CREATE POLICY "Admins manage all template week archives"
  ON "public"."program_week_archive"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));
