-- select_library_template previously cloned a brand new program_templates +
-- program_blocks + block_exercises copy on EVERY call, even when the warrior
-- was re-selecting a library template they'd already had before (e.g.
-- switching to program B, then back to program A). Since workout_logs is
-- keyed to the specific cloned block_id/warrior_program_id, every "switch
-- back" orphaned the warrior's previously logged history from view — it
-- wasn't deleted, but nothing could reach it anymore because the newly
-- active program pointed at entirely new block rows.
--
-- Fix: if the warrior already has a prior clone of this exact library
-- template (tracked via source_library_template_id), reactivate that same
-- clone — and therefore its original block ids — instead of cloning fresh.
CREATE OR REPLACE FUNCTION public.select_library_template(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_leap_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
    v_warrior_id CONSTANT uuid := auth.uid();
    v_existing_clone_id UUID;
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

    UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

    -- Reuse a prior clone of this exact library template if this warrior has
    -- selected it before, so their logged history against it is still there.
    SELECT pt.id INTO v_existing_clone_id
    FROM program_templates pt
    JOIN warrior_programs wp ON wp.template_id = pt.id
    WHERE pt.source_library_template_id = p_template_id
      AND wp.warrior_id = v_warrior_id
    ORDER BY wp.assigned_at DESC
    LIMIT 1;

    IF v_existing_clone_id IS NOT NULL THEN
        INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
        VALUES (v_leap_profile_id, v_warrior_id, v_existing_clone_id, 'active');
        RETURN v_existing_clone_id;
    END IF;

    -- First time this warrior has picked this library template — clone it.
    INSERT INTO program_templates (name, description, coach_id, source_library_template_id)
    SELECT name, description, v_leap_profile_id, p_template_id
    FROM program_templates
    WHERE id = p_template_id
    RETURNING id INTO v_new_template_id;

    FOR v_old_block IN
        SELECT * FROM program_blocks WHERE template_id = p_template_id ORDER BY order_index ASC
    LOOP
        INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
        VALUES (v_new_template_id, v_old_block.name, v_old_block.notes, v_old_block.order_index, v_old_block.week_number)
        RETURNING id INTO v_new_block_id;

        FOR v_old_exercise IN
            SELECT * FROM block_exercises WHERE block_id = v_old_block.id ORDER BY order_index ASC
        LOOP
            INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, notes, order_index)
            VALUES (v_new_block_id, v_old_exercise.exercise_id, v_old_exercise.sets, v_old_exercise.reps, v_old_exercise.rest_seconds, v_old_exercise.notes, v_old_exercise.order_index);
        END LOOP;
    END LOOP;

    INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
    VALUES (v_leap_profile_id, v_warrior_id, v_new_template_id, 'active');

    RETURN v_new_template_id;
END;
$function$;
