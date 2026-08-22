-- Workout Content — multi-block day structure. A "Workout" is supposed to
-- represent one full training day, but standalone_workouts/
-- standalone_workout_exercises (Phase 4) only ever supported one flat
-- exercise list per workout. This brings it in line with how every other
-- training day in this app is built: multiple ordered blocks/phases
-- (Warm-Up -> Skills -> Strength -> Cool-Down), mirroring program_blocks/
-- block_exercises exactly (no CONCEPT/timing metadata though — out of
-- scope, Quick Workouts already carry their own format/duration_minutes).
--
-- This is a forward migration with a real backfill — the schema and both
-- RPCs touched here are already production-shipped with live content
-- (the 3 rows from 20260822031000_seed_workout_library_content.sql).

CREATE TABLE public.standalone_workout_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.standalone_workouts(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX standalone_workout_blocks_workout_id_idx ON public.standalone_workout_blocks (workout_id);

-- Every existing workout gets one default "Workout" block holding its
-- current flat exercise list, before block_id becomes NOT NULL — nothing
-- already live breaks or disappears.
INSERT INTO public.standalone_workout_blocks (workout_id, name, order_index)
SELECT id, 'Workout', 0 FROM public.standalone_workouts;

ALTER TABLE public.standalone_workout_exercises
  ADD COLUMN block_id uuid REFERENCES public.standalone_workout_blocks(id) ON DELETE CASCADE;

UPDATE public.standalone_workout_exercises swe
SET block_id = swb.id
FROM public.standalone_workout_blocks swb
WHERE swb.workout_id = swe.workout_id AND swb.name = 'Workout' AND swb.order_index = 0;

ALTER TABLE public.standalone_workout_exercises ALTER COLUMN block_id SET NOT NULL;

-- RLS: standalone_workout_blocks gets the same SELECT (published-only) +
-- admin FOR-ALL shape as the other two tables. standalone_workout_exercises'
-- existing SELECT policy referenced workout_id directly — dropped before
-- the column itself goes away (a policy depending on the column blocks the
-- DROP COLUMN below otherwise), replaced with a join through blocks.

ALTER TABLE public.standalone_workout_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view published workout blocks"
  ON public.standalone_workout_blocks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.standalone_workouts sw
      WHERE sw.id = workout_id AND sw.status = 'published'
    )
  );

CREATE POLICY "Admin manages all standalone workout blocks"
  ON public.standalone_workout_blocks FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view standalone workout exercises" ON public.standalone_workout_exercises;

DROP INDEX IF EXISTS standalone_workout_exercises_workout_id_idx;
ALTER TABLE public.standalone_workout_exercises DROP COLUMN workout_id;
CREATE INDEX standalone_workout_exercises_block_id_idx ON public.standalone_workout_exercises (block_id);

CREATE POLICY "Authenticated users can view standalone workout exercises"
  ON public.standalone_workout_exercises
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.standalone_workout_blocks swb
      JOIN public.standalone_workouts sw ON sw.id = swb.workout_id
      WHERE swb.id = block_id AND sw.status = 'published'
    )
  );

-- save_standalone_workout: last param renamed p_exercises -> p_blocks.
-- Postgres' CREATE OR REPLACE FUNCTION refuses to change a parameter's
-- *name* even when its type/position is unchanged ("cannot change name of
-- input parameter") — the old signature has to be dropped first. Replace-
-- in-place is now one level deeper: delete all blocks for the workout
-- (cascades their exercises), then re-insert blocks and, per block, its
-- exercises.
DROP FUNCTION IF EXISTS public.save_standalone_workout(uuid, text, text, text, text, text, text, integer, boolean, text, jsonb);

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
  p_blocks jsonb   -- [{name, notes, order_index, exercises: [{exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index}]}]
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

-- create_custom_program_from_workouts: each selected workout's OWN blocks
-- now become their own program_blocks rows ("DAY {n} | {block_name}"),
-- instead of flattening every workout into a single block. Everything else
-- (Pro-lock check, id-resolution check, 7-day cap, deactivate-then-create)
-- is unchanged — only the block-building query changes.
CREATE OR REPLACE FUNCTION public.create_custom_program_from_workouts(p_workout_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_leap_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000001'; -- LEAP_SYSTEM_PROFILE_ID, src/constants/system.ts
  v_warrior_id CONSTANT uuid := auth.uid();
  v_paywall_enabled boolean;
  v_is_pro boolean;
  v_blocked_title text;
  v_new_template_id uuid;
  v_new_warrior_program_id uuid;
  v_blocks jsonb;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF p_workout_ids IS NULL OR array_length(p_workout_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one workout must be selected';
  END IF;
  IF array_length(p_workout_ids, 1) > 7 THEN
    RAISE EXCEPTION 'A custom program can have at most 7 days';
  END IF;

  SELECT bool_or(paywall_enabled) INTO v_paywall_enabled FROM app_config;
  v_is_pro := NOT COALESCE(v_paywall_enabled, false)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = v_warrior_id AND (is_admin OR is_coach))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = v_warrior_id AND access_expires_at > now());

  SELECT title INTO v_blocked_title
  FROM standalone_workouts
  WHERE id = ANY(p_workout_ids)
    AND (kind <> 'workout' OR status <> 'published' OR (is_free = false AND NOT v_is_pro))
  LIMIT 1;
  IF v_blocked_title IS NOT NULL THEN
    RAISE EXCEPTION 'Workout not available: %', v_blocked_title;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
    LEFT JOIN standalone_workouts sw
      ON sw.id = ids.workout_id AND sw.kind = 'workout' AND sw.status = 'published'
    WHERE sw.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected workouts could not be found';
  END IF;

  WITH picks AS (
    SELECT ids.workout_id AS wid, ids.ord AS day_ord
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
  ),
  expanded AS (
    SELECT p.day_ord, swb.id AS block_id, swb.name AS block_name, swb.order_index AS block_order_index
    FROM picks p
    JOIN standalone_workouts sw ON sw.id = p.wid
    JOIN standalone_workout_blocks swb ON swb.workout_id = sw.id
  ),
  ordered AS (
    SELECT expanded.*, row_number() OVER (ORDER BY day_ord, block_order_index) - 1 AS global_order_index
    FROM expanded
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', 'DAY ' || day_ord || ' | ' || block_name,
      'order_index', global_order_index,
      'week_number', 1,
      'exercises', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'exercise_id', swe.exercise_id,
            'sets', swe.sets,
            'reps', swe.reps,
            'rest_seconds', swe.rest_seconds,
            'hold_seconds', swe.hold_seconds,
            'is_weighted', swe.is_weighted,
            'notes', swe.notes,
            'order_index', swe.order_index
          ) ORDER BY swe.order_index
        ), '[]'::jsonb)
        FROM standalone_workout_exercises swe
        WHERE swe.block_id = ordered.block_id
      )
    ) ORDER BY global_order_index
  ) INTO v_blocks
  FROM ordered;

  UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

  INSERT INTO program_templates (name, description, coach_id)
  VALUES ('My Custom Program', array_length(p_workout_ids, 1) || '-day custom program built from the Workout Library', v_leap_profile_id)
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, v_blocks);

  INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_leap_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'warrior_program_id', v_new_warrior_program_id, 'template_id', v_new_template_id);
END;
$function$;
