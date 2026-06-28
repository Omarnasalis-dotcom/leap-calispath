-- CopyBlockModal's copyBlockToClient/copyDayToClient/copyDayToTemplate each
-- ran as a sequence of separate client-side insert calls (block insert, then
-- an exercises insert per block, in a loop for multi-block days). A failure
-- partway through left a partially-copied block or day with no rollback.
-- These two RPCs wrap each operation in a single atomic call.
--
-- Deliberately SECURITY INVOKER (the default — no clause needed): existing
-- RLS policies on program_blocks/block_exercises already scope writes to
-- the owning coach via a join to program_templates.coach_id, with "Admin
-- manages all ..." policies separately covering admin access. Running as
-- the caller keeps that enforcement intact rather than re-implementing
-- ownership checks here.
CREATE OR REPLACE FUNCTION public.copy_block_to_template(
  p_template_id uuid,
  p_name text,
  p_notes text,
  p_week_number int,
  p_exercises jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_index int;
  v_block_id uuid;
  v_exercise jsonb;
BEGIN
  SELECT count(*) INTO v_order_index FROM program_blocks WHERE template_id = p_template_id;

  INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
  VALUES (p_template_id, p_name, p_notes, v_order_index, p_week_number)
  RETURNING id INTO v_block_id;

  FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb))
  LOOP
    INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
    VALUES (
      v_block_id,
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

  RETURN v_block_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.copy_day_to_template(
  p_template_id uuid,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_index int;
  v_block jsonb;
  v_block_id uuid;
  v_exercise jsonb;
  v_new_block_ids uuid[] := '{}';
BEGIN
  SELECT count(*) INTO v_order_index FROM program_blocks WHERE template_id = p_template_id;

  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
    VALUES (p_template_id, v_block->>'name', v_block->>'notes', v_order_index, (v_block->>'week_number')::int)
    RETURNING id INTO v_block_id;

    v_order_index := v_order_index + 1;
    v_new_block_ids := array_append(v_new_block_ids, v_block_id);

    FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(v_block->'exercises', '[]'::jsonb))
    LOOP
      INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
      VALUES (
        v_block_id,
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

  RETURN jsonb_build_object('block_ids', to_jsonb(v_new_block_ids));
END;
$function$;
