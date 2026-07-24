-- save_program_template's block_exercises INSERT never included is_weighted
-- (only sets/reps/rest_seconds/hold_seconds/notes/order_index) — every save
-- through the coach's Program Builder "Save" button silently reset every
-- exercise's weighted flag back to the column default (false), regardless of
-- the block's "Weighted block" toggle. The copy_day/duplicate_block RPCs
-- already handle this column correctly (see 20260629102000), so this brings
-- the main save path in line with the same COALESCE-to-false pattern.
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
      INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
      VALUES (
        v_saved_block_id,
        (v_exercise->>'exercise_id')::uuid,
        (v_exercise->>'sets')::int,
        (v_exercise->>'reps')::int,
        (v_exercise->>'rest_seconds')::int,
        (v_exercise->>'hold_seconds')::int,
        COALESCE((v_exercise->>'is_weighted')::boolean, false),
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
