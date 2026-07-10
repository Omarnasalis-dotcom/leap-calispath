-- Two different "which week should the warrior see" flows were both being
-- served by one signal (max(week_number) in the template), computed fresh
-- on every WarriorProgramScreen load:
--   1. Client self-selects a pre-built multi-week library template — should
--      land on week 1 and progress themselves.
--   2. Coach progressively delivers new weeks over time to an existing
--      assignment — should land on the newest week the coach just added.
-- These want opposite defaults, so max(week_number) alone can't serve both.
-- Fix: track the intended week explicitly per assignment instead of
-- inferring it, and have every write path that creates or advances a
-- client's program set it appropriately.
ALTER TABLE public.warrior_programs
  ADD COLUMN current_week integer NOT NULL DEFAULT 1;

-- All INSERT INTO warrior_programs call sites (assign_program_template,
-- select_library_template, both its fresh-clone and reactivate-existing-clone
-- paths) omit current_week and therefore get the new DEFAULT 1, which is
-- correct for every one of them — a brand new or freshly reactivated
-- assignment should always start its viewer at week 1.

-- append_weeks_to_client_program / archive_and_append_client_program: the
-- coach is handing the client new weeks past what already exists — advance
-- current_week to the new highest week so the warrior sees it immediately.
CREATE OR REPLACE FUNCTION public.append_weeks_to_client_program(
  p_warrior_program_id uuid,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_coach_id uuid;
  v_is_admin boolean;
  v_week_offset integer;
  v_new_max_week integer;
BEGIN
  SELECT template_id, coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() IS NULL OR (auth.uid() != v_coach_id AND NOT COALESCE(v_is_admin, false)) THEN
    RAISE EXCEPTION 'Not authorized to modify this client''s program';
  END IF;

  SELECT COALESCE(MAX(week_number), 0) INTO v_week_offset
  FROM public.program_blocks WHERE template_id = v_template_id;

  PERFORM public._insert_client_program_blocks(v_template_id, v_week_offset, p_blocks);

  SELECT MAX(week_number) INTO v_new_max_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE id = p_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'week_offset', v_week_offset);
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_and_append_client_program(
  p_warrior_program_id uuid,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_coach_id uuid;
  v_is_admin boolean;
  v_week_offset integer;
  v_new_max_week integer;
BEGIN
  SELECT template_id, coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() IS NULL OR (auth.uid() != v_coach_id AND NOT COALESCE(v_is_admin, false)) THEN
    RAISE EXCEPTION 'Not authorized to modify this client''s program';
  END IF;

  INSERT INTO public.program_week_archive (template_id, week_number)
  SELECT DISTINCT v_template_id, week_number
  FROM public.program_blocks
  WHERE template_id = v_template_id
  ON CONFLICT (template_id, week_number) DO NOTHING;

  SELECT COALESCE(MAX(week_number), 0) INTO v_week_offset
  FROM public.program_blocks WHERE template_id = v_template_id;

  PERFORM public._insert_client_program_blocks(v_template_id, v_week_offset, p_blocks);

  SELECT MAX(week_number) INTO v_new_max_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE id = p_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'week_offset', v_week_offset);
END;
$function$;

-- overwrite_client_program: the client's program is being replaced from
-- scratch starting at week 1 of the new content — reset current_week to 1,
-- same as any other brand-new assignment.
CREATE OR REPLACE FUNCTION public.overwrite_client_program(
  p_warrior_program_id uuid,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_coach_id uuid;
  v_is_admin boolean;
BEGIN
  SELECT template_id, coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() IS NULL OR (auth.uid() != v_coach_id AND NOT COALESCE(v_is_admin, false)) THEN
    RAISE EXCEPTION 'Not authorized to modify this client''s program';
  END IF;

  DELETE FROM public.workout_logs WHERE warrior_program_id = p_warrior_program_id;
  DELETE FROM public.coach_week_notes WHERE warrior_program_id = p_warrior_program_id;
  DELETE FROM public.block_exercises
    WHERE block_id IN (SELECT id FROM public.program_blocks WHERE template_id = v_template_id);
  DELETE FROM public.program_blocks WHERE template_id = v_template_id;
  DELETE FROM public.program_week_archive WHERE template_id = v_template_id;

  PERFORM public._insert_client_program_blocks(v_template_id, 0, p_blocks);

  UPDATE public.warrior_programs
  SET current_week = 1
  WHERE id = p_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$function$;

-- save_program_template: the coach's Builder screen "Save" button is also
-- how a client's own assigned clone gets edited directly (the "Assigned"
-- tab added in the templates-library filter work reuses the same screen).
-- If this template_id is some warrior's active clone, keep current_week in
-- sync with whatever the coach just saved as the highest week — same rule
-- as append/archive above. No-op for master templates (no matching active
-- warrior_programs row exists, so the UPDATE affects zero rows).
CREATE OR REPLACE FUNCTION public.save_program_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_template_id uuid;
  v_block jsonb;
  v_exercise jsonb;
  v_saved_block_id uuid;
  v_current_block_ids uuid[];
  v_previous_block_ids uuid[];
  v_blocks_to_delete uuid[];
  v_undeletable_block_ids uuid[] := '{}';
  v_block_id uuid;
  v_new_max_week integer;
