-- Reverts 20260905130000 for now. That migration removed the automatic
-- 14-day Max grant from handle_new_user() to close a revenue leak and fix
-- a 2026-09-05 App Store rejection — but it applies to every new signup
-- regardless of app binary, and the currently *live* version is still
-- 1.2.0, which predates the freemium soft-gate redesign and hard-locks any
-- account with no entitlement (the same architecture that caused the
-- 2026-09-02 incident this whole grant exists to protect against). Removing
-- the grant today would immediately hard-lock every real new signup on the
-- live 1.2.0 binary.
--
-- Restoring 20260903040000's grant unchanged until 1.2.1 (which has the
-- proper free-tier gating) actually replaces 1.2.0 as the live version —
-- at that point, re-apply 20260905130000's plain (no-grant) version for
-- real. Don't repeat this mistake: check which version is *live*, not
-- which version is under review, before touching this trigger again.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    display_name,
    gender,
    country,
    timezone,
    updated_at,
    access_granted_at,
    access_expires_at,
    entitlement_source,
    subscription_tier,
    ai_coach_budget_usd,
    entitlement_period_start
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC'),
    NOW(),
    NOW(),
    NOW() + interval '14 days',
    'incident_grace_grant',
    'max',
    10.00,
    NOW()
  );

  RETURN NEW;
END;
$function$
;
