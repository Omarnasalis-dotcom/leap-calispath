-- Admin authoring access for standalone_workouts/standalone_workout_exercises
-- (Workouts + Quick Workouts) — Phase 4 shipped these with SELECT-only RLS
-- and zero write path (content was seeded by hand-written SQL). This adds
-- the same admin-only authoring model library Program templates already
-- have (supabase/migrations/20260807310000_restrict_library_templates_to_admin.sql):
-- an admin FOR ALL RLS policy (covers "see every status, not just
-- published" + plain-delete) plus one SECURITY DEFINER RPC for the atomic
-- "workout row + its ordered exercise list, replaced as one unit" save,
-- modeled on save_program_template's own replace-in-place approach.

CREATE POLICY "Admin manages all standalone workouts"
  ON public.standalone_workouts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin manages all standalone workout exercises"
  ON public.standalone_workout_exercises FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.save_standalone_workout(
  p_workout_id uuid,           -- NULL = create new
  p_kind text,                 -- 'workout' | 'quick_workout'
  p_title text,
  p_description text,
  p_category text,
  p_difficulty text,
  p_format text,                -- quick_workout only, else NULL
  p_duration_minutes integer,   -- quick_workout only, else NULL
  p_is_free boolean,
  p_status text,                -- 'draft' | 'published' | 'archived'
  p_exercises jsonb             -- [{exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index}, ...]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workout_id uuid;
  v_ex jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_workout_id IS NULL THEN
    INSERT INTO standalone_workouts (kind, title, description, category, difficulty, format, duration_minutes, is_free, status, created_by)
    VALUES (p_kind, p_title, p_description, p_category, p_difficulty, p_format, p_duration_minutes, p_is_free, p_status, auth.uid())
    RETURNING id INTO v_workout_id;
  ELSE
    UPDATE standalone_workouts
    SET kind = p_kind, title = p_title, description = p_description, category = p_category,
        difficulty = p_difficulty, format = p_format, duration_minutes = p_duration_minutes,
        is_free = p_is_free, status = p_status
    WHERE id = p_workout_id
    RETURNING id INTO v_workout_id;
    IF v_workout_id IS NULL THEN
      RAISE EXCEPTION 'Workout not found: %', p_workout_id;
    END IF;
    DELETE FROM standalone_workout_exercises WHERE workout_id = v_workout_id;
  END IF;

  FOR v_ex IN SELECT * FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb))
  LOOP
    INSERT INTO standalone_workout_exercises
      (workout_id, exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index)
    VALUES (
      v_workout_id,
      (v_ex->>'exercise_id')::uuid,
      (v_ex->>'sets')::int, (v_ex->>'reps')::int, (v_ex->>'rest_seconds')::int,
      (v_ex->>'hold_seconds')::int, (v_ex->>'work_seconds')::int,
      COALESCE((v_ex->>'is_weighted')::boolean, false),
      v_ex->>'notes',
      COALESCE((v_ex->>'order_index')::int, 0)
    );
  END LOOP;

  RETURN v_workout_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_standalone_workout(uuid, text, text, text, text, text, text, integer, boolean, text, jsonb) TO authenticated;