BEGIN
  IF p_template_id IS NOT NULL THEN
    UPDATE program_templates
    SET name = p_name, description = p_description
    WHERE id = p_template_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
    END IF;

    v_template_id := p_template_id;
  ELSE
    INSERT INTO program_templates (name, description, coach_id)
    VALUES (p_name, p_description, auth.uid())
    RETURNING id INTO v_template_id;
  END IF;

  SELECT array_agg((b->>'db_id')::uuid)
  INTO v_current_block_ids
  FROM jsonb_array_elements(p_blocks) AS b
  WHERE b->>'db_id' IS NOT NULL;

  IF p_template_id IS NOT NULL THEN
    SELECT array_agg(id) INTO v_previous_block_ids
    FROM program_blocks
    WHERE template_id = v_template_id;

    IF v_previous_block_ids IS NOT NULL THEN
      -- Only wipe exercises for blocks the loop below will actually
      -- repopulate from the payload.
      IF v_current_block_ids IS NOT NULL THEN
        DELETE FROM block_exercises WHERE block_id = ANY(v_current_block_ids);
      END IF;

      v_blocks_to_delete := ARRAY(
        SELECT unnest(v_previous_block_ids)
        EXCEPT
        SELECT unnest(COALESCE(v_current_block_ids, ARRAY[]::uuid[]))
      );

      FOREACH v_block_id IN ARRAY v_blocks_to_delete LOOP
        BEGIN
          DELETE FROM block_exercises WHERE block_id = v_block_id;
          DELETE FROM program_blocks WHERE id = v_block_id;
        EXCEPTION WHEN foreign_key_violation THEN
          v_undeletable_block_ids := array_append(v_undeletable_block_ids, v_block_id);
        END;
      END LOOP;
    END IF;
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks)
  LOOP
    IF v_block->>'db_id' IS NOT NULL THEN
      UPDATE program_blocks SET
        name = v_block->>'name',
        notes = v_block->>'notes',
        order_index = (v_block->>'order_index')::int,
        week_number = (v_block->>'week_number')::int
      WHERE id = (v_block->>'db_id')::uuid
      RETURNING id INTO v_saved_block_id;
    ELSE
      INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
      VALUES (
        v_template_id,
        v_block->>'name',
        v_block->>'notes',
        (v_block->>'order_index')::int,
        (v_block->>'week_number')::int
      )
      RETURNING id INTO v_saved_block_id;
    END IF;

    FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(v_block->'exercises', '[]'::jsonb))
    LOOP
      INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, notes, order_index)
      VALUES (
        v_saved_block_id,
        (v_exercise->>'exercise_id')::uuid,
        (v_exercise->>'sets')::int,
        (v_exercise->>'reps')::int,
        (v_exercise->>'rest_seconds')::int,
        (v_exercise->>'hold_seconds')::int,
        v_exercise->>'notes',
        (v_exercise->>'order_index')::int
      );
    END LOOP;
  END LOOP;

  SELECT MAX(week_number) INTO v_new_max_week
  FROM program_blocks WHERE template_id = v_template_id;

  UPDATE warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE template_id = v_template_id AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'undeletable_block_ids', to_jsonb(v_undeletable_block_ids)
  );
END;
$function$;
