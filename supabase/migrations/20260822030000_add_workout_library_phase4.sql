-- Phase 4 (Workout Library) data model: an is_free flag for existing
-- library program templates, plus two new tables for the two brand-new
-- content types (single-session "Workouts" and short timed "Quick
-- Workouts"). Both new types share one table with a `kind` discriminator
-- rather than two near-identical tables, since their shape only differs by
-- a couple of quick_workout-only columns.
--
-- Named standalone_workouts/standalone_workout_exercises, not
-- `workouts`/`workout_exercises`, specifically to avoid any confusion with
-- the existing workout_logs/workout_set_logs tables (logged performance
-- against an assigned program — an unrelated concept).
--
-- No authoring UI this pass (browse-only, confirmed) — content is seeded
-- directly via SQL, same bootstrapping approach already used for
-- exercise_library's original rows. So: SELECT-open to authenticated on
-- both new tables (matching program_templates' own library-detail read
-- trust level — there's no DB-level content gating for template details
-- either; enforcement is UI-level, a locked card never triggers the detail
-- fetch), no INSERT/UPDATE/DELETE policy for anyone yet.

ALTER TABLE public.program_templates ADD COLUMN is_free boolean NOT NULL DEFAULT false;

CREATE TABLE public.standalone_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('workout', 'quick_workout')),
  title text NOT NULL,
  description text,
  category text,
  difficulty text CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  format text CHECK (format IN ('amrap', 'emom', 'fortime', 'tabata') OR format IS NULL),
  duration_minutes integer,
  is_free boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.standalone_workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.standalone_workouts(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercise_library(id) ON DELETE CASCADE,
  sets integer,
  reps integer,
  rest_seconds integer,
  hold_seconds integer,
  work_seconds integer,
  is_weighted boolean DEFAULT false,
  order_index integer DEFAULT 0,
  notes text
);

CREATE INDEX standalone_workouts_kind_status_idx ON public.standalone_workouts (kind, status);
CREATE INDEX standalone_workout_exercises_workout_id_idx ON public.standalone_workout_exercises (workout_id);

ALTER TABLE public.standalone_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view published standalone workouts"
  ON public.standalone_workouts
  FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Authenticated users can view standalone workout exercises"
  ON public.standalone_workout_exercises
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.standalone_workouts sw
      WHERE sw.id = workout_id AND sw.status = 'published'
    )
  );
