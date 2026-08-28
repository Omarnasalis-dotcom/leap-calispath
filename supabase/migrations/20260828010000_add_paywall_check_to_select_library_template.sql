-- select_library_template had no server-side Pro/paywall check at all —
-- confirmed via Training Center security audit (2026-08-28). Any
-- authenticated user could call it directly with any published library
-- template id (ids are already exposed by getAllPublishedTemplates) and
-- get the full Pro program cloned and assigned as their active program,
-- for free, entirely bypassing the client's isProgramLocked check and the
-- paywall UI. create_custom_program_from_workouts already does the
-- equivalent server-side check for the Workouts-tab "build your own"
-- path (20260822040000_add_create_custom_program_from_workouts_rpc.sql);
-- this brings the Program Templates path to parity.
--
-- The Program Templates client gate is NOT is_free-column-driven — only
-- the single template that best matches the caller's own current
-- strength_tier is free (src/lib/templateLibrary.ts's getRecommendations,
-- TIER_LOOKUP), every other published library template is Pro regardless
-- of its own is_free value. So the check here has to replicate "is this
-- template the caller's own recommended top pick," not just read a
-- column. TIER_LOOKUP is ported as a literal CASE below — same "small,
-- fixed, a deploy not a data migration" rationale as the TS original;
-- keep the two in sync by hand if it ever changes.
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
    v_paywall_enabled boolean;
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

    -- Mirrors canAccessPro() (src/lib/entitlement.ts) server-side, same
    -- as create_custom_program_from_workouts.
    SELECT bool_or(paywall_enabled) INTO v_paywall_enabled FROM app_config;
    v_is_pro := NOT COALESCE(v_paywall_enabled, false)
      OR EXISTS (SELECT 1 FROM profiles WHERE id = v_warrior_id AND (is_admin OR is_coach))
      OR EXISTS (SELECT 1 FROM profiles WHERE id = v_warrior_id AND access_expires_at > now());

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
