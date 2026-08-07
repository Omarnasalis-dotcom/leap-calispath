-- Bug found live: a coach whose own profile happens to sit inside their
-- own community (e.g. from the same join flow every member uses) shows up
-- in their own warrior search/community-member list, letting them "assign"
-- a program to themselves as if they were their own client. Blocks it
-- structurally rather than just hiding it from the admin-web pickers
-- (already done client-side) — applies regardless of caller (coach,
-- assistant, or admin), since a coach is never a legitimate client of
-- their own roster.
CREATE OR REPLACE FUNCTION public.assign_program_template(p_coach_id uuid, p_warrior_id uuid, p_template_id uuid, p_custom_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_new_template_id UUID;
    v_old_block RECORD;
    v_new_block_id UUID;
    v_old_exercise RECORD;
    v_is_admin BOOLEAN;
    v_is_assistant BOOLEAN;
    v_source_is_library BOOLEAN;
BEGIN
    IF p_warrior_id = p_coach_id THEN
        RAISE EXCEPTION 'A coach cannot assign a program to themselves';
    END IF;

    SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
    v_is_assistant := public.is_assistant_for(p_coach_id);

    IF auth.uid() != p_coach_id AND NOT COALESCE(v_is_admin, false) AND NOT v_is_assistant THEN
        RAISE EXCEPTION 'Not authorized to assign on behalf of this coach';
    END IF;

    IF NOT COALESCE(v_is_admin, false) THEN
        IF public.is_coaching_paused(p_coach_id) THEN
            RAISE EXCEPTION 'Coaching access is paused';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.profiles w
            JOIN public.communities c ON c.id = w.community_id
            WHERE w.id = p_warrior_id AND c.created_by = p_coach_id
        ) THEN
            RAISE EXCEPTION 'Warrior is not a member of your community';
        END IF;

        IF v_is_assistant AND auth.uid() != p_coach_id AND EXISTS (
            SELECT 1 FROM public.warrior_programs
            WHERE warrior_id = p_warrior_id AND coach_id = p_coach_id AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'This warrior already has an active program — use append or archive instead';
        END IF;

        SELECT is_library_template INTO v_source_is_library
        FROM public.program_templates WHERE id = p_template_id;

        IF COALESCE(v_source_is_library, false) THEN
            RAISE EXCEPTION 'Library templates can only be assigned by an admin';
        END IF;
    END IF;

    -- 1. Create the new template
    INSERT INTO program_templates (name, description, coach_id)
    SELECT p_custom_name, description, p_coach_id
    FROM program_templates
    WHERE id = p_template_id
    RETURNING id INTO v_new_template_id;

    -- 2. Loop through blocks
    FOR v_old_block IN
        SELECT * FROM program_blocks WHERE template_id = p_template_id ORDER BY order_index ASC
    LOOP
        -- Insert new block
        INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
        VALUES (v_new_template_id, v_old_block.name, v_old_block.notes, v_old_block.order_index, v_old_block.week_number)
        RETURNING id INTO v_new_block_id;

        -- 3. Loop through exercises for this block
        FOR v_old_exercise IN
            SELECT * FROM block_exercises WHERE block_id = v_old_block.id ORDER BY order_index ASC
        LOOP
            INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
            VALUES (v_new_block_id, v_old_exercise.exercise_id, v_old_exercise.sets, v_old_exercise.reps, v_old_exercise.rest_seconds, v_old_exercise.hold_seconds, v_old_exercise.is_weighted, v_old_exercise.notes, v_old_exercise.order_index);
        END LOOP;
    END LOOP;

    -- 4. Assign to warrior_programs
    -- Deactivate any previous active programs for this warrior
    UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = p_warrior_id AND status = 'active';

    INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
    VALUES (p_coach_id, p_warrior_id, v_new_template_id, 'active');

    RETURN v_new_template_id;
END;
$function$;
