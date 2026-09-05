-- Workout Content gets an optional "Skill" tag, shown on the browse card
-- beside the category badge — a checkbox ("is this a skill workout?") plus
-- an optional custom label (defaults to "Skills" when checked but blank,
-- e.g. "Handstand" when the admin types that in).
ALTER TABLE public.standalone_workouts
  ADD COLUMN is_skill boolean NOT NULL DEFAULT false,
  ADD COLUMN skill_label text;

ALTER TABLE public.standalone_workouts
  ADD CONSTRAINT standalone_workouts_skill_label_length_check
    CHECK (skill_label IS NULL OR char_length(skill_label) <= 40);

-- save_standalone_workout: same DROP-first treatment as every prior
-- signature growth (cover_image_url, then goal_tags/tier_min/tier_max,
-- then interval_seconds/rounds) — CREATE OR REPLACE with a new trailing
-- param creates a second overload rather than replacing the existing one.
DROP FUNCTION IF EXISTS public.save_standalone_workout(uuid, text, text, text, text, text, text, integer, boolean, text, jsonb, text, text[], smallint, smallint, smallint, smallint);

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
  p_tier_max smallint DEFAULT NULL,
  p_interval_seconds smallint DEFAULT NULL,
  p_rounds smallint DEFAULT NULL,
  p_is_skill boolean DEFAULT false,
  p_skill_label text DEFAULT NULL
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
    INSERT INTO standalone_workouts (kind, title, description, category, difficulty, format, duration_minutes, is_free, status, created_by, cover_image_url, goal_tags, tier_min, tier_max, interval_seconds, rounds, is_skill, skill_label)
    VALUES (p_kind, p_title, p_description, p_category, p_difficulty, p_format, p_duration_minutes, p_is_free, p_status, auth.uid(), p_cover_image_url, COALESCE(p_goal_tags, '{}'), p_tier_min, p_tier_max, p_interval_seconds, p_rounds, COALESCE(p_is_skill, false), p_skill_label)
    RETURNING id INTO v_workout_id;
  ELSE
    UPDATE standalone_workouts
    SET kind = p_kind, title = p_title, description = p_description, category = p_category,
        difficulty = p_difficulty, format = p_format, duration_minutes = p_duration_minutes,
        is_free = p_is_free, status = p_status, cover_image_url = p_cover_image_url,
        goal_tags = COALESCE(p_goal_tags, '{}'), tier_min = p_tier_min, tier_max = p_tier_max,
        interval_seconds = p_interval_seconds, rounds = p_rounds,
        is_skill = COALESCE(p_is_skill, false), skill_label = p_skill_label
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
