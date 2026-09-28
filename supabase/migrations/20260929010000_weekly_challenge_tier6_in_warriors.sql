-- Weekly Challenge groups: tier 6 moves from Legends to Warriors (owner
-- decision 2026-09-29). Groups are now 0-2 -> 1, 3-6 -> 2, 7-9 -> 3, the
-- same as getUserGroup() in src/lib/weeklyChallenge.ts and the local copy in
-- WeeklyChallengeScreen.tsx. Bodies are otherwise unchanged from
-- 20260805120000_add_scheduled_reminder_infra.sql; CREATE OR REPLACE keeps
-- their grants (service_role only).
--
-- Ship together with the app release: until then the installed app still
-- shows tier 6 the Legends challenge, while these reminders would target
-- them for Warriors.

CREATE OR REPLACE FUNCTION public.get_weekly_challenge_target_users(p_group_id integer, p_preference_key text)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.assessed_at IS NOT NULL
    AND (CASE WHEN p.strength_tier <= 2 THEN 1 WHEN p.strength_tier <= 6 THEN 2 ELSE 3 END) = p_group_id
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id AND (np.prefs->>p_preference_key) = 'false'
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_weekly_challenge_users_without_entry(p_challenge_id uuid, p_group_id integer, p_preference_key text)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.assessed_at IS NOT NULL
    AND (CASE WHEN p.strength_tier <= 2 THEN 1 WHEN p.strength_tier <= 6 THEN 2 ELSE 3 END) = p_group_id
    AND NOT EXISTS (
      SELECT 1 FROM public.weekly_entries we WHERE we.challenge_id = p_challenge_id AND we.user_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id AND (np.prefs->>p_preference_key) = 'false'
    );
$function$;

-- Admin dashboard group filter. Also puts tier 9 in group 3 (it was in no
-- group before, unlike the app and the reminders).
CREATE OR REPLACE FUNCTION public.tier_in_group(p_tier integer, p_group_id integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_group_id IS NULL
    OR (p_group_id = 1 AND p_tier BETWEEN 0 AND 2)
    OR (p_group_id = 2 AND p_tier BETWEEN 3 AND 6)
    OR (p_group_id = 3 AND p_tier BETWEEN 7 AND 9);
$$;
