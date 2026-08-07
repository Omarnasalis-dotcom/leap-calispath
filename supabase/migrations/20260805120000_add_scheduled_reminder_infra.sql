-- Infrastructure for scheduled (system-initiated, not user-action-triggered)
-- notifications: a daily "you haven't trained today" nudge, and weekly
-- challenge "started" / "ending soon, you haven't finished it" reminders.
-- Everything so far fired from one specific user's own request; these query
-- across many users at once and need pg_cron (scheduling) + pg_net (so
-- Postgres can call the sending Edge Function on a timer) — both available
-- on this project's Postgres image but not yet enabled.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Dedup flags: without these, every cron tick that finds a not-yet-announced
-- challenge would re-announce it. Nullable, set once the batch send for that
-- challenge completes.
alter table "public"."weekly_challenges"
  add column "started_notification_sent_at" timestamptz,
  add column "ending_reminder_sent_at" timestamptz;

-- Every user eligible for tonight's "come back and train" reminder: assessed,
-- their local clock (per profiles.timezone, defaulting to UTC for the OAuth
-- signups that never got a timezone recorded) currently reads 19:00, hasn't
-- done anything today in their own local day, hasn't already been sent one
-- today, and hasn't opted out. NOT EXISTS throughout rather than NOT IN —
-- several of the activity tables have a nullable user_id, and NOT IN against
-- a set containing NULL silently matches nothing at all.
CREATE OR REPLACE FUNCTION public.get_users_needing_daily_reminder()
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH eligible AS (
    SELECT id, display_name, COALESCE(NULLIF(timezone, ''), 'UTC') AS tz
    FROM public.profiles
    WHERE assessed_at IS NOT NULL
      AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'UTC')))::int = 19
  ),
  activity AS (
    SELECT warrior_id AS uid, completed_at AS ts FROM public.workout_logs WHERE warrior_id IS NOT NULL
    UNION ALL SELECT user_id, submitted_at FROM public.weekly_entries WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM public.one_min_max_logs WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, logged_at FROM public.static_holds WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, attempted_at FROM public.trial_history WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, assessed_at FROM public.power_assessments WHERE user_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM public.arena_attempts WHERE user_id IS NOT NULL
  )
  SELECT e.id, e.display_name
  FROM eligible e
  WHERE NOT EXISTS (
    SELECT 1 FROM activity a
    WHERE a.uid = e.id
      AND (a.ts AT TIME ZONE e.tz)::date = (now() AT TIME ZONE e.tz)::date
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = e.id
      AND n.type = 'daily_reminder'
      AND (n.created_at AT TIME ZONE e.tz)::date = (now() AT TIME ZONE e.tz)::date
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.notification_preferences np
    WHERE np.user_id = e.id AND (np.prefs->>'daily_reminder') = 'false'
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_users_needing_daily_reminder() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_needing_daily_reminder() TO service_role;

-- Challenges whose week has started (week_start has arrived) but nobody's
-- been told yet — week_start <= CURRENT_DATE (not "=") so a challenge the
-- admin creates a day or two late still gets announced on the next tick
-- instead of being silently missed.
CREATE OR REPLACE FUNCTION public.get_pending_weekly_challenge_announcements()
RETURNS TABLE(challenge_id uuid, title text, group_id integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT id, title, group_id
  FROM public.weekly_challenges
  WHERE is_active = true
    AND started_notification_sent_at IS NULL
    AND week_start <= CURRENT_DATE;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pending_weekly_challenge_announcements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_weekly_challenge_announcements() TO service_role;

-- Weeks run Saturday through the following Friday (7 days) — see
-- getCurrentWeekStart() in src/lib/weeklyChallenge.ts. "48 hours before it
-- ends" = week_start + 5 days (Thursday). Checked with >= rather than a
-- narrow window so an hourly cron tick can't miss it.
CREATE OR REPLACE FUNCTION public.get_pending_weekly_challenge_ending_reminders()
RETURNS TABLE(challenge_id uuid, title text, group_id integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT id, title, group_id
  FROM public.weekly_challenges
  WHERE is_active = true
    AND ending_reminder_sent_at IS NULL
    AND now() >= (week_start::timestamptz + interval '7 days' - interval '48 hours');
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pending_weekly_challenge_ending_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_weekly_challenge_ending_reminders() TO service_role;

-- Target audience for a "started" announcement: every assessed user in that
-- challenge's tier group who hasn't opted out. Group mapping mirrors
-- getUserGroup() in src/lib/weeklyChallenge.ts exactly (tiers 0-2 -> group 1,
-- 3-5 -> group 2, 6+ -> group 3).
CREATE OR REPLACE FUNCTION public.get_weekly_challenge_target_users(p_group_id integer, p_preference_key text)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.assessed_at IS NOT NULL
    AND (CASE WHEN p.strength_tier <= 2 THEN 1 WHEN p.strength_tier <= 5 THEN 2 ELSE 3 END) = p_group_id
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id AND (np.prefs->>p_preference_key) = 'false'
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_weekly_challenge_target_users(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_challenge_target_users(integer, text) TO service_role;

-- Same target audience, but narrowed to users who haven't submitted an
-- entry for this specific challenge yet — used for the "ending soon, you
-- haven't finished it" reminder.
CREATE OR REPLACE FUNCTION public.get_weekly_challenge_users_without_entry(p_challenge_id uuid, p_group_id integer, p_preference_key text)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.assessed_at IS NOT NULL
    AND (CASE WHEN p.strength_tier <= 2 THEN 1 WHEN p.strength_tier <= 5 THEN 2 ELSE 3 END) = p_group_id
    AND NOT EXISTS (
      SELECT 1 FROM public.weekly_entries we WHERE we.challenge_id = p_challenge_id AND we.user_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id AND (np.prefs->>p_preference_key) = 'false'
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_weekly_challenge_users_without_entry(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_challenge_users_without_entry(uuid, integer, text) TO service_role;
