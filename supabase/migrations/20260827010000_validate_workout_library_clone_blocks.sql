-- Workout Library audit finding: 5 published rows have a real block with
-- zero exercises (Skills/Cool-Down blocks saved via the admin manual
-- editor, which had no such guard — the bulk-JSON-import path already
-- validated this, the single-workout editor didn't). Neither
-- create_custom_program_from_workouts nor ai_coach_create_program_from_workouts
-- checked for this before cloning — an athlete selecting one of those
-- workouts would get a real program with an empty block, the exact defect
-- class validate_block_structure (ai-coach edge function, blockHelpers.ts)
-- already prevents for AI-authored content. This closes the same gap for
-- library-cloned content, at the clone RPCs themselves — content can be
-- fixed later without needing another code change, and any future empty
-- block (any authoring path) is caught here regardless of source.

CREATE OR REPLACE FUNCTION public._check_workout_ids_have_no_empty_blocks(p_workout_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_bad_workout_title text;
  v_bad_block_name text;
BEGIN
  SELECT sw.title, swb.name INTO v_bad_workout_title, v_bad_block_name
  FROM standalone_workout_blocks swb
  JOIN standalone_workouts sw ON sw.id = swb.workout_id
  WHERE swb.workout_id = ANY(p_workout_ids)
    AND NOT EXISTS (
      SELECT 1 FROM standalone_workout_exercises swe WHERE swe.block_id = swb.id
    )
  LIMIT 1;

  IF v_bad_block_name IS NOT NULL THEN
    RAISE EXCEPTION 'Workout "%" has an empty "%" block (no exercises) — this is a content issue in the Workout Library, not something you did. Try a different workout, or ask a coach to fix it in the library.', v_bad_workout_title, v_bad_block_name;
  END IF;
END;
$function$;

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

  PERFORM public._check_workout_ids_have_no_empty_blocks(p_workout_ids);

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

CREATE OR REPLACE FUNCTION public.ai_coach_create_program_from_workouts(p_workout_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_warrior_id CONSTANT uuid := auth.uid();
  v_paywall_enabled boolean;
  v_is_pro boolean;
  v_blocked_title text;
  v_today_count integer;
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

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = v_warrior_id AND kind = 'create_program' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 2 THEN
    RAISE EXCEPTION 'RATE_LIMIT: create_program daily limit reached';
  END IF;

  SELECT bool_or(paywall_enabled) INTO v_paywall_enabled FROM public.app_config;
  v_is_pro := NOT COALESCE(v_paywall_enabled, false)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_warrior_id AND (is_admin OR is_coach))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_warrior_id AND access_expires_at > now());

  SELECT title INTO v_blocked_title
  FROM public.standalone_workouts
  WHERE id = ANY(p_workout_ids)
    AND (kind <> 'workout' OR status <> 'published' OR (is_free = false AND NOT v_is_pro))
  LIMIT 1;
  IF v_blocked_title IS NOT NULL THEN
    RAISE EXCEPTION 'Workout not available: %', v_blocked_title;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
    LEFT JOIN public.standalone_workouts sw
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
    SELECT p.day_ord, swb.id AS block_id, swb.name AS block_name, swb.order_index AS block_order_index
    FROM picks p
    JOIN public.standalone_workouts sw ON sw.id = p.wid
    JOIN public.standalone_workout_blocks swb ON swb.workout_id = sw.id
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
        FROM public.standalone_workout_exercises swe
        WHERE swe.block_id = ordered.block_id
      )
    ) ORDER BY global_order_index
  ) INTO v_blocks
  FROM ordered;

  UPDATE public.warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

  INSERT INTO public.program_templates (name, description, coach_id)
  VALUES ('My Custom Program', array_length(p_workout_ids, 1) || '-day custom program built from the Workout Library', v_ai_profile_id)
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, v_blocks);

  INSERT INTO public.warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_ai_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (v_warrior_id, 'create_program');

  RETURN jsonb_build_object('success', true, 'warrior_program_id', v_new_warrior_program_id, 'template_id', v_new_template_id);
END;
$function$;
