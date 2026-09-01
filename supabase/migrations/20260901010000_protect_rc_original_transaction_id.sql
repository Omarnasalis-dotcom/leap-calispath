-- Security audit finding: rc_original_transaction_id (added 20260820010000)
-- was the one entitlement-related profiles column never added to
-- guard_profile_protected_fields()'s protected list — every sibling column
-- (access_expires_at, entitlement_source, subscription_tier, ...) is
-- protected, this one was missed. profiles has a blanket table-level
-- `GRANT UPDATE ... TO authenticated` plus an own-row RLS policy, so this
-- column was directly client-writable with zero protection. Doesn't expose
-- a way to gain unauthorized paid access (subscription_tier/
-- access_expires_at/entitlement_source all stay protected, and the
-- multi-account-revoke guard requires entitlement_source = 'rc_subscription'
-- too), but a client could set their own rc_original_transaction_id to
-- match a real victim's Apple transaction id — caller_rc_transaction_id()
-- would then tag their own ai_coach_requests rows with it, which could
-- later get reparented onto the victim's account on a genuine restore,
-- inflating the victim's usage count against their real caps. Same
-- protection treatment as every other entitlement field.
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
       NEW.rc_original_transaction_id IS DISTINCT FROM OLD.rc_original_transaction_id
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
