-- Coach-assigned vs self-selected filter for the Coaching Analytics page.
-- "Self selected" = the warrior picked a template from the self-service
-- library, with no real coach involved — represented by the fixed "Leap"
-- house account (LEAP_SYSTEM_PROFILE_ID, is_coach=true, is_admin=false)
-- that owns program_templates/warrior_programs rows in that case, per
-- 20260709130000_add_leap_system_profile.sql. "Coach assigned" = any real
-- coach_id.
--
-- Also excludes the Leap account from coach_leaderboard — it's a system
-- placeholder, not a real coach, and was previously showing up there
-- (is_coach=true qualifies it for the existing WHERE clause) attributing
-- self-service engagement to a fake "Leap" coach row.

-- 1. Shared source-match helper, single source of truth for the fixed
--    Leap system profile id (mirrors every other LEAP_SYSTEM_PROFILE_ID
--    check already duplicated across src/ and admin-web/src/). Pure
--    computation, no table access, no admin gating needed.
CREATE OR REPLACE FUNCTION public.coach_matches_source(p_coach_id uuid, p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_source IS NULL
    OR (p_source = 'self' AND p_coach_id = '00000000-0000-0000-0000-000000000001'::uuid)
    OR (p_source = 'coach' AND p_coach_id != '00000000-0000-0000-0000-000000000001'::uuid);
$$;

-- 2. admin_get_coaching_analytics: add p_source ('coach' | 'self' | NULL).
DROP FUNCTION IF EXISTS public.admin_get_coaching_analytics();

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
        WHERE (p.is_coach = true OR p.is_admin = true)
          AND p.id != '00000000-0000-0000-0000-000000000001'
        LIMIT 100
      ) x
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_coaching_analytics(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_coaching_analytics(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_coaching_analytics(text) TO authenticated;

-- 3. admin_get_client_adherence: add p_source ('coach' | 'self' | NULL).
DROP FUNCTION IF EXISTS public.admin_get_client_adherence();

CREATE OR REPLACE FUNCTION public.admin_get_client_adherence(p_source text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.last_logged_at DESC NULLS LAST), '[]'::jsonb)
    FROM (
      SELECT
        wp.id AS assignment_id,
        wp.warrior_id,
        warrior.display_name AS warrior_name,
        wp.coach_id,
        coach.display_name AS coach_name,
        pt.name AS template_name,
        wp.status,
        wp.current_week,
        wp.assigned_at,
        (SELECT count(*) FROM workout_logs wl WHERE wl.warrior_program_id = wp.id) AS total_logs,
        (SELECT count(*) FROM workout_logs wl
          WHERE wl.warrior_program_id = wp.id AND wl.notes NOT LIKE '[STATUS:MISSED]%') AS completed_logs,
        (SELECT count(*) FROM workout_logs wl
          WHERE wl.warrior_program_id = wp.id AND wl.notes LIKE '[STATUS:MISSED]%') AS missed_logs,
        (SELECT max(wl.completed_at) FROM workout_logs wl WHERE wl.warrior_program_id = wp.id) AS last_logged_at
      FROM warrior_programs wp
      JOIN profiles warrior ON warrior.id = wp.warrior_id
      LEFT JOIN profiles coach ON coach.id = wp.coach_id
      JOIN program_templates pt ON pt.id = wp.template_id
      WHERE public.coach_matches_source(wp.coach_id, p_source)
      ORDER BY wp.assigned_at DESC
      LIMIT 300
    ) x
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_client_adherence(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_client_adherence(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_client_adherence(text) TO authenticated;
