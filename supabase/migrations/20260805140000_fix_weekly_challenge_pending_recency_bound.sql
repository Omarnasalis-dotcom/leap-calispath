-- Incident 2026-08-05: the first deploy of get_pending_weekly_challenge_*
-- treated EVERY historical is_active=true weekly_challenges row as pending,
-- because started_notification_sent_at/ending_reminder_sent_at were NULL by
-- default for every pre-existing row, not just current ones — nothing
-- bounded "pending" to "this week's challenge." The very first invocation
-- announced/reminded on the entire backlog at once: 3,431 notifications to
-- 160 real users, 1,760 actual pushes delivered. Both functions are fixed
-- here to only ever consider a challenge whose own week hasn't fully
-- elapsed, regardless of how stale its is_active flag is.
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
    AND week_start <= CURRENT_DATE
    -- Grace window for a challenge the admin creates a day or two late —
    -- NOT "any is_active row ever," which is what caused the incident.
    AND week_start >= CURRENT_DATE - 2;
$function$;

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
    -- The challenge's own 7-day week must not have fully elapsed yet.
    AND week_start >= CURRENT_DATE - 7
    AND now() >= (week_start::timestamptz + interval '7 days' - interval '48 hours');
$function$;
