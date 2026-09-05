-- Retires the automatic 14-day Max-tier grant from handle_new_user() for
-- NEW signups going forward. Existing profiles already carrying
-- entitlement_source = 'incident_grace_grant' (from 20260902050000 /
-- 20260903040000) are untouched here and simply expire naturally 14 days
-- after their grant — this migration only stops handing the same grant to
-- accounts created from this point on.
--
-- Root cause for doing this now: a 2026-09-05 App Store rejection
-- (Guideline 2.1(b), "cannot locate the In-App Purchases") traced back to a
-- brand-new Sign in with Apple account created during that review window,
-- which got this grant and was therefore never shown the paywall. The same
-- grant has also been silently handing every real new signup 14 days of
-- free Max access since 2026-09-02 — an unintended revenue leak independent
-- of App Review. Reverting to 20260821160000's plain (no-grant) INSERT.
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
    updated_at
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
    NOW()
  );

  RETURN NEW;
END;
$function$
;
