-- Scope program assignment to the coach's own community roster, and block
-- writes entirely while a coach is paused. Both checks are skipped for
-- admin callers, preserving admin's existing unrestricted ability to assign
-- on behalf of any coach to any warrior.
--
-- Community-as-roster: a coach's community (communities.created_by) is the
-- set of warriors they're allowed to assign to (profiles.community_id
-- pointing at that community). A coach with no community matches nothing,
-- so they can't assign to anyone — this is the intended behavior, not an
-- edge case to special-case around.
CREATE OR REPLACE FUNCTION public.assign_program_template(p_coach_id uuid, p_warrior_id uuid, p_template_id uuid, p_custom_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new_template_id UUID;
    v_old_block RECORD;
    v_new_block_id UUID;
    v_old_exercise RECORD;
    v_is_admin BOOLEAN;
BEGIN
    SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

    IF auth.uid() != p_coach_id AND NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Not authorized to assign on behalf of this coach';
    END IF;

    IF NOT COALESCE(v_is_admin, false) THEN
        IF public.is_coaching_paused(auth.uid()) THEN
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
