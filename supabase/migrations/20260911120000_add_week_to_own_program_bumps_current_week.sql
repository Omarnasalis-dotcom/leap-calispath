-- Perf fix: MilestoneLaneScreen's "ADD NEW WEEK" flow (handleContinueProgram)
-- called add_week_to_own_program, then made a SEPARATE round trip to bump
-- current_week itself, then reloaded the whole lane -- three sequential
-- network round trips end to end, reported live as "clicking start new week
-- is slowing the app / takes a long time." Folding the current_week bump
-- into this same function (already SECURITY DEFINER, already validated
-- p_warrior_program_id belongs to the calling warrior above) removes one
-- whole round trip for this path. Same signature, so a plain
-- CREATE OR REPLACE is safe -- no DROP FUNCTION needed (only required when
-- changing the parameter list, not the body).
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

    -- Was a separate client round trip after this RPC returned -- now done
    -- in the same transaction, same call.
    UPDATE public.warrior_programs
    SET current_week = v_new_week
    WHERE id = p_warrior_program_id;

    RETURN jsonb_build_object('new_week', v_new_week);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_week_to_own_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_week_to_own_program(uuid) TO authenticated;
