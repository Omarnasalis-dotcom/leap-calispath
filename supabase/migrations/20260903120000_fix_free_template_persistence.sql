-- Bug: a free-tier user's one allowed library-template pick becomes
-- permanently unusable again the moment they've ever had ANY
-- min_access_tier-null program in their history — including their own
-- original pick. select_library_template's old gate was "have you ever had
-- a free program" (an EXISTS check with no regard for WHICH template),
-- not "is this the same free program you're allowed." Concretely: free
-- user picks Template A → later uses an AI Coach paid feature (marks
-- Template A completed, creates a new min_access_tier-gated program) →
-- that access expires → they try to go back to Template A → rejected with
-- PRO_REQUIRED, because the EXISTS check still finds Template A's own old
-- (completed) row in their history.
--
-- Fix: persist WHICH specific original library template (not the per-pick
-- clone id, which changes every time — the stable is_library_template=true
-- row) is this user's permanent free pick, decided once, on their first
-- successful pick. After that, the only thing select_library_template ever
-- checks for a free-tier caller is "does p_template_id match your flag" —
-- always allowing a return to the same one, never a different one.
ALTER TABLE public.profiles
  ADD COLUMN free_library_template_id uuid REFERENCES public.program_templates(id);

CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR
       NEW.is_coach IS DISTINCT FROM OLD.is_coach OR
       NEW.strength_tier IS DISTINCT FROM OLD.strength_tier OR
       NEW.power_tier IS DISTINCT FROM OLD.power_tier OR
       NEW.statics_tier IS DISTINCT FROM OLD.statics_tier OR
       NEW.glory_score IS DISTINCT FROM OLD.glory_score OR
       NEW.streak IS DISTINCT FROM OLD.streak OR
       NEW.trials_passed IS DISTINCT FROM OLD.trials_passed OR
       NEW.power_points IS DISTINCT FROM OLD.power_points OR
       NEW.one_mm_points IS DISTINCT FROM OLD.one_mm_points OR
       NEW.clash_win_streak IS DISTINCT FROM OLD.clash_win_streak OR
       NEW.tournament_gp IS DISTINCT FROM OLD.tournament_gp OR
       NEW.access_granted_at IS DISTINCT FROM OLD.access_granted_at OR
       NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at OR
       NEW.invite_code_used IS DISTINCT FROM OLD.invite_code_used OR
       NEW.coach_beta_access IS DISTINCT FROM OLD.coach_beta_access OR
       NEW.entitlement_source IS DISTINCT FROM OLD.entitlement_source OR
       NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier OR
       NEW.entitlement_period_start IS DISTINCT FROM OLD.entitlement_period_start OR
       NEW.ai_coach_budget_usd IS DISTINCT FROM OLD.ai_coach_budget_usd OR
       NEW.rc_original_transaction_id IS DISTINCT FROM OLD.rc_original_transaction_id OR
       NEW.duplicate_subscription_flagged_at IS DISTINCT FROM OLD.duplicate_subscription_flagged_at OR
       NEW.duplicate_subscription_previous_transaction_id IS DISTINCT FROM OLD.duplicate_subscription_previous_transaction_id OR
       NEW.free_library_template_id IS DISTINCT FROM OLD.free_library_template_id
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;
    IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
        RAISE EXCEPTION 'Gender can only be set once and cannot be changed.';
    END IF;
    IF OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
        RAISE EXCEPTION 'Country can only be set once and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$function$;

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
    v_locked_free_template_id uuid;
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

    IF NOT v_is_pro THEN
        SELECT free_library_template_id INTO v_locked_free_template_id
        FROM profiles WHERE id = v_warrior_id;

        IF v_locked_free_template_id IS NOT NULL THEN
            -- Already has a permanent free pick — this is the only one
            -- they're ever allowed to select, but they can always come
            -- back to it, no matter what else has happened to their
            -- account since (a paid feature used and expired, a tier
            -- change, an ended/deleted program).
            IF p_template_id IS DISTINCT FROM v_locked_free_template_id THEN
                RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
            END IF;
        ELSE
            -- First-ever pick: same tier-range matching logic as before,
            -- unchanged, just persisted on success instead of only
            -- checked-and-forgotten.
            SELECT strength_tier INTO v_warrior_tier FROM profiles WHERE id = v_warrior_id;

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
              ORDER BY id ASC
              LIMIT 1;
              EXIT WHEN v_free_template_id IS NOT NULL;
            END LOOP;

            IF v_free_template_id IS DISTINCT FROM p_template_id THEN
              RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
            END IF;

            UPDATE profiles SET free_library_template_id = v_free_template_id WHERE id = v_warrior_id;
        END IF;
    END IF;

    INSERT INTO program_templates (name, description, coach_id)
    SELECT name, description, v_leap_profile_id
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

    UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

    INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
    VALUES (v_leap_profile_id, v_warrior_id, v_new_template_id, 'active');

    RETURN v_new_template_id;
END;
$function$;
