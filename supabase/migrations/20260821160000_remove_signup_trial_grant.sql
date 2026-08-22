-- Freemium pivot: new signups no longer get an automatic 14-day full-access
-- grant. Free tier (Strength World, Weekly Challenge, limited Workout
-- Library) is the default state for everyone now; Pro access is only ever
-- granted by an explicit trial claim or purchase (RevenueCat webhook) or a
-- comp/invite code (redeem_invite_code, unchanged). Not urgent while
-- app_config.paywall_enabled is false (see canAccessPro() in
-- entitlement.ts), but must land before that flag is ever turned back on,
-- so it ships now while this function is already being touched.
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
