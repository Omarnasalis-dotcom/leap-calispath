-- ai_coach_create_program/_end_program/_delete_week/_create_program_from_workouts
-- all check caller_has_pro_access() before doing anything (20260828040000).
-- These 4 sibling RPCs — which edit an EXISTING AI-owned program instead of
-- creating/ending one — never got the same check. Practical gap: a lapsed
-- subscriber (dropped to free) could keep extending/editing an old AI-owned
-- program via chat indefinitely, since nothing here re-verified they still
-- have paid access. Bounded today by the free tier's lifetime chat cap
-- (which usually already counts prior paid usage), but this closes the
-- inconsistency outright rather than relying on that side effect.
--
-- Placed as the very first check, before any lookup — same position as
-- every other entitlement gate in this codebase, so a non-paying caller
-- never even gets a hint about whether the program/block/id they guessed
-- exists.
CREATE OR REPLACE FUNCTION public.ai_coach_append_week(
  p_warrior_program_id uuid,
  p_blocks jsonb,
  p_removed_block_names text[] DEFAULT NULL
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
  v_week_offset integer;
  v_new_max_week integer;
  v_new_block_names text[];
  v_carry_blocks jsonb;
  v_merged_blocks jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'append_week'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMIT: append_week daily limit reached';
  END IF;

  SELECT COALESCE(MAX(week_number), 0) INTO v_week_offset
  FROM public.program_blocks WHERE template_id = v_template_id;

  SELECT COALESCE(array_agg(elem->>'name'), ARRAY[]::text[])
  INTO v_new_block_names
  FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb)) AS elem;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'name', pb.name,
      'notes', pb.notes,
      'order_index', pb.order_index,
      'week_number', 1,
      'exercises', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'exercise_id', be.exercise_id,
            'sets', be.sets,
            'reps', be.reps,
            'rest_seconds', be.rest_seconds,
            'hold_seconds', be.hold_seconds,
            'is_weighted', be.is_weighted,
            'notes', be.notes,
            'order_index', be.order_index
          ) ORDER BY be.order_index
        ), '[]'::jsonb)
        FROM block_exercises be WHERE be.block_id = pb.id
      )
    )
  ), '[]'::jsonb)
  INTO v_carry_blocks
  FROM program_blocks pb
  WHERE pb.template_id = v_template_id
    AND pb.week_number = v_week_offset
    AND pb.name != ALL(v_new_block_names)
    AND pb.name != ALL(COALESCE(p_removed_block_names, ARRAY[]::text[]));

  v_merged_blocks := v_carry_blocks || COALESCE(p_blocks, '[]'::jsonb);

  PERFORM public._insert_client_program_blocks(v_template_id, v_week_offset, v_merged_blocks);

  SELECT MAX(week_number) INTO v_new_max_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'append_week', public.caller_rc_transaction_id());

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'week_offset', v_week_offset,
    'carried_forward_count', jsonb_array_length(v_carry_blocks)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_append_week(uuid, jsonb, text[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_adjust_program(
  p_warrior_program_id uuid,
  p_changes jsonb
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
  v_change jsonb;
  v_block_exercise_id uuid;
  v_owning_template_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'adjust_program'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT: adjust_program daily limit reached';
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_block_exercise_id := (v_change->>'block_exercise_id')::uuid;

    SELECT pb.template_id INTO v_owning_template_id
    FROM public.block_exercises be
    JOIN public.program_blocks pb ON pb.id = be.block_id
    WHERE be.id = v_block_exercise_id;

    IF v_owning_template_id IS NULL OR v_owning_template_id != v_template_id THEN
      RAISE EXCEPTION 'block_exercise_id % does not belong to this program', v_block_exercise_id;
    END IF;

    UPDATE public.block_exercises
    SET
      sets = COALESCE((v_change->>'sets')::int, sets),
      reps = COALESCE((v_change->>'reps')::int, reps),
      rest_seconds = COALESCE((v_change->>'rest_seconds')::int, rest_seconds),
      hold_seconds = COALESCE((v_change->>'hold_seconds')::int, hold_seconds),
      is_weighted = COALESCE((v_change->>'is_weighted')::boolean, is_weighted),
      exercise_id = COALESCE((v_change->>'new_exercise_id')::uuid, exercise_id)
    WHERE id = v_block_exercise_id;
  END LOOP;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'adjust_program', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_adjust_program(uuid, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_add_block_to_week(
  p_warrior_program_id uuid,
  p_week_number integer,
  p_blocks jsonb
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
  v_week_exists boolean;
  v_max_order integer;
  v_new_names text[];
  v_adjusted_blocks jsonb;
  v_block_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_block_count := jsonb_array_length(COALESCE(p_blocks, '[]'::jsonb));
  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'At least one block is required';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number
  ) INTO v_week_exists;
  IF NOT v_week_exists THEN
    RAISE EXCEPTION 'Week % not found', p_week_number;
  END IF;

  SELECT array_agg(elem->>'name') INTO v_new_names
  FROM jsonb_array_elements(p_blocks) AS elem;

  IF EXISTS (
    SELECT 1 FROM public.program_blocks
    WHERE template_id = v_template_id AND week_number = p_week_number AND name = ANY(v_new_names)
  ) THEN
    RAISE EXCEPTION 'A block with that name already exists in week %; use adjust_program to edit an existing block''s exercises, or pick a different name to add a new one.', p_week_number;
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'add_block' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMIT: add_block daily limit reached';
  END IF;

  SELECT COALESCE(MAX(order_index), -1) INTO v_max_order
  FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;

  SELECT jsonb_agg(
    elem || jsonb_build_object('order_index', v_max_order + ord, 'week_number', 0)
    ORDER BY ord
  )
  INTO v_adjusted_blocks
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(elem, ord);

  PERFORM public._insert_client_program_blocks(v_template_id, p_week_number, v_adjusted_blocks);

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'add_block', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'week_number', p_week_number, 'blocks_added', v_block_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_add_block_to_week(uuid, integer, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_replace_block_exercises(
  p_warrior_program_id uuid,
  p_block_id uuid,
  p_exercises jsonb
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
  v_owning_template_id uuid;
  v_today_count integer;
  v_exercise jsonb;
  v_exercise_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_exercise_count := jsonb_array_length(COALESCE(p_exercises, '[]'::jsonb));
  IF v_exercise_count = 0 THEN
    RAISE EXCEPTION 'At least one exercise is required';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT template_id INTO v_owning_template_id
  FROM public.program_blocks WHERE id = p_block_id;

  IF v_owning_template_id IS NULL OR v_owning_template_id != v_template_id THEN
    RAISE EXCEPTION 'block_id % does not belong to this program', p_block_id;
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'replace_block' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT: replace_block daily limit reached';
  END IF;

  DELETE FROM public.block_exercises WHERE block_id = p_block_id;

  FOR v_exercise IN SELECT * FROM jsonb_array_elements(p_exercises)
  LOOP
    INSERT INTO public.block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
    VALUES (
      p_block_id,
      (v_exercise->>'exercise_id')::uuid,
      (v_exercise->>'sets')::int,
      (v_exercise->>'reps')::int,
      (v_exercise->>'rest_seconds')::int,
      (v_exercise->>'hold_seconds')::int,
      COALESCE((v_exercise->>'is_weighted')::boolean, false),
      v_exercise->>'notes',
      COALESCE((v_exercise->>'order_index')::int, 0)
    );
  END LOOP;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'replace_block', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'block_id', p_block_id, 'exercise_count', v_exercise_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_replace_block_exercises(uuid, uuid, jsonb) TO authenticated;
