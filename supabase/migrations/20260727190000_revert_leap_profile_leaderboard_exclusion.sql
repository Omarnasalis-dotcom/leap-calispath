-- Reverts the Leap-system-profile exclusion from coach_leaderboard added in
-- 20260727180000. Turns out production currently has zero real coach
-- accounts with any client assignments — Admin and Leap were the only two
-- coach_id values in warrior_programs at all — so excluding Leap left the
-- panel showing just "Admin" with nothing else, which reads as broken
-- rather than accurate. Bringing the Leap row back so self-service volume
-- (22 assignments) is visible somewhere on the panel; it'll naturally stop
-- dominating once real coaches have real clients. Same signature as
-- 20260727180000 — CREATE OR REPLACE preserves grants, no DROP needed.
CREATE OR REPLACE FUNCTION public.admin_get_coaching_analytics(p_source text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := current_date - ((extract(dow FROM current_date)::int + 1) % 7);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'templates', jsonb_build_object(
      'total', (
        SELECT count(*) FROM program_templates pt
        WHERE public.coach_matches_source(pt.coach_id, p_source)
      ),
      'library_count', (
        SELECT count(*) FROM program_templates pt
        WHERE pt.is_library_template = true
          AND public.coach_matches_source(pt.coach_id, p_source)
      ),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(coalesce(s.status, 'unknown'), s.n), '{}'::jsonb)
        FROM (
          SELECT status, count(*) AS n FROM program_templates pt
          WHERE public.coach_matches_source(pt.coach_id, p_source)
          GROUP BY status
        ) s
      )
    ),
    'assignments', jsonb_build_object(
      'total', (
        SELECT count(*) FROM warrior_programs wp
        WHERE public.coach_matches_source(wp.coach_id, p_source)
      ),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(coalesce(s.status, 'unknown'), s.n), '{}'::jsonb)
        FROM (
          SELECT status, count(*) AS n FROM warrior_programs wp
          WHERE public.coach_matches_source(wp.coach_id, p_source)
          GROUP BY status
        ) s
      )
    ),
    'workout_logs', jsonb_build_object(
      'total', (
        SELECT count(*) FROM workout_logs wl
        JOIN warrior_programs wp ON wp.id = wl.warrior_program_id
        WHERE public.coach_matches_source(wp.coach_id, p_source)
      ),
      'last_7_days', (
        SELECT count(*) FROM workout_logs wl
        JOIN warrior_programs wp ON wp.id = wl.warrior_program_id
        WHERE wl.completed_at >= now() - interval '7 days'
          AND public.coach_matches_source(wp.coach_id, p_source)
      ),
      'last_28_days', (
        SELECT count(*) FROM workout_logs wl
        JOIN warrior_programs wp ON wp.id = wl.warrior_program_id
        WHERE wl.completed_at >= now() - interval '28 days'
          AND public.coach_matches_source(wp.coach_id, p_source)
      ),
      'active_warriors_last_7_days', (
        SELECT count(DISTINCT wl.warrior_id) FROM workout_logs wl
        JOIN warrior_programs wp ON wp.id = wl.warrior_program_id
        WHERE wl.completed_at >= now() - interval '7 days'
          AND public.coach_matches_source(wp.coach_id, p_source)
      )
    ),
    'coach_leaderboard', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.active_clients DESC, x.templates DESC), '[]'::jsonb)
      FROM (
        SELECT p.id AS coach_id, p.display_name,
               (SELECT count(DISTINCT wp.warrior_id) FROM warrior_programs wp
                WHERE wp.coach_id = p.id AND wp.status = 'active') AS active_clients,
               (SELECT count(DISTINCT wp2.warrior_id) FROM warrior_programs wp2
                JOIN workout_logs wl ON wl.warrior_program_id = wp2.id
                WHERE wp2.coach_id = p.id AND wp2.status = 'active'
                  AND wl.completed_at >= v_week_start) AS active_clients_this_week,
               (SELECT count(*) FROM program_templates pt WHERE pt.coach_id = p.id) AS templates,
               (SELECT count(*) FROM program_templates pt
                WHERE pt.coach_id = p.id AND pt.status = 'published') AS published_templates
        FROM profiles p
        WHERE p.is_coach = true OR p.is_admin = true
        LIMIT 100
      ) x
    )
  );
END;
$function$;
