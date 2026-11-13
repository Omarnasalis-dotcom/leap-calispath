-- Program analytics' adherence table stopped at the 300 most recently
-- assigned programs. Prod has 504 (161 active ones never showed). Same
-- function, same signature, no cap. Everything else unchanged.
CREATE OR REPLACE FUNCTION public.admin_get_client_adherence(p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    ) x
  );
END;
$function$;
