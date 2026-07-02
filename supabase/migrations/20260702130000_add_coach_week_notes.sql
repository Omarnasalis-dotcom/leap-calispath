-- Phase 2 (coach-side viewing): a coach note scoped to one week of a
-- warrior's assigned program — separate from per-block workout_logs, since
-- this is coach-authored context/feedback for the week as a whole, not an
-- annotation on a specific logged session. One row per (warrior_program,
-- week) — editing an existing week's note updates it in place rather than
-- accumulating duplicates.
CREATE TABLE "public"."coach_week_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "warrior_program_id" uuid NOT NULL REFERENCES public.warrior_programs(id) ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "coach_id" uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "note" text NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("warrior_program_id", "week_number")
);

ALTER TABLE "public"."coach_week_notes" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."coach_week_notes" TO "authenticated";

-- Coach who owns the assignment manages that assignment's week notes.
CREATE POLICY "Coaches manage own week notes"
  ON "public"."coach_week_notes"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.id = coach_week_notes.warrior_program_id AND wp.coach_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.id = coach_week_notes.warrior_program_id AND wp.coach_id = auth.uid()
  ));

-- The warrior the note is about can read it (not required by any UI yet,
-- but a coach note "for the week" is naturally meant to reach them —
-- cheap to allow now rather than adding another migration later).
CREATE POLICY "Warriors view their own week notes"
  ON "public"."coach_week_notes"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.id = coach_week_notes.warrior_program_id AND wp.warrior_id = auth.uid()
  ));

-- Admins manage any coach's week notes, matching the override pattern used
-- elsewhere (e.g. delete_coach_week_data's owner-or-admin check).
CREATE POLICY "Admins manage all week notes"
  ON "public"."coach_week_notes"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));
