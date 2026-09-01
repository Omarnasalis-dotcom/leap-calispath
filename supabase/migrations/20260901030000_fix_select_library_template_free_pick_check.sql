-- Real bug, found live: "one free template, ever" counted ANY
-- warrior_programs row the caller has ever had — including ones built via
-- a paid feature (Customize Program, AI Coach), not just prior free
-- template picks. This didn't matter until Gate 2's "Delete & Choose a
-- Free Template" flow existed (this session, later): a user whose Pro-built
-- program got ended via end_active_program() still has that (now
-- completed) warrior_programs row, so this check permanently blocked them
-- from ever getting the free template they were explicitly told to go
-- pick — they never even used a free template, a Pro-feature program was
-- wrongly counted as if they had.
--
-- Fix: only count rows whose template actually came from a free pick.
-- min_access_tier IS NULL is exactly that signal (added this session,
-- Gate 2) — NULL means template-library-sourced/exempt, 'first'/'pro'
-- means built via a paid feature. select_library_template's own INSERT
-- below never sets min_access_tier, so every row it creates is correctly
-- NULL — this only excludes programs built elsewhere.
CREATE OR REPLACE FUNCTION public.select_library_template(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_leap_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
    v_warrior_id CONSTANT uuid := auth.uid();
    v_new_template_id UUID;
    v_old_block RECORD;
    v_new_block_id UUID;
    v_old_exercise RECORD;
    v_is_pro boolean;
    v_warrior_tier int;
    v_free_template_id uuid;
    v_range jsonb;
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

    v_is_pro := public.caller_has_pro_access();

    -- One free TEMPLATE, ever — only counts warrior_programs rows whose
    -- template was itself free/library-sourced (min_access_tier IS NULL).
    -- A program built via a paid feature (Customize Program, AI Coach —
    -- min_access_tier 'pro'/'first') never counts against this allowance,
    -- regardless of its current status.
    IF NOT v_is_pro AND EXISTS (
        SELECT 1 FROM warrior_programs wp
        JOIN program_templates pt ON pt.id = wp.template_id
        WHERE wp.warrior_id = v_warrior_id
          AND pt.min_access_tier IS NULL
    ) THEN
        RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_pro THEN
        SELECT strength_tier INTO v_warrior_tier FROM profiles WHERE id = v_warrior_id;

        -- Walk the same priority-ordered tier ranges as TIER_LOOKUP, first
        -- range with a published match wins (skip-if-missing, same as
        -- getRecommendations) — that template is the caller's one free pick.
        FOR v_range IN
          SELECT * FROM jsonb_array_elements(
            CASE COALESCE(v_warrior_tier, 0)
              WHEN 0 THEN '[{"min":0,"max":1},{"min":1,"max":2}]'
              WHEN 1 THEN '[{"min":0,"max":1},{"min":1,"max":2},{"min":2,"max":3}]'
              WHEN 2 THEN '[{"min":1,"max":2},{"min":2,"max":3},{"min":0,"max":1}]'
              WHEN 3 THEN '[{"min":2,"max":3},{"min":3,"max":4},{"min":1,"max":2}]'
              WHEN 4 THEN '[{"min":3,"max":4},{"min":4,"max":5},{"min":2,"max":3}]'
              WHEN 5 THEN '[{"min":4,"max":5},{"min":5,"max":6},{"min":3,"max":4}]'
              WHEN 6 THEN '[{"min":5,"max":6},{"min":6,"max":7},{"min":4,"max":5}]'
              WHEN 7 THEN '[{"min":6,"max":7},{"min":7,"max":9},{"min":5,"max":6}]'
              WHEN 8 THEN '[{"min":7,"max":9},{"min":6,"max":7}]'
              WHEN 9 THEN '[{"min":7,"max":9},{"min":6,"max":7}]'
              ELSE '[{"min":0,"max":1},{"min":1,"max":2}]'
            END::jsonb
          )
        LOOP
          SELECT id INTO v_free_template_id
          FROM program_templates
          WHERE is_library_template = true
            AND status = 'published'
            AND matching_criteria @> jsonb_build_object('goal', 'strength', 'tier_range', v_range)
          LIMIT 1;
          EXIT WHEN v_free_template_id IS NOT NULL;
        END LOOP;

        IF v_free_template_id IS DISTINCT FROM p_template_id THEN
          RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
        END IF;
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
