-- App versions report for admin-web Growth (owner request 2026-11-13): which
-- app version each person was last seen on, per platform, so the force and
-- soft minimums can be raised only once few active people would be caught.
--
-- A person's version is the app_version on their most recent app_events row.
-- app_events started with 1.2.7, so older installs never appear. Admins and
-- store test/reviewer accounts are left out, as in the Growth report.
CREATE OR REPLACE FUNCTION public.admin_get_app_versions()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH last_seen AS (
    SELECT DISTINCT ON (e.user_id) e.user_id, e.platform, e.app_version, e.created_at
    FROM app_events e
    WHERE e.app_version IS NOT NULL AND e.platform IN ('ios', 'android')
    ORDER BY e.user_id, e.created_at DESC
  ),
  people AS (
    SELECT l.*
    FROM last_seen l
    JOIN profiles p ON p.id = l.user_id
    WHERE NOT COALESCE(p.is_admin, false)
      AND NOT EXISTS (SELECT 1 FROM analytics_store_test_users s WHERE s.user_id = l.user_id)
  ),
  versions AS (
    SELECT platform, app_version,
           count(*) AS users,
           count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS active_7d,
           count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS active_30d,
           max(created_at) AS last_seen_at
    FROM people
    GROUP BY platform, app_version
  )
  SELECT jsonb_build_object(
    'config', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'platform', c.platform,
        'minimum_version', c.minimum_version,
        'soft_minimum_version', c.soft_minimum_version,
        'latest_version', c.latest_version
      ) ORDER BY c.platform)
      FROM app_config c WHERE c.platform IN ('ios', 'android')
    ), '[]'::jsonb),
    'versions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'platform', v.platform,
        'app_version', v.app_version,
        'users', v.users,
        'active_7d', v.active_7d,
        'active_30d', v.active_30d,
        'last_seen_at', v.last_seen_at
      ) ORDER BY v.platform,
                 ARRAY(SELECT COALESCE(NULLIF(regexp_replace(s.part, '\D', '', 'g'), '')::int, 0)
                       FROM unnest(string_to_array(v.app_version, '.')) WITH ORDINALITY AS s(part, n)
                       ORDER BY s.n) DESC)
      FROM versions v
    ), '[]'::jsonb),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_app_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_app_versions() TO authenticated, service_role;
