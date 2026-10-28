-- Adding a week to a finished self-service program (templates and the free
-- program) is a paid feature: First, Pro and Max (owner decision 2026-10-28).
-- Same body as live, plus the caller_has_pro_access() check, which is true for
-- any paid plan, admins/coaches, and everyone while paywall_enabled is off.
-- The app shows a locked button to Free users; the bare 'upgrade_required'
-- error is for a stale screen that still lets the tap through.
-- Same signature, so CREATE OR REPLACE keeps the existing grants.

CREATE OR REPLACE FUNCTION public.add_week_to_own_program(p_warrior_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

    IF NOT public.caller_has_pro_access() THEN
        RAISE EXCEPTION 'upgrade_required';
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
