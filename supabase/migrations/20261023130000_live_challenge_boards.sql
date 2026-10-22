-- Live Tournament: public leaderboards per challenge (owner request
-- 2026-10-22), collecting every finished room of the same challenge.
--
-- Only rooms that played every half count (a room ended early by the
-- 30-minute rule has fewer points and isn't comparable).
--
-- PLAYERS: each player's best total in any counted room (ties: the earlier
--   finish). "Hide me from leaderboards" is honoured like every other board
--   (leaderboard_visible): hidden players drop out for others, ranks have no
--   gaps, and you always see yourself.
-- TEAMS: one entry per side of a counted room, scored as points per player
--   (side total / players on the side) so a 2 v 2 and a 3 v 3 compare
--   fairly. The same group of players keeps only its best entry. As on Team
--   Challenge boards, members are listed by name even if they hid
--   themselves from the individual boards.
--
-- Both return the top 100 plus, when outside it, the caller's own row with
-- its true rank. Read-only, SECURITY DEFINER (results and rooms aren't
-- client-readable), signed-in callers only, active challenges (or admins).

CREATE FUNCTION public.get_live_player_board(p_challenge_id uuid)
RETURNS TABLE (rank bigint, user_id uuid, display_name text, country text, points numeric,
  team_name text, achieved_at timestamptz, is_mine boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT id, jsonb_array_length(halves) AS halves
    FROM live_challenges
    WHERE id = p_challenge_id AND (is_active OR public.is_admin()) AND auth.uid() IS NOT NULL
  ),
  rooms AS (
    SELECT r.id, r.finished_at
    FROM live_rooms r JOIN c ON c.id = r.challenge_id
    WHERE r.status = 'finished' AND r.current_half = c.halves
  ),
  per_room AS (
    SELECT x.room_id, x.user_id, min(x.side) AS side, sum(x.points) AS points, r.finished_at
    FROM live_half_results x
    JOIN rooms r ON r.id = x.room_id
    WHERE x.user_id IS NOT NULL
    GROUP BY x.room_id, x.user_id, r.finished_at
  ),
  best AS (
    SELECT DISTINCT ON (pr.user_id) pr.*
    FROM per_room pr
    WHERE public.leaderboard_visible(pr.user_id, 'live')
    ORDER BY pr.user_id, pr.points DESC, pr.finished_at ASC
  ),
  ranked AS (
    SELECT b.*, row_number() OVER (ORDER BY b.points DESC, b.finished_at ASC) AS rank
    FROM best b
  )
  SELECT k.rank, k.user_id, p.display_name, p.country, k.points,
    (SELECT n.name FROM live_room_side_names n WHERE n.room_id = k.room_id AND n.side = k.side),
    k.finished_at, k.user_id = auth.uid()
  FROM ranked k
  JOIN profiles p ON p.id = k.user_id
  WHERE k.rank <= 100 OR k.user_id = auth.uid()
  ORDER BY k.rank;
$function$;

CREATE FUNCTION public.get_live_team_board(p_challenge_id uuid)
RETURNS TABLE (rank bigint, room_id uuid, side smallint, team_name text, members jsonb,
  player_count bigint, total numeric, points_per_player numeric, achieved_at timestamptz, is_mine boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT id, jsonb_array_length(halves) AS halves
    FROM live_challenges
    WHERE id = p_challenge_id AND (is_active OR public.is_admin()) AND auth.uid() IS NOT NULL
  ),
  rooms AS (
    SELECT r.id, r.side_count, r.finished_at
    FROM live_rooms r JOIN c ON c.id = r.challenge_id
    WHERE r.status = 'finished' AND r.current_half = c.halves
  ),
  sides AS (
    SELECT r.id AS room_id, s.side::smallint AS side, r.finished_at,
      -- A deleted account keeps its row (user_id NULL), so it still counts as a player.
      (SELECT count(*) FROM live_room_players p WHERE p.room_id = r.id AND p.side = s.side) AS players,
      COALESCE((SELECT sum(x.points) FROM live_half_results x WHERE x.room_id = r.id AND x.side = s.side), 0) AS total,
      (SELECT array_agg(p.user_id ORDER BY p.user_id) FROM live_room_players p
        WHERE p.room_id = r.id AND p.side = s.side) AS member_ids
    FROM rooms r CROSS JOIN LATERAL generate_series(1, r.side_count) AS s(side)
  ),
  scored AS (
    SELECT sd.*, round(sd.total / sd.players, 2) AS ppp
    FROM sides sd
    WHERE sd.players > 0
  ),
  best AS (
    -- The same group of players keeps only its best entry.
    SELECT DISTINCT ON (sc.member_ids) sc.*
    FROM scored sc
    ORDER BY sc.member_ids, sc.ppp DESC, sc.finished_at ASC
  ),
  ranked AS (
    SELECT b.*, row_number() OVER (ORDER BY b.ppp DESC, b.finished_at ASC) AS rank
    FROM best b
  )
  SELECT k.rank, k.room_id, k.side,
    (SELECT n.name FROM live_room_side_names n WHERE n.room_id = k.room_id AND n.side = k.side),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'display_name', pr.display_name)
                ORDER BY p.joined_at, p.id)
              FROM live_room_players p LEFT JOIN profiles pr ON pr.id = p.user_id
              WHERE p.room_id = k.room_id AND p.side = k.side), '[]'::jsonb),
    k.players, k.total, k.ppp, k.finished_at,
    auth.uid() = ANY (k.member_ids)
  FROM ranked k
  WHERE k.rank <= 100 OR auth.uid() = ANY (k.member_ids)
  ORDER BY k.rank;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_live_player_board(uuid), public.get_live_team_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_live_player_board(uuid), public.get_live_team_board(uuid) TO authenticated, service_role;
