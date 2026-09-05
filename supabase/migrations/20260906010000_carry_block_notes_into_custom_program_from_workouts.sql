-- create_custom_program_from_workouts converts a published "workout"-kind
-- standalone workout's blocks into real program_blocks when a warrior
-- builds a custom program from Workout Library content. Its expanded/
-- ordered CTE has never selected standalone_workout_blocks.notes, so the
-- resulting program_blocks.notes was always NULL — any [CONCEPT:{...}]
-- timing/structure metadata authored on a Workout Content block (admin-
-- web's one-day builder, now wired up to write it) would silently vanish
-- the moment it's turned into a program. _insert_client_program_blocks
-- already reads `notes` from each block's jsonb (20260702141000), so this
-- just adds the missing column to the query.
--
-- Body is otherwise byte-for-byte unchanged from the current definition
-- (20260831050000_gate_customize_program_min_access_tier.sql) — do not
-- reintroduce the pre-Pro-gate/pre-empty-blocks-check/pre-min_access_tier
-- shape from earlier migrations in this file.
CREATE OR REPLACE FUNCTION public.create_custom_program_from_workouts(p_workout_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_leap_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000001'; -- LEAP_SYSTEM_PROFILE_ID, src/constants/system.ts
  v_warrior_id CONSTANT uuid := auth.uid();
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

  IF NOT public.caller_is_pro_or_max() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
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

  PERFORM public._check_workout_ids_have_no_empty_blocks(p_workout_ids);

  WITH picks AS (
    SELECT ids.workout_id AS wid, ids.ord AS day_ord
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
  ),
  expanded AS (
    SELECT p.day_ord, swb.id AS block_id, swb.name AS block_name, swb.notes AS block_notes, swb.order_index AS block_order_index
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
      'notes', block_notes,
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

  INSERT INTO program_templates (name, description, coach_id, min_access_tier)
  VALUES ('My Custom Program', array_length(p_workout_ids, 1) || '-day custom program built from the Workout Library', v_leap_profile_id, 'pro')
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, v_blocks);

  INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_leap_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'warrior_program_id', v_new_warrior_program_id, 'template_id', v_new_template_id);
END;
$function$;
