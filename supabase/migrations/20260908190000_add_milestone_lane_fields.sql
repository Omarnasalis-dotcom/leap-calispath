-- Milestone Lane onboarding/journey feature — schema foundation only (Phase 1).
-- Purely additive: 3 new nullable columns + one more guarded field on the
-- existing protected-fields trigger. No existing column, constraint, RLS
-- policy, or app code path is touched, so this migration has zero effect on
-- the live app until AuthGuard/UI are updated to read these fields (Phase 2+).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS primary_goal text,
  ADD COLUMN IF NOT EXISTS available_equipment text[];

-- Extend the protected-fields guard (most recently redefined by
-- supabase/migrations/20260903120000_fix_free_template_persistence.sql) with
-- onboarding_completed_at: once set, it cannot be changed via a direct
-- client update, matching the same set-once rationale as gender/country.
-- Every pre-existing check from that version is preserved verbatim — this
-- function has been extended by several migrations since the original
-- 20260814120000 one; omitting any of those checks here would silently
-- remove protection from entitlement/subscription fields.
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
    IF OLD.onboarding_completed_at IS NOT NULL AND NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at THEN
        RAISE EXCEPTION 'onboarding_completed_at can only be set once and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$function$;

-- Backfill: users who were already assessed before this feature shipped
-- must not be retroactively forced into the new onboarding lane. Runs as
-- the migration role (postgres/supabase_admin), which the trigger above
-- already exempts, so this is unaffected by the new guard.
UPDATE public.profiles
SET onboarding_completed_at = assessed_at
WHERE assessed_at IS NOT NULL
  AND onboarding_completed_at IS NULL;
