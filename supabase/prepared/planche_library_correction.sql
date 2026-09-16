-- ============================================================================
-- PREPARED, NOT RUN. Lives in supabase/prepared/, not supabase/migrations/,
-- specifically so `supabase db push` / `migration list` never scan it by
-- accident (both only look inside supabase/migrations/). To actually apply
-- this: review the safety-check output below, then copy it into a new file
-- in supabase/migrations/ with a real timestamp prefix.
--
-- Column names for the two INSERTs below (category, subcategory, difficulty)
-- are INFERRED from how other code in this repo talks about exercise_library
-- (the design spec's "exercise_library category + subcategory", "library
-- difficulty" tags; get_program_structure.ts/blockHelpers.ts only ever
-- select `id, name` directly) — no CREATE TABLE for exercise_library exists
-- anywhere in supabase/migrations (it predates the migration history), and
-- this session has no live read access to confirm the real column list or
-- any other NOT NULL columns/constraints. Check the real schema in the
-- Supabase dashboard before running this.
-- ============================================================================
--
-- Planche correction, approved structure (2026-09-16):
--   Prerequisite, unchanged: Planche Lean Hold, Planche Lean parallet.
--   Grid Tuck -> Advanced Tuck -> Straddle -> Full, methods Hold -> Push Ups -> Press.
--   Tuck's Hold step keeps its existing irregular name "Tuck Planche" (no rename).
--
-- What this does, in order:
--   1. SAFETY CHECK (aborts the whole migration via RAISE EXCEPTION if it
--      finds anything) — refuses to touch a row that a real athlete's
--      program or a published Workout Library day actually references.
--      If it aborts, that specific exercise needs a manual decision
--      (migrate the reference first, or leave that one row alone) before
--      this can run as written.
--   2. Add the 4 new "... Planche Push Ups" rows.
--   3. Rename the 3 "... Planche Lean Hold" rows (Advanced Tuck, Straddle,
--      Full) to "... Planche Hold".
--   4. Merge "full Planche" (legacy duplicate) into the row renamed in step
--      3 ("Full Planche Hold") — repoint any reference, then delete it.
--      A no-op if "full Planche" doesn't exist under that exact name.
--   5. Remove the 4 "... Planche Lean" rows — safe by this point, since the
--      safety check already confirmed zero real usage.

DO $$
DECLARE
  v_usage_count integer;
  v_row record;
  v_names_to_check text[] := ARRAY[
    'Planche Lean', 'Advanced Tuck Planche Lean', 'Straddle Planche Lean', 'Full Planche Lean', 'full Planche'
  ];
BEGIN
  FOR v_row IN SELECT id, name FROM public.exercise_library WHERE name = ANY(v_names_to_check)
  LOOP
    SELECT count(*) INTO v_usage_count FROM public.block_exercises WHERE exercise_id = v_row.id;
    IF v_usage_count > 0 THEN
      RAISE EXCEPTION 'Aborting: "%" (id %) is used in % program_blocks row(s) — a real athlete''s program references this exercise. Decide how to handle it before running this migration.', v_row.name, v_row.id, v_usage_count;
    END IF;

    SELECT count(*) INTO v_usage_count FROM public.standalone_workout_exercises WHERE exercise_id = v_row.id;
    IF v_usage_count > 0 THEN
      RAISE EXCEPTION 'Aborting: "%" (id %) is used in % standalone_workout_exercises row(s) — a published Workout Library day references this exercise. Decide how to handle it before running this migration.', v_row.name, v_row.id, v_usage_count;
    END IF;
  END LOOP;
END $$;

-- 2. New Push Ups rows — column list/values inferred, see header note.
INSERT INTO public.exercise_library (name, category, subcategory, difficulty)
VALUES
  ('Tuck Planche Push Ups', 'PUSH', 'Skill', 'advanced'),
  ('Advanced Tuck Planche Push Ups', 'PUSH', 'Skill', 'advanced'),
  ('Straddle Planche Push Ups', 'PUSH', 'Skill', 'advanced'),
  ('Full Planche Push Ups', 'PUSH', 'Skill', 'advanced');

-- 3. Rename Lean Hold -> Hold for the 3 non-Tuck positions. Tuck's own
--    Hold step ("Tuck Planche") is untouched — it never had "Lean" in it.
UPDATE public.exercise_library SET name = 'Advanced Tuck Planche Hold' WHERE name = 'Advanced Tuck Planche Lean Hold';
UPDATE public.exercise_library SET name = 'Straddle Planche Hold' WHERE name = 'Straddle Planche Lean Hold';
UPDATE public.exercise_library SET name = 'Full Planche Hold' WHERE name = 'Full Planche Lean Hold';

-- 4. Merge "full Planche" (legacy duplicate) into "Full Planche Hold"
--    (renamed in step 3). Guarded by the safety check above — this only
--    matters if "full Planche" had zero real usage to repoint, which the
--    check already confirmed by the time execution reaches here.
DO $$
DECLARE
  v_old_id uuid;
  v_new_id uuid;
BEGIN
  SELECT id INTO v_old_id FROM public.exercise_library WHERE name = 'full Planche';
  SELECT id INTO v_new_id FROM public.exercise_library WHERE name = 'Full Planche Hold';

  IF v_old_id IS NOT NULL AND v_new_id IS NOT NULL THEN
    UPDATE public.block_exercises SET exercise_id = v_new_id WHERE exercise_id = v_old_id;
    UPDATE public.standalone_workout_exercises SET exercise_id = v_new_id WHERE exercise_id = v_old_id;
    DELETE FROM public.exercise_library WHERE id = v_old_id;
  END IF;
END $$;

-- 5. Remove the 4 "... Planche Lean" rows.
DELETE FROM public.exercise_library WHERE name IN (
  'Planche Lean', 'Advanced Tuck Planche Lean', 'Straddle Planche Lean', 'Full Planche Lean'
);
