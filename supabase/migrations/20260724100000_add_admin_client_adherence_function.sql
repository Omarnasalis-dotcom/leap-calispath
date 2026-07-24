-- Per-client adherence for the admin Coaching Analytics page. Mirrors
-- admin_get_coaching_analytics's exact auth pattern (admin-only, SECURITY
-- DEFINER, explicit REVOKE/GRANT) and get_warrior_progress's missed-status
-- convention (status is the notes '[STATUS:MISSED]' prefix, not a column —
-- see toggle_block_status / log_block_with_sets).
CREATE OR REPLACE FUNCTION public.admin_get_client_adherence()
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
      ORDER BY wp.assigned_at DESC
      LIMIT 300
    ) x
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_client_adherence() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_client_adherence() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_client_adherence() TO authenticated;
