-- Three self-service RPCs backing the AI Coach's write tools
-- (create_program / append_week / adjust_program). All three:
--   * SECURITY DEFINER, trust only auth.uid() — never a client-supplied id.
--   * Enforce the hard ownership boundary: append_week/adjust_program only
--     ever touch a warrior_programs row owned by AI_COACH_SYSTEM_PROFILE_ID
--     and belonging to the caller — never a real coach's program.
--   * Enforce their own daily rate cap against ai_coach_requests BEFORE
--     writing, then log themselves in the same transaction — the
--     authoritative layer a client can't bypass by calling the RPC
--     directly, per the two-layer plan (edge function does a cheap
--     pre-check purely to avoid burning a Claude call, this is what
--     actually matters).
--
-- create_program is modeled on select_library_template's final body
-- (20260709160100_fix_select_library_template_reuse_clone.sql). append_week
-- is modeled on append_weeks_to_client_program's final body
-- (20260807260000_add_assistant_support_to_apply_template_rpcs.sql), reusing
-- _insert_client_program_blocks directly rather than duplicating its loop.

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


CREATE OR REPLACE FUNCTION public.ai_coach_append_week(
  p_warrior_program_id uuid,
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
  v_week_offset integer;
  v_new_max_week integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
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

  PERFORM public._insert_client_program_blocks(v_template_id, v_week_offset, p_blocks);

  SELECT MAX(week_number) INTO v_new_max_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind)
  VALUES (auth.uid(), 'append_week');

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'week_offset', v_week_offset);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_append_week(uuid, jsonb) TO authenticated;


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

    -- Verify this exercise actually belongs to THIS warrior_program's
    -- template — never trust the id alone, an AI-adjacent caller could
    -- otherwise pass any block_exercise_id in the system, including one
    -- belonging to a different warrior or a real coach's client.
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

  INSERT INTO public.ai_coach_requests (user_id, kind)
  VALUES (auth.uid(), 'adjust_program');

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_adjust_program(uuid, jsonb) TO authenticated;
