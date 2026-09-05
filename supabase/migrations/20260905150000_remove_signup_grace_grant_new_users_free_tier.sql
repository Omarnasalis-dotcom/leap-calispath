-- Re-applies 20260905130000 (undoing 20260905140000's revert). Decision:
-- ship this now rather than waiting for 1.2.1 to go live. New real
-- signups on the still-live 1.2.0 binary are being held off for the short
-- window until 1.2.1 replaces it, so the hard-lock risk that motivated
-- 20260905140000's revert is accepted as a deliberate, brief tradeoff
-- rather than an open-ended one. Existing users and existing
-- 'incident_grace_grant' profiles are unaffected either way.
--
-- This also happens to be the correct final behavior once 1.2.1 (which has
-- proper free-tier gating) is live — see 20260905130000 for the full
-- reasoning. No new signup should get automatic Max access going forward.
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
