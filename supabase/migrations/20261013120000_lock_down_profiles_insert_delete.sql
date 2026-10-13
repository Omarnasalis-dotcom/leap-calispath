-- Audit 2026-10-13 (C1): a signed-in user could DELETE their own profiles row
-- and re-INSERT it with is_admin / is_coach / strength_tier / subscription_tier /
-- access_expires_at set to anything, because the guard trigger only fires on
-- UPDATE. profiles rows are only ever created by handle_new_user (SECURITY
-- DEFINER, runs as postgres) and removed by delete-user-account (service_role,
-- via the auth.users -> profiles CASCADE). The app never inserts or deletes a
-- profiles row directly, so client INSERT/DELETE can be removed outright.

REVOKE INSERT, DELETE ON public.profiles FROM authenticated, anon;
DROP POLICY IF EXISTS "Warriors insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Warriors delete own profile" ON public.profiles;

-- Defense in depth: if INSERT is ever re-granted, still reject protected
-- columns on insert the same way the UPDATE guard does. handle_new_user runs as
-- postgres and is bypassed by the first check, exactly like the UPDATE guard.
CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_admin, false)
     OR COALESCE(NEW.is_coach, false)
     OR COALESCE(NEW.strength_tier, 0) <> 0
     OR COALESCE(NEW.power_tier, 0) <> 0
     OR COALESCE(NEW.statics_tier, 0) <> 0
     OR COALESCE(NEW.glory_score, 0) <> 0
     OR COALESCE(NEW.power_points, 0) <> 0
     OR COALESCE(NEW.one_mm_points, 0) <> 0
     OR COALESCE(NEW.tournament_gp, 0) <> 0
     OR COALESCE(NEW.clash_win_streak, 0) <> 0
     OR COALESCE(NEW.streak, 0) <> 0
     OR COALESCE(NEW.trials_passed, 0) <> 0
     OR COALESCE(NEW.coach_beta_access, false)
     OR NEW.subscription_tier IS NOT NULL
     OR NEW.access_expires_at IS NOT NULL
     OR NEW.access_granted_at IS NOT NULL
     OR NEW.entitlement_source IS NOT NULL
     OR NEW.entitlement_period_start IS NOT NULL
     OR NEW.ai_coach_budget_usd IS NOT NULL
     OR NEW.rc_original_transaction_id IS NOT NULL
     OR NEW.invite_code_used IS NOT NULL
     OR NEW.coach_id IS NOT NULL
     OR NEW.community_id IS NOT NULL
     OR NEW.coaching_paused_at IS NOT NULL
     OR NEW.free_library_template_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'Privilege Escalation Detected: protected profile fields cannot be set on insert.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_protected_profile_fields_insert ON public.profiles;
CREATE TRIGGER enforce_protected_profile_fields_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_fields_insert();
