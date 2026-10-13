-- Audit 2026-10-13: profiles.timezone is client-writable with no validation,
-- and a single invalid value threw inside get_users_needing_daily_reminder,
-- killing the 19:00 daily-reminder cron for EVERY user (not just the one with
-- the bad value). Two layers: coerce invalid zones to UTC on write, and make
-- the reminder query resilient to any bad value already stored.

-- 1. Coerce an invalid/blank timezone to UTC whenever a profile row is written.
CREATE OR REPLACE FUNCTION public.coerce_profile_timezone()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.timezone IS NULL
     OR NEW.timezone = ''
     OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    NEW.timezone := 'UTC';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS coerce_profile_timezone ON public.profiles;
CREATE TRIGGER coerce_profile_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.coerce_profile_timezone();

-- 2. Harden the reminder query: validate the timezone via journey_points_tz()
--    (returns the zone if valid, else UTC) everywhere it is used, so one bad
--    row can never again throw for the whole run. Only the two tz expressions
--    changed; the rest of the body is identical to the live function.
CREATE OR REPLACE FUNCTION public.get_users_needing_daily_reminder()
 RETURNS TABLE(user_id uuid, display_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH eligible AS (
    SELECT id, display_name, public.journey_points_tz(NULLIF(timezone, '')) AS tz
    FROM public.profiles
    WHERE assessed_at IS NOT NULL
      AND EXTRACT(HOUR FROM (now() AT TIME ZONE public.journey_points_tz(NULLIF(timezone, ''))))::int = 19
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
  )
  AND (
    EXISTS (
      SELECT 1 FROM activity a
      WHERE a.uid = e.id AND a.ts > now() - interval '14 days'
    )
    OR EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.user_id = e.id
        AND GREATEST(COALESCE(s.refreshed_at, s.created_at), s.updated_at) > now() - interval '14 days'
    )
  );
$function$;
