-- Fixes: a program created via Customize Program (create_custom_program_
-- from_workouts) hardcodes week_number = 1 -- it was never designed to be
-- more than one week. Once a warrior finishes that week, there's no
-- self-service way to add another: the one RPC that already does this
-- mechanic, ai_coach_append_week, is hard-gated to programs owned by the
-- AI coach profile and rejects everything else (see its coach_id check).
-- Customize-flow (and Ready Template) programs are owned by the LEAP
-- system profile instead, so they need their own equivalent entry point.
--
-- Deliberately simple for v1 (per direction): clones the current max
-- week's blocks + exercises forward as the next week, rather than opening
-- a picker to choose new workouts -- "repeat this week" is a one-tap fix
-- for "I can't continue at all," and picking fresh workouts per week can
-- be a follow-up if wanted later.
--
-- Scoped narrowly: only self-service-extendable for warrior_programs the
-- LEAP system profile owns (Customize/Template flows), never a real
-- coach's program -- that must stay under the coach's own control, same
-- reasoning the existing append_weeks_to_client_program RPC already
-- enforces via its own coach_id = auth.uid() check.
CREATE OR REPLACE FUNCTION public.add_week_to_own_program(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_leap_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
    v_warrior_id CONSTANT uuid := auth.uid();
    v_template_id uuid;
    v_max_week integer;
    v_new_week integer;
    v_old_block RECORD;
    v_new_block_id uuid;
    v_old_exercise RECORD;
BEGIN
    IF v_warrior_id IS NULL THEN
        RAISE EXCEPTION 'Must be authenticated';
    END IF;

    SELECT template_id INTO v_template_id
    FROM public.warrior_programs
    WHERE id = p_warrior_program_id
      AND warrior_id = v_warrior_id
      AND coach_id = v_leap_profile_id
      AND status = 'active';

    IF v_template_id IS NULL THEN
        RAISE EXCEPTION 'Program not found, not yours, or not eligible for self-service week add';
    END IF;

    SELECT COALESCE(MAX(week_number), 1) INTO v_max_week
    FROM public.program_blocks
    WHERE template_id = v_template_id;

    v_new_week := v_max_week + 1;

    FOR v_old_block IN
        SELECT * FROM public.program_blocks
        WHERE template_id = v_template_id AND COALESCE(week_number, 1) = v_max_week
        ORDER BY order_index ASC
    LOOP
        INSERT INTO public.program_blocks (template_id, name, notes, order_index, week_number)
        VALUES (v_template_id, v_old_block.name, v_old_block.notes, v_old_block.order_index, v_new_week)
        RETURNING id INTO v_new_block_id;

        FOR v_old_exercise IN
            SELECT * FROM public.block_exercises WHERE block_id = v_old_block.id ORDER BY order_index ASC
        LOOP
            INSERT INTO public.block_exercises
                (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
            VALUES
                (v_new_block_id, v_old_exercise.exercise_id, v_old_exercise.sets, v_old_exercise.reps,
                 v_old_exercise.rest_seconds, v_old_exercise.hold_seconds, v_old_exercise.is_weighted,
                 v_old_exercise.notes, v_old_exercise.order_index);
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object('new_week', v_new_week);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_week_to_own_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_week_to_own_program(uuid) TO authenticated;
