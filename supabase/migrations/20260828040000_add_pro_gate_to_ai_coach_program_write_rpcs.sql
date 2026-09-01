-- Freemium gating redesign (2026-08-28): "Start Program" in CoachScreen.tsx
-- fires exactly one of ai_coach_create_program / ai_coach_end_program /
-- ai_coach_delete_week / ai_coach_create_program_from_workouts, and is the
-- one commit action free users should be paywalled at. Of these four, only
-- ai_coach_create_program_from_workouts re-checked Pro status server-side
-- before now — the other three had NO entitlement check at all (verified by
-- reading each body during the Training Center follow-up audit), relying
-- entirely on the client-side CoachFab gate that this same redesign removes.
-- Closing that gap here, uniformly, via the new caller_has_pro_access()
-- helper (previous migration).
--
-- ai_coach_create_program_from_workouts also drops its old per-item is_free
-- filtering in favor of the same single top-level gate: since a free caller
-- is now blocked outright, the per-item logic is unreachable dead code.

CREATE OR REPLACE FUNCTION public.ai_coach_create_program(
  p_name text,
  p_description text,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_warrior_id CONSTANT uuid := auth.uid();
  v_today_count integer;
  v_new_template_id uuid;
  v_new_warrior_program_id uuid;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = v_warrior_id
    AND kind = 'create_program'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 2 THEN
    RAISE EXCEPTION 'RATE_LIMIT: create_program daily limit reached';
  END IF;

  UPDATE public.warrior_programs
  SET status = 'completed'
  WHERE warrior_id = v_warrior_id AND status = 'active';

  INSERT INTO public.program_templates (name, description, coach_id)
  VALUES (p_name, p_description, v_ai_profile_id)
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, p_blocks);

  INSERT INTO public.warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_ai_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind)
  VALUES (v_warrior_id, 'create_program');

  RETURN jsonb_build_object(
    'success', true,
    'warrior_program_id', v_new_warrior_program_id,
    'template_id', v_new_template_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_create_program(text, text, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_end_program(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT coach_id, warrior_id INTO v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'end_program'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT: end_program daily limit reached';
  END IF;

  UPDATE public.warrior_programs SET status = 'completed' WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'end_program');

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_end_program(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_delete_week(
  p_warrior_program_id uuid,
  p_week_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_template_id uuid;
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
  v_block_count integer;
  v_total_blocks integer;
  v_has_logs boolean;
  v_new_current_week integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_block_count
  FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;
  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'Week % not found', p_week_number;
  END IF;

  SELECT count(*) INTO v_total_blocks FROM public.program_blocks WHERE template_id = v_template_id;
  IF v_block_count = v_total_blocks THEN
    RAISE EXCEPTION 'Cannot delete the only week in this program — end the program instead if you want to stop it entirely.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workout_logs wl
    JOIN public.program_blocks pb ON pb.id = wl.block_id
    WHERE pb.template_id = v_template_id AND pb.week_number = p_week_number
  ) INTO v_has_logs;
  IF v_has_logs THEN
    RAISE EXCEPTION 'Cannot delete week %: it already has logged workout history.', p_week_number;
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'delete_week' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT: delete_week daily limit reached';
  END IF;

  DELETE FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;

  SELECT COALESCE(MAX(week_number), 1) INTO v_new_current_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = LEAST(current_week, v_new_current_week)
  WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'delete_week');

  RETURN jsonb_build_object('success', true, 'deleted_week', p_week_number);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_delete_week(uuid, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_create_program_from_workouts(p_workout_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_warrior_id CONSTANT uuid := auth.uid();
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

  -- Single top-level gate replaces the old per-item is_free filtering below
  -- (create_custom_program_from_workouts is Pro-only now, so per-item
  -- filtering can never be reached by a non-Pro caller anyway).
  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = v_warrior_id AND kind = 'create_program' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 2 THEN
    RAISE EXCEPTION 'RATE_LIMIT: create_program daily limit reached';
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

GRANT EXECUTE ON FUNCTION public.ai_coach_create_program_from_workouts(uuid[]) TO authenticated;
