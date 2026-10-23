-- Live Tournament: let an admin delete a challenge together with its rooms
-- (owner request 2026-10-23, e.g. a test challenge), like
-- admin_delete_team_challenge(p_id, p_include_teams).
--
-- Without p_include_rooms the old rule stands: a challenge some room used
-- can't be deleted (it would erase players' history and leaderboard rows);
-- hide it instead. With it, the challenge and every room, player, side
-- name, log and presence row go (ON DELETE CASCADE). Rooms still in play
-- end for their players (their app returns to the LIVE tab). The audit log
-- records how much was removed. The signature gains a parameter, so the
-- function is dropped and recreated, and re-granted.

DROP FUNCTION public.admin_delete_live_challenge(uuid);

CREATE FUNCTION public.admin_delete_live_challenge(p_id uuid, p_include_rooms boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_rooms integer;
  v_live integer;
  v_players integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status IN ('lobby', 'playing'))
  INTO v_rooms, v_live
  FROM live_rooms WHERE challenge_id = p_id;
  SELECT count(DISTINCT p.user_id) INTO v_players
  FROM live_room_players p JOIN live_rooms r ON r.id = p.room_id
  WHERE r.challenge_id = p_id;

  IF v_rooms > 0 AND NOT COALESCE(p_include_rooms, false) THEN
    RAISE EXCEPTION 'CHALLENGE_HAS_ROOMS';
  END IF;

  DELETE FROM live_challenges WHERE id = p_id RETURNING title INTO v_title;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'live_challenge_delete', p_id::text,
          jsonb_build_object('title', v_title, 'rooms', v_rooms, 'live_rooms', v_live, 'players', v_players));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_live_challenge(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_live_challenge(uuid, boolean) TO authenticated, service_role;
