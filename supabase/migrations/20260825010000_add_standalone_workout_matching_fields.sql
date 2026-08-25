-- Rebuild plan Phase 1 (docs/features/ai-coach-rebuild-plan.md): the AI
-- Coach rebuild matches an athlete to a day from the Workout Library by
-- goal and tier. Neither field exists yet — category ('PUSH') and
-- difficulty (beginner/intermediate/advanced) are the only filters today,
-- confirmed against the live WorkoutLibraryScreen filter UI, which has no
-- skill-focus control at all.
--
-- goal_tags is a real enum-constrained array, not free text. The app's
-- OTHER library system (program_templates.matching_criteria->>'goal') is
-- free text matched by exact jsonb containment — "muscle-up" and
-- "Muscle Up" are two different, non-matching goals there. Constraining
-- the allowed values here at the DB level is deliberately closing that
-- same failure mode before it can start on this table.
--
-- tier_min/tier_max bands mirror the ones the Template Library side
-- already uses (src/lib/templateLibrary.ts's tierRangeToDifficultyBand:
-- beginner <=2, intermediate <=5, advanced >5) — same convention, so a
-- future unified matcher doesn't have to reconcile two different scales.
-- NULL on either means "no floor" / "no ceiling" (matches any tier that
-- direction).

ALTER TABLE public.standalone_workouts
  ADD COLUMN goal_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN tier_min smallint,
  ADD COLUMN tier_max smallint;

ALTER TABLE public.standalone_workouts
  ADD CONSTRAINT standalone_workouts_goal_tags_check
    CHECK (goal_tags <@ ARRAY[
      'muscle_up', 'handstand', 'front_lever', 'back_lever', 'pistol',
      'general_strength', 'conditioning'
    ]::text[]),
  ADD CONSTRAINT standalone_workouts_tier_range_check
    CHECK (
      (tier_min IS NULL OR tier_min BETWEEN 0 AND 9) AND
      (tier_max IS NULL OR tier_max BETWEEN 0 AND 9) AND
      (tier_min IS NULL OR tier_max IS NULL OR tier_min <= tier_max)
    );

CREATE INDEX standalone_workouts_goal_tags_idx ON public.standalone_workouts USING gin (goal_tags);
CREATE INDEX standalone_workouts_category_difficulty_idx ON public.standalone_workouts (category, difficulty);

-- Backfill the 3 real seeded rows (20260822031000) — confirmed count via
-- grep before writing this, not assumed. All three are PUSH-focused today,
-- which is itself the coverage gap Phase 2 exists to close.
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2
  WHERE id = '10000000-0000-0000-0000-000000000001'; -- Push Day Foundations (beginner)
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 6, tier_max = 9
  WHERE id = '10000000-0000-0000-0000-000000000002'; -- Push Power Circuit (advanced)
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'], tier_min = 3, tier_max = 5
  WHERE id = '10000000-0000-0000-0000-000000000003'; -- 20 Min Push AMRAP (intermediate)

-- save_standalone_workout gets the same DROP-first treatment as the last
-- two times its signature grew (20260822060000, 20260822070000): adding a
-- new trailing param via CREATE OR REPLACE creates a second overload
-- rather than replacing the existing one, and Supabase's .rpc() always
-- calls with named args, so the admin UI's existing 12-arg call would
-- become ambiguous between the old and new signatures.
DROP FUNCTION IF EXISTS public.save_standalone_workout(uuid, text, text, text, text, text, text, integer, boolean, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.save_standalone_workout(
  p_workout_id uuid,
  p_kind text,
  p_title text,
  p_description text,
  p_category text,
  p_difficulty text,
  p_format text,
  p_duration_minutes integer,
  p_is_free boolean,
  p_status text,
  p_blocks jsonb,
  p_cover_image_url text DEFAULT NULL,
  p_goal_tags text[] DEFAULT '{}',
  p_tier_min smallint DEFAULT NULL,
  p_tier_max smallint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workout_id uuid;
  v_block jsonb;
  v_ex jsonb;
  v_new_block_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_workout_id IS NULL THEN
    INSERT INTO standalone_workouts (kind, title, description, category, difficulty, format, duration_minutes, is_free, status, created_by, cover_image_url, goal_tags, tier_min, tier_max)
    VALUES (p_kind, p_title, p_description, p_category, p_difficulty, p_format, p_duration_minutes, p_is_free, p_status, auth.uid(), p_cover_image_url, COALESCE(p_goal_tags, '{}'), p_tier_min, p_tier_max)
    RETURNING id INTO v_workout_id;
  ELSE
    UPDATE standalone_workouts
    SET kind = p_kind, title = p_title, description = p_description, category = p_category,
        difficulty = p_difficulty, format = p_format, duration_minutes = p_duration_minutes,
        is_free = p_is_free, status = p_status, cover_image_url = p_cover_image_url,
        goal_tags = COALESCE(p_goal_tags, '{}'), tier_min = p_tier_min, tier_max = p_tier_max
    WHERE id = p_workout_id
    RETURNING id INTO v_workout_id;
    IF v_workout_id IS NULL THEN
      RAISE EXCEPTION 'Workout not found: %', p_workout_id;
    END IF;
    DELETE FROM standalone_workout_blocks WHERE workout_id = v_workout_id;
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb))
  LOOP
    INSERT INTO standalone_workout_blocks (workout_id, name, notes, order_index)
    VALUES (
      v_workout_id,
      v_block->>'name',
      v_block->>'notes',
      COALESCE((v_block->>'order_index')::int, 0)
    )
    RETURNING id INTO v_new_block_id;

    FOR v_ex IN SELECT * FROM jsonb_array_elements(COALESCE(v_block->'exercises', '[]'::jsonb))
    LOOP
      INSERT INTO standalone_workout_exercises
        (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index)
      VALUES (
        v_new_block_id,
        (v_ex->>'exercise_id')::uuid,
        (v_ex->>'sets')::int, (v_ex->>'reps')::int, (v_ex->>'rest_seconds')::int,
        (v_ex->>'hold_seconds')::int, (v_ex->>'work_seconds')::int,
        COALESCE((v_ex->>'is_weighted')::boolean, false),
        v_ex->>'notes',
        COALESCE((v_ex->>'order_index')::int, 0)
      );
    END LOOP;
  END LOOP;

  RETURN v_workout_id;
END;
$function$;
