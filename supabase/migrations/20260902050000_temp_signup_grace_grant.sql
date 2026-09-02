-- TEMPORARY reinstatement of an automatic signup grant, reversing the
-- freemium pivot's 20260821160000 (which deliberately removed this so Pro
-- access would only ever come from a real trial/purchase/comp code). This
-- undoes that on purpose, for now: 20260902020000 backfilled every
-- EXISTING profile with a 14-day Max-tier grace window so paywall_enabled
-- could go back on without repeating the 20260831080000/20260902010000
-- incident, but that backfill only touched rows that existed at the time —
-- any user signing up after it ran gets access_granted_at/access_expires_at
-- = NULL, which resolves to 'free' under the current tier system
-- regardless of the kill switch. This closes that gap by granting new
-- signups the exact same shape of grace window.
--
-- entitlement_source = 'incident_grace_grant' deliberately reuses
-- 20260902020000's label rather than introducing a new one — so every
-- account covered by this rollout window, existing or new, is findable
-- with one WHERE clause when it's time to clean this up.
--
-- This is scoped to the same grace-period rollout as 20260902020000/
-- 20260902030000/20260902040000, not a return to the pre-freemium
-- trial-for-everyone model as policy. When the rollout is actually ready
-- for real enforcement, a follow-up migration should restore
-- handle_new_user() to 20260821160000's plain (no-grant) version.
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
