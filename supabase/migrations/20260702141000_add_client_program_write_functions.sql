-- Program assignment overhaul: three ways a coach can bring new weeks into
-- a client's program, replacing assign_program_template's "always clone +
-- orphan the old assignment" behavior for clients who already have one.
-- All three operate on the client's own template clone (warrior_programs
-- .template_id) — never the master template a coach authored — so
-- assigning/appending to one client can never affect another client or the
-- reusable master.
--
-- p_blocks shape (same across all three):
--   [{ "name": text, "notes": text, "order_index": int, "week_number": int (1-based within this source),
--      "exercises": [{ "exercise_id": uuid, "sets": int, "reps": int, "rest_seconds": int,
--                       "hold_seconds": int|null, "is_weighted": bool, "notes": text }] }]

-- Shared insert logic. Not exposed to clients directly (no GRANT EXECUTE to
-- authenticated) — only callable from the three SECURITY DEFINER functions
-- below, which each already ran their own ownership check first.
CREATE OR REPLACE FUNCTION public._insert_client_program_blocks(
  p_template_id uuid,
  p_week_offset integer,
  p_blocks jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_block jsonb;
  v_exercise jsonb;
  v_new_block_id uuid;
BEGIN
  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
    VALUES (
      p_template_id,
      v_block->>'name',
      v_block->>'notes',
      COALESCE((v_block->>'order_index')::int, 0),
      p_week_offset + COALESCE((v_block->>'week_number')::int, 1)
    )
    RETURNING id INTO v_new_block_id;

    FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(v_block->'exercises', '[]'::jsonb))
    LOOP
      INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
      VALUES (
        v_new_block_id,
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
  END LOOP;
END;
$function$;

-- 1. ADD AS NEW WEEK — purely additive, never deletes anything.
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

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'week_offset', v_week_offset);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.append_weeks_to_client_program(uuid, jsonb) TO authenticated;

-- 2. OVERWRITE — destructive. Permanently deletes the client's logged
-- workout history, week notes, and existing blocks for this template, then
-- inserts the new blocks starting at week 1. Same FK-safe deletion order
-- delete_coach_client_data already uses (logs before blocks). Keeps the
-- same warrior_programs row/template clone rather than creating a new one.
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

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.overwrite_client_program(uuid, jsonb) TO authenticated;

-- 3. ARCHIVE — marks every current week as archived (hidden from the
-- warrior's WarriorProgramScreen, still fully visible/exportable to the
-- coach) then appends the new blocks after the current max week, same as
-- append_weeks_to_client_program. Nothing is deleted.
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

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'week_offset', v_week_offset);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.archive_and_append_client_program(uuid, jsonb) TO authenticated;
