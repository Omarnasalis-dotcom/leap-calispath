-- Inserts a brand-new draft library template from an import payload.
-- Deliberately NOT save_program_template: that function's update/diff path
-- (block deletion tracking, FK-violation handling for edited existing
-- templates) doesn't apply here — library import always creates fresh.
-- No SECURITY DEFINER: relies on the existing "Coaches can insert
-- templates/blocks/exercises" RLS policies (coach_id = auth.uid()), same
-- privilege model as save_program_template.
CREATE OR REPLACE FUNCTION public.import_library_template(
  p_name text,
  p_description text,
  p_blocks jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_template_id uuid;
  v_block jsonb;
  v_exercise jsonb;
  v_saved_block_id uuid;
BEGIN
  INSERT INTO program_templates (name, description, coach_id, is_library_template, status)
  VALUES (p_name, p_description, auth.uid(), true, 'draft')
  RETURNING id INTO v_template_id;

  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
    VALUES (
      v_template_id,
      v_block->>'name',
      v_block->>'notes',
      (v_block->>'order_index')::int,
      1
    )
    RETURNING id INTO v_saved_block_id;

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

  RETURN v_template_id;
END;
$function$;
