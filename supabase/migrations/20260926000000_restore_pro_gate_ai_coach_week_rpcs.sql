-- Restores the paid-tier gate on three AI Coach write RPCs (audit 2026-09-25, H1).
--
-- 20260903100000 added caller_has_pro_access() to ai_coach_append_week and
-- ai_coach_add_block_to_week. Two later CREATE OR REPLACEs dropped it without
-- saying so: 20260917140000 (add_block_to_week, and the then-new
-- replace_day_in_week, which never had it) and 20260918160000 (append_week).
-- A lapsed subscriber could keep adding days / weeks to an AI-owned program.
--
-- Bodies below are the live prod definitions (pg_get_functiondef) with only
-- the gate inserted, right after the auth check -- same position as every
-- other entitlement gate. Same signatures, so existing grants are preserved.
-- CoachScreen's confirm cards already route PRO_REQUIRED to the paywall
-- (isProRequiredError).

CREATE OR REPLACE FUNCTION public.ai_coach_append_week(p_warrior_program_id uuid, p_blocks jsonb, p_removed_block_names text[] DEFAULT NULL::text[], p_carry_order_overrides jsonb DEFAULT '{}'::jsonb)
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

  -- Hard ownership boundary: only ever an AI-owned program belonging to the
  -- caller. A real human coach's program is never reachable through this
  -- RPC, regardless of who's asking.
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
      'order_index', COALESCE((p_carry_order_overrides->>pb.name)::int, pb.order_index),
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

  INSERT INTO public.ai_coach_requests (user_id, kind)
  VALUES (auth.uid(), 'append_week');

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'week_offset', v_week_offset,
    'carried_forward_count', jsonb_array_length(v_carry_blocks)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ai_coach_add_block_to_week(p_warrior_program_id uuid, p_week_number integer, p_blocks jsonb)
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
    RAISE EXCEPTION 'A block with that name already exists in week %; use adjust_program to edit an existing block''s exercises, or ai_coach_replace_day_in_week to replace a whole day, or pick a different name to add a new one.', p_week_number;
  END IF;

  -- Raised 5 -> 10/day (2026-09-17): shared with ai_coach_replace_day_in_week
  -- below via the same 'add_block' kind, since a 6-day day-by-day build now
  -- needs up to 5 of these calls (days 2-6) plus room for at least one redo.
  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'add_block' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 10 THEN
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

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'add_block');

  RETURN jsonb_build_object('success', true, 'week_number', p_week_number, 'blocks_added', v_block_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ai_coach_replace_day_in_week(p_warrior_program_id uuid, p_week_number integer, p_day_name text, p_blocks jsonb)
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
  v_day_prefix text;
  v_existing_count integer;
  v_min_order integer;
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
  IF p_day_name IS NULL OR btrim(p_day_name) = '' THEN
    RAISE EXCEPTION 'day_name is required';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  v_day_prefix := btrim(p_day_name) || ' | ';

  SELECT count(*), MIN(order_index) INTO v_existing_count, v_min_order
  FROM public.program_blocks
  WHERE template_id = v_template_id AND week_number = p_week_number AND name LIKE v_day_prefix || '%';

  IF v_existing_count = 0 THEN
    RAISE EXCEPTION 'No blocks named "%" found in week % — nothing to replace. Use ai_coach_add_block_to_week to add a new day instead.', p_day_name, p_week_number;
  END IF;

  -- Same shared bucket as ai_coach_add_block_to_week — see its own comment.
  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'add_block' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT: add_block daily limit reached';
  END IF;

  DELETE FROM public.program_blocks
  WHERE template_id = v_template_id AND week_number = p_week_number AND name LIKE v_day_prefix || '%';

  SELECT jsonb_agg(
    elem || jsonb_build_object('order_index', v_min_order + ord - 1, 'week_number', 0)
    ORDER BY ord
  )
  INTO v_adjusted_blocks
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(elem, ord);

  PERFORM public._insert_client_program_blocks(v_template_id, p_week_number, v_adjusted_blocks);

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'add_block');

  RETURN jsonb_build_object('success', true, 'week_number', p_week_number, 'day_name', p_day_name, 'blocks_added', v_block_count);
END;
$function$;
