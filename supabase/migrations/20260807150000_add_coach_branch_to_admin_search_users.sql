-- Let a non-paused coach call this RPC too, scoped to their own community —
-- reused rather than duplicated so admin-web's ClientsPage AssignForm (the
-- only coach-reachable caller; UserListPage stays behind RequireAdmin at the
-- route level) needs no client-side change at all. Admin's behavior is
-- completely unchanged: the community filter below is skipped entirely when
-- the caller is an admin.
CREATE OR REPLACE FUNCTION public.admin_search_users(p_query text DEFAULT NULL::text, p_sort text DEFAULT 'created_at'::text, p_desc boolean DEFAULT true, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, display_name text, first_name text, last_name text, strength_tier integer, power_tier integer, statics_tier numeric, glory_score integer, power_points numeric, one_mm_points numeric, streak integer, is_admin boolean, is_coach boolean, community_id uuid, community_name text, country text, gender text, last_active timestamp with time zone, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sort_expr text;
  v_is_admin boolean;
  v_is_coach boolean;
BEGIN
  v_is_admin := public.is_admin();
  v_is_coach := EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true);

  IF NOT v_is_admin AND NOT (v_is_coach AND NOT public.is_coaching_paused(auth.uid())) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  -- Whitelist → concrete column expression. Unknown values fall back to
  -- signup date rather than erroring, so a stale client can't break the
  -- page.
  v_sort_expr := CASE p_sort
    WHEN 'created_at'    THEN 'u.created_at'
    WHEN 'last_active'   THEN 'p.last_active'
    WHEN 'display_name'  THEN 'p.display_name'
    WHEN 'strength_tier' THEN 'p.strength_tier'
    WHEN 'glory_score'   THEN 'p.glory_score'
    WHEN 'power_points'  THEN 'p.power_points'
    WHEN 'one_mm_points' THEN 'p.one_mm_points'
    WHEN 'streak'        THEN 'p.streak'
    ELSE 'u.created_at'
  END;

  RETURN QUERY EXECUTE format(
    $q$
    SELECT p.id, p.email, p.display_name, p.first_name, p.last_name,
           p.strength_tier, p.power_tier, p.statics_tier, p.glory_score,
           p.power_points, p.one_mm_points, p.streak, p.is_admin, p.is_coach,
           p.community_id, c.name AS community_name, p.country, p.gender,
           p.last_active, u.created_at,
           count(*) OVER () AS total_count
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN communities c ON c.id = p.community_id
    WHERE ($4 OR EXISTS (
            SELECT 1 FROM communities cc WHERE cc.id = p.community_id AND cc.created_by = $5
          ))
      AND ($1 IS NULL OR trim($1) = ''
       OR p.display_name ILIKE '%%' || trim($1) || '%%'
       OR p.email        ILIKE '%%' || trim($1) || '%%'
       OR p.first_name   ILIKE '%%' || trim($1) || '%%'
       OR p.last_name    ILIKE '%%' || trim($1) || '%%')
    ORDER BY %s %s NULLS LAST
    LIMIT $2 OFFSET $3
    $q$,
    v_sort_expr,
    CASE WHEN p_desc THEN 'DESC' ELSE 'ASC' END
  )
  USING p_query, least(greatest(coalesce(p_limit, 50), 1), 200), greatest(coalesce(p_offset, 0), 0), v_is_admin, auth.uid();
END;
$function$;
