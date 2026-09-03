-- Reinstates 20260902050000's automatic 14-day Max-tier signup grant,
-- undoing 20260903010000's revert. Correction to that migration's own
-- reasoning: it assumed Apple's reviewer creates a fresh account during
-- review (guideline 3.1.2 testing), which handle_new_user() would then
-- auto-grant, hiding the paywall from them. Confirmed with the user this
-- is wrong — Apple already has a pre-existing test account for this app,
-- reused across review cycles. handle_new_user() only fires once, at
-- INSERT time on auth.users; reinstating it here has zero effect on that
-- already-existing account, so there's no conflict between protecting
-- real new signups (the grace window this grant exists for) and Apple
-- seeing a real, gated account.
--
-- The reviewer's specific account is being reset to genuinely free tier
-- separately, directly (admin-web's revoke tool), not through this
-- migration — that account's entitlement_source isn't 'incident_grace_grant'
-- so it's unaffected by anything here either way.
--
-- Same shape/label as 20260902050000 for continuity with the existing
-- backfilled rows (entitlement_source = 'incident_grace_grant') — still
-- findable/revertable as one cohort whenever this is retired for real.
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
