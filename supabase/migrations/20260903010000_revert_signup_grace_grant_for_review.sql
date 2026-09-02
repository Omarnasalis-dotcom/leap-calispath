-- Restores handle_new_user() to 20260821160000's plain (no-grant) version,
-- undoing 20260902050000's temporary reinstatement — see
-- paywall_incident_grace_grant_2026_09_02 memory for the full history.
--
-- Why now: submitting this build for App Store review. Apple's reviewer
-- creates a fresh account to test the subscription flow (guideline 3.1.2);
-- with the auto-grant still active, that account would land with 14 days
-- of Max access already unlocked and never see the real paywall, risking
-- rejection and definitely preventing a real review of the IAP flow.
--
-- This ONLY affects new signups from here forward. Existing profiles
-- already carrying entitlement_source = 'incident_grace_grant' (from
-- 20260902020000's backfill) are untouched — real users affected by the
-- original incident keep their 14-day window; only the tap that was
-- auto-granting it to new signups is closed.
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
