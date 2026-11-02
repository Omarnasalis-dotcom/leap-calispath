-- Fast timezone check (2026-10-31 DB health check).
-- journey_points_tz() scanned pg_timezone_names on every call: ~56 ms warm,
-- ~800 ms on a fresh connection, and it runs per row in
-- get_users_needing_daily_reminder (675 assessed users -> 38 s) and per member
-- in get_journey_community_board. PostgREST cancels at 8 s, so the daily
-- reminder RPC has failed every hour since 20261013120300 (0 reminders sent).
--
-- Same answer for every input: names in pg_timezone_names are copied into an
-- indexed table and checked there first; anything not in the table (a zone
-- added by a later Postgres tzdata update, or an invalid value) still falls
-- through to the old pg_timezone_names check. coerce_profile_timezone is left
-- as is: it runs as the signed-in user and only when timezone changes.

CREATE TABLE IF NOT EXISTS public.valid_timezones (
  name text PRIMARY KEY
);

-- Only read inside SECURITY DEFINER functions owned by postgres.
ALTER TABLE public.valid_timezones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.valid_timezones FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.valid_timezones TO service_role;

INSERT INTO public.valid_timezones (name)
SELECT DISTINCT name FROM pg_timezone_names
ON CONFLICT (name) DO NOTHING;

-- Same signature, so the existing grants (postgres, service_role) carry over.
CREATE OR REPLACE FUNCTION public.journey_points_tz(p_tz text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_tz IS NULL THEN 'UTC'
    WHEN EXISTS (SELECT 1 FROM public.valid_timezones WHERE name = p_tz) THEN p_tz
    WHEN EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN p_tz
    ELSE 'UTC'
  END;
$function$;
