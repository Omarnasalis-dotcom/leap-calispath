-- Block positions in an already-written week (2026-10-30, owner audit of
-- the "add a 4th day" chat):
-- * ai_coach_add_block_to_week takes optional order overrides (name ->
--   order_index), the same pattern as ai_coach_append_week's
--   p_carry_order_overrides, so a block the coach adds to an existing day
--   lands inside that day instead of after the week's last block.
-- * ai_coach_replace_day_in_week shifts later blocks when the replaced day
--   has more blocks than before.
-- Bodies are the live definitions with only those changes.

DROP FUNCTION IF EXISTS public.ai_coach_add_block_to_week(uuid, integer, jsonb);

CREATE OR REPLACE FUNCTION public.ai_coach_add_block_to_week(p_warrior_program_id uuid, p_week_number integer, p_blocks jsonb, p_order_overrides jsonb DEFAULT NULL)
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
    elem || jsonb_build_object('order_index', COALESCE((p_order_overrides->>(elem->>'name'))::int, v_max_order + ord), 'week_number', 0)
    ORDER BY ord
  )
  INTO v_adjusted_blocks
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(elem, ord);

  -- The ai-coach tool sends the whole week's order (computeWeekOrderIndex)
  -- so an added block lands inside its day; existing blocks move to match.
  -- Without overrides (the app's add-day confirm) a new day goes last.
  IF p_order_overrides IS NOT NULL THEN
    UPDATE public.program_blocks
    SET order_index = (p_order_overrides->>name)::int
    WHERE template_id = v_template_id AND week_number = p_week_number
      AND p_order_overrides ? name;
  END IF;

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

  -- A day that grows pushes the days after it along, so its new blocks
  -- never share positions with the next day's (they used to interleave).
  IF v_block_count > v_existing_count THEN
    UPDATE public.program_blocks
    SET order_index = order_index + (v_block_count - v_existing_count)
    WHERE template_id = v_template_id AND week_number = p_week_number AND order_index >= v_min_order;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.ai_coach_add_block_to_week(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_add_block_to_week(uuid, integer, jsonb, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_replace_day_in_week(uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_replace_day_in_week(uuid, integer, text, jsonb) TO authenticated, service_role;
