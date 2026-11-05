-- current_maxes sets the strict maxes the AI Coach's build safety check uses
-- (blockHelpers.ts newerMax), and it was missing from the protected list, so
-- a modified client could write it directly and skip the checks in
-- ai_coach_save_athlete_update (known keys, whole numbers, 0-500). Only that
-- function writes it, and it runs as postgres, so the app is unaffected.
-- Same definition as 20260926020000 plus the one new line.
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
       NEW.free_library_template_id IS DISTINCT FROM OLD.free_library_template_id OR
       -- 2026-09-26 (audit M1, M2, L5)
       NEW.coaching_paused_at IS DISTINCT FROM OLD.coaching_paused_at OR
       NEW.coaching_paused_reason IS DISTINCT FROM OLD.coaching_paused_reason OR
       NEW.community_id IS DISTINCT FROM OLD.community_id OR
       NEW.coach_id IS DISTINCT FROM OLD.coach_id OR
       NEW.best_times IS DISTINCT FROM OLD.best_times OR
       NEW.power_pbs IS DISTINCT FROM OLD.power_pbs OR
       NEW.one_mm_rank IS DISTINCT FROM OLD.one_mm_rank OR
       NEW.assessment_locked_until IS DISTINCT FROM OLD.assessment_locked_until OR
       NEW.email IS DISTINCT FROM OLD.email OR
       -- 2026-11-05: only ai_coach_save_athlete_update writes this; it moves the build safety check
       NEW.current_maxes IS DISTINCT FROM OLD.current_maxes
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;
    IF OLD.display_name IS NOT NULL AND NEW.display_name IS DISTINCT FROM OLD.display_name THEN
        RAISE EXCEPTION 'Username can only be set once and cannot be changed.';
    END IF;
    IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
        RAISE EXCEPTION 'Gender can only be set once and cannot be changed.';
    END IF;
    IF OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
        RAISE EXCEPTION 'Country can only be set once and cannot be changed.';
    END IF;
    IF OLD.onboarding_completed_at IS NOT NULL AND NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at THEN
        RAISE EXCEPTION 'onboarding_completed_at can only be set once and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$function$;
