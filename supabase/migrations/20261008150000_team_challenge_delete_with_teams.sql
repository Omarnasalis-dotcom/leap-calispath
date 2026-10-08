-- Team Challenge: admins can delete a challenge together with its teams.
-- admin_delete_team_challenge(p_id) refused while teams existed (hide-only),
-- which left test challenges stuck. It now takes p_include_teams: false keeps
-- the old refusal; true deletes every team, attempt and result with it (the
-- FKs cascade) and records the counts in admin_audit_log.
--
-- Dropped first: adding a parameter with CREATE OR REPLACE would leave two
-- overloads and make the admin panel's named-argument call ambiguous.
DROP FUNCTION IF EXISTS public.admin_delete_team_challenge(uuid);

CREATE FUNCTION public.admin_delete_team_challenge(p_id uuid, p_include_teams boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_teams integer;
  v_attempts integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT title INTO v_title FROM team_challenges WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_teams FROM teams WHERE challenge_id = p_id;
  SELECT count(*) INTO v_attempts FROM team_attempts WHERE challenge_id = p_id AND status = 'submitted';
  IF v_teams > 0 AND NOT COALESCE(p_include_teams, false) THEN
    RAISE EXCEPTION 'CHALLENGE_HAS_TEAMS';
  END IF;

  -- Teams, members, attempts and results cascade from here.
  DELETE FROM team_challenges WHERE id = p_id;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'team_challenge_delete', p_id::text,
          jsonb_build_object('title', v_title, 'teams_deleted', v_teams, 'attempts_deleted', v_attempts));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_team_challenge(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_team_challenge(uuid, boolean) TO authenticated, service_role;
