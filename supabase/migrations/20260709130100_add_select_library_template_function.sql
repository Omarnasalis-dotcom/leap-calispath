-- Self-service clone for the Workout Templates Library. Unlike
-- assign_program_template (coach- or admin-initiated, arbitrary
-- p_warrior_id), this RPC lets a client clone a template for THEMSELVES
-- ONLY (auth.uid() is always the warrior — never a client-supplied id),
-- and only when the source is a published library template. It never
-- touches assign_program_template or its callers.
--
-- The clone is owned by the "Leap" house account (see
-- 20260709130000_add_leap_system_profile.sql) since there is no real coach
-- involved in a self-service pick. Keep this id in sync with
-- LEAP_SYSTEM_PROFILE_ID in src/constants/system.ts.
CREATE OR REPLACE FUNCTION public.select_library_template(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_leap_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
    v_warrior_id CONSTANT uuid := auth.uid();
    v_new_template_id UUID;
    v_old_block RECORD;
    v_new_block_id UUID;
    v_old_exercise RECORD;
BEGIN
    IF v_warrior_id IS NULL THEN
        RAISE EXCEPTION 'Must be authenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM program_templates
        WHERE id = p_template_id
          AND is_library_template = true
          AND status = 'published'
    ) THEN
        RAISE EXCEPTION 'Template is not an available library template';
    END IF;

    -- 1. Create the new template, owned by the Leap house account
    INSERT INTO program_templates (name, description, coach_id)
    SELECT name, description, v_leap_profile_id
    FROM program_templates
    WHERE id = p_template_id
    RETURNING id INTO v_new_template_id;

    -- 2. Loop through blocks
    FOR v_old_block IN
        SELECT * FROM program_blocks WHERE template_id = p_template_id ORDER BY order_index ASC
    LOOP
        INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
        VALUES (v_new_template_id, v_old_block.name, v_old_block.notes, v_old_block.order_index, v_old_block.week_number)
        RETURNING id INTO v_new_block_id;

        -- 3. Loop through exercises for this block
        FOR v_old_exercise IN
            SELECT * FROM block_exercises WHERE block_id = v_old_block.id ORDER BY order_index ASC
        LOOP
            INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, notes, order_index)
            VALUES (v_new_block_id, v_old_exercise.exercise_id, v_old_exercise.sets, v_old_exercise.reps, v_old_exercise.rest_seconds, v_old_exercise.notes, v_old_exercise.order_index);
        END LOOP;
    END LOOP;

    -- 4. Assign to warrior_programs, deactivating any previous active program
    UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

    INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
    VALUES (v_leap_profile_id, v_warrior_id, v_new_template_id, 'active');

    RETURN v_new_template_id;
END;
$function$;
