-- Editing a written week (2026-10-30, owner audit of the "add a 4th day"
-- chat). Bodies are the live definitions with only these changes:
-- * ai_coach_delete_week moves later weeks down one (and the current week,
--   journey day choice, coach week notes and week archive rows with them),
--   so deleting a middle week leaves no gap.
-- * Logged blocks are locked: ai_coach_replace_day_in_week refuses a day
--   with any logged block, and ai_coach_adjust_program,
--   ai_coach_replace_block_exercises and ai_coach_update_block_structure
--   refuse a logged block. Edits to unlogged blocks work as before.
-- Same signatures, so existing grants carry over.

CREATE OR REPLACE FUNCTION public.ai_coach_delete_week(p_warrior_program_id uuid, p_week_number integer)
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

  -- Later weeks move down one so no gap is left (2026-10-30, owner):
  -- deleting Week 6 of 7 makes Week 7 the new Week 6.
  UPDATE public.program_blocks
  SET week_number = week_number - 1
  WHERE template_id = v_template_id AND week_number > p_week_number;

  UPDATE public.warrior_programs
  SET current_week = current_week - 1
  WHERE id = p_warrior_program_id AND current_week > p_week_number;

  -- Per-week rows move with their week; the deleted week's own rows go.
  -- coach_week_notes/program_week_archive are unique per week, so they
  -- shift in two steps (through negatives) to avoid mid-update collisions.
  DELETE FROM public.journey_day_choices WHERE warrior_program_id = p_warrior_program_id AND week_number = p_week_number;
  UPDATE public.journey_day_choices SET week_number = week_number - 1
  WHERE warrior_program_id = p_warrior_program_id AND week_number > p_week_number;

  DELETE FROM public.coach_week_notes WHERE warrior_program_id = p_warrior_program_id AND week_number = p_week_number;
  UPDATE public.coach_week_notes SET week_number = -(week_number - 1)
  WHERE warrior_program_id = p_warrior_program_id AND week_number > p_week_number;
  UPDATE public.coach_week_notes SET week_number = -week_number
  WHERE warrior_program_id = p_warrior_program_id AND week_number < 0;

  DELETE FROM public.program_week_archive WHERE template_id = v_template_id AND week_number = p_week_number;
  UPDATE public.program_week_archive SET week_number = -(week_number - 1)
  WHERE template_id = v_template_id AND week_number > p_week_number;
  UPDATE public.program_week_archive SET week_number = -week_number
  WHERE template_id = v_template_id AND week_number < 0;

  SELECT COALESCE(MAX(week_number), 1) INTO v_new_current_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = LEAST(current_week, v_new_current_week)
  WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'delete_week', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'deleted_week', p_week_number);
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

  IF EXISTS (
    SELECT 1 FROM public.workout_logs wl
    JOIN public.program_blocks pb ON pb.id = wl.block_id
    WHERE pb.template_id = v_template_id AND pb.week_number = p_week_number AND pb.name LIKE v_day_prefix || '%'
  ) THEN
    RAISE EXCEPTION 'DAY_LOGGED: "%" in week % is already logged — a logged block is locked so its history stays what the athlete did; make this change in the next week build instead', p_day_name, p_week_number;
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

CREATE OR REPLACE FUNCTION public.ai_coach_adjust_program(p_warrior_program_id uuid, p_changes jsonb)
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

    IF EXISTS (
      SELECT 1 FROM public.workout_logs wl
      JOIN public.block_exercises be ON be.block_id = wl.block_id
      WHERE be.id = v_block_exercise_id
    ) THEN
      RAISE EXCEPTION 'BLOCK_LOGGED: the block holding block_exercise_id % is already logged — a logged block is locked so its history stays what the athlete did; make this change in the next week build instead', v_block_exercise_id;
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

CREATE OR REPLACE FUNCTION public.ai_coach_replace_block_exercises(p_warrior_program_id uuid, p_block_id uuid, p_exercises jsonb)
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

  IF EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = p_block_id) THEN
    RAISE EXCEPTION 'BLOCK_LOGGED: block % is already logged — a logged block is locked so its history stays what the athlete did; make this change in the next week build instead', p_block_id;
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

CREATE OR REPLACE FUNCTION public.ai_coach_update_block_structure(p_warrior_program_id uuid, p_changes jsonb)
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
  v_block_id uuid;
  v_owning_template_id uuid;
  v_old_notes text;
  v_concept_json text;
  v_plain_notes text;
  v_merged_metadata jsonb;
  v_new_notes text;
  v_updated_count integer := 0;
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

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'update_block_structure' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT: update_block_structure daily limit reached';
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_block_id := (v_change->>'block_id')::uuid;

    SELECT template_id, notes INTO v_owning_template_id, v_old_notes
    FROM public.program_blocks WHERE id = v_block_id;

    IF v_owning_template_id IS NULL OR v_owning_template_id != v_template_id THEN
      RAISE EXCEPTION 'block_id % does not belong to this program', v_block_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = v_block_id) THEN
      RAISE EXCEPTION 'BLOCK_LOGGED: block % is already logged — a logged block is locked so its history stays what the athlete did; make this change in the next week build instead', v_block_id;
    END IF;

    v_concept_json := (regexp_match(COALESCE(v_old_notes, ''), '^\[CONCEPT:(.*?)\]'))[1];
    v_plain_notes := regexp_replace(COALESCE(v_old_notes, ''), '^\[CONCEPT:.*?\]\s*', '');

    IF v_concept_json IS NULL THEN
      RAISE EXCEPTION 'Block % has no existing structure metadata to update — it may be malformed. Use replace_block_exercises or rebuild the day instead.', v_block_id;
    END IF;

    v_merged_metadata := v_concept_json::jsonb || COALESCE(v_change->'metadata', '{}'::jsonb);
    v_new_notes := trim(both ' ' from ('[CONCEPT:' || v_merged_metadata::text || '] ' || v_plain_notes));

    UPDATE public.program_blocks
    SET notes = v_new_notes
    WHERE id = v_block_id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'update_block_structure', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'blocks_updated', v_updated_count);
END;
$function$;
