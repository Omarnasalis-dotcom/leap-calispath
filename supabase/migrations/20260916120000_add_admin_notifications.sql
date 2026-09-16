-- Admin-facing notifications: new signup, new (first-time) subscriber.
-- No "admin alert" pattern existed anywhere before this — built fresh,
-- reusing the same public.notifications table/RLS every other notification
-- already goes through (admin-web's NotificationsPage already reads this
-- table scoped to whichever authenticated user is signed in, admin or
-- coach alike, so a real admin row shows up there automatically, no
-- separate admin table needed). In-app only, no push: admins use the web
-- panel, not the mobile app, so there is no push token to send to in
-- practice (2026-09-16 decision).
CREATE OR REPLACE FUNCTION public.notify_admins(
  p_type text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id uuid;
BEGIN
  FOR v_admin_id IN SELECT id FROM public.profiles WHERE is_admin = true
  LOOP
    -- Same lazy-default-enabled opt-out convention as create_notification/
    -- notify_coach_of_achievement: no row or no key for this type = enabled.
    IF NOT EXISTS (
      SELECT 1 FROM public.notification_preferences
      WHERE user_id = v_admin_id AND (prefs->>p_type) = 'false'
    ) THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (v_admin_id, p_type, p_title, p_body, p_data);
    END IF;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- handle_new_user(): notify every admin the moment a new profile is
-- created (2026-09-16 — "Notify admin when a new user joins"). The
-- notify_admins call is wrapped in its own exception handler — a failure
-- in here must never roll back the profile insert (and therefore the
-- entire auth.users signup transaction); a missed admin notification is
-- vastly preferable to signup itself breaking for everyone.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_display_name text;
BEGIN
  -- Insert the new user into the profiles table, mapping all metadata correctly
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

  BEGIN
    v_display_name := COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', '')), ''),
      NEW.email,
      'A new user'
    );
    PERFORM public.notify_admins(
      'new_signup',
      'New Signup',
      v_display_name || ' just joined Leap.',
      jsonb_build_object('user_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admins failed during handle_new_user for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
