-- Free/First/Pro/Max tier system (2026-08-29). Replaces the binary
-- Pro/free entitlement with a real per-user tier, while keeping
-- access_expires_at as the single source of truth for "is access active
-- right now" — subscription_tier says WHICH tier, access_expires_at says
-- WHETHER it's currently valid. An expired tier is never trusted; every
-- consumer re-derives "effective tier" from both columns together (see
-- caller_effective_tier() below), never from subscription_tier alone.
ALTER TABLE public.profiles
  ADD COLUMN subscription_tier text,
  ADD COLUMN entitlement_period_start timestamptz,
  ADD COLUMN ai_coach_budget_usd numeric(10,4);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IS NULL OR subscription_tier IN ('first', 'pro', 'max'));

-- Backfill: every existing profile with active access (any entitlement_source)
-- gets 'pro' — the closest match to the old all-or-nothing "full access"
-- model. In practice this mostly affects grandfathered/invite_code/admin_grant
-- accounts, not real rc_subscription customers: the original 3-product IAP
-- setup was never approved by Apple (paywall_enabled has been false in
-- production since 2026-08-21), so there are effectively no live paying
-- subscribers to reclassify. Must ship in the same migration as
-- caller_effective_tier() below — a window with the tier-aware function live
-- but this backfill not yet applied would read every real active-access
-- profile as free.
UPDATE public.profiles
SET
  subscription_tier = 'pro',
  entitlement_period_start = COALESCE(access_granted_at, now()),
  ai_coach_budget_usd = 4.00
WHERE access_expires_at > now()
  AND subscription_tier IS NULL;

-- Full body carried forward from 20260816100000 (the current live version,
-- confirmed by direct read) with the 3 new columns added to the protected
-- list — same treatment as every other entitlement field, never
-- client-writable directly.
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
       NEW.ai_coach_budget_usd IS DISTINCT FROM OLD.ai_coach_budget_usd
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

-- Single source of truth for "which tier does this caller effectively have
-- right now" — mirrors canAccessPro()'s kill-switch/admin/coach bypass
-- logic, extended to return a tier instead of a boolean. 'max' for the
-- kill-switch-off and admin/coach cases (the richest tier, matching today's
-- "everyone is Pro while the switch is off" shape now that there's more
-- than one paid tier).
CREATE OR REPLACE FUNCTION public.caller_effective_tier()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_paywall_enabled boolean;
  v_profile RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'free';
  END IF;

  SELECT bool_or(paywall_enabled) INTO v_paywall_enabled FROM app_config;
  IF NOT COALESCE(v_paywall_enabled, false) THEN
    RETURN 'max';
  END IF;

  SELECT is_admin, is_coach, access_expires_at, subscription_tier
  INTO v_profile
  FROM profiles WHERE id = v_uid;

  IF v_profile.is_admin OR v_profile.is_coach THEN
    RETURN 'max';
  END IF;

  IF v_profile.access_expires_at > now() AND v_profile.subscription_tier IS NOT NULL THEN
    RETURN v_profile.subscription_tier;
  END IF;

  RETURN 'free';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.caller_effective_tier() TO authenticated;

-- Signature/behavior unchanged for every existing caller (5 RPCs + the
-- edge function) — still "does this caller have any paid tier at all,"
-- First included, since First/Pro/Max all set access_expires_at the same way.
CREATE OR REPLACE FUNCTION public.caller_has_pro_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.caller_effective_tier() <> 'free';
$function$;

GRANT EXECUTE ON FUNCTION public.caller_has_pro_access() TO authenticated;

-- The one feature (Customize Program) where First is excluded but Pro/Max
-- aren't.
CREATE OR REPLACE FUNCTION public.caller_is_pro_or_max()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.caller_effective_tier() IN ('pro', 'max');
$function$;

GRANT EXECUTE ON FUNCTION public.caller_is_pro_or_max() TO authenticated;
