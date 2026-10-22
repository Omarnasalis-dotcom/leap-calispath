-- Live Tournament: team names for sides (owner request 2026-10-22).
--
-- Any player on a side can name it in the lobby (1–24 characters, unique in
-- the room, case-insensitive), and the host can't start until every side has
-- a name. Names show in the room, the result and history. They are
-- user-entered text, so the admin rooms view lists them for moderation (an
-- offensive one: abandon the room).
--
-- Changed functions are copied from 20261022120000 with only the additions
-- marked below; get_my_live_history and admin_get_live_rooms gain a column,
-- so they are dropped and recreated (and re-granted) rather than replaced.

CREATE TABLE public.live_room_side_names (
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  side smallint NOT NULL CHECK (side BETWEEN 1 AND 4),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 24),
  named_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  named_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, side)
);

CREATE UNIQUE INDEX live_room_side_names_unique ON public.live_room_side_names (room_id, lower(btrim(name)));

ALTER TABLE public.live_room_side_names ENABLE ROW LEVEL SECURITY;
-- No client access: names reach the app through get_live_room_state.
REVOKE ALL ON public.live_room_side_names FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.live_room_side_names TO service_role;

-- Names (or renames) the caller's own side. Lobby only.
CREATE FUNCTION public.name_live_side(p_room_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
  v_side smallint;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  v_room := public.live_lock_room(p_room_id);
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_STARTED';
  END IF;
  SELECT side INTO v_side FROM live_room_players WHERE room_id = p_room_id AND user_id = v_uid;
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'PICK_SIDE_FIRST';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 24 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  IF EXISTS (SELECT 1 FROM live_room_side_names
             WHERE room_id = p_room_id AND side <> v_side AND lower(btrim(name)) = lower(v_name)) THEN
    RAISE EXCEPTION 'NAME_TAKEN';
  END IF;

  INSERT INTO live_room_side_names (room_id, side, name, named_by)
  VALUES (p_room_id, v_side, v_name, v_uid)
  ON CONFLICT (room_id, side) DO UPDATE
    SET name = EXCLUDED.name, named_by = EXCLUDED.named_by, named_at = now();
  -- Touching the room sends a realtime event, so every phone shows the name.
  UPDATE live_rooms SET last_activity_at = now() WHERE id = p_room_id;
END;
$function$;

-- start_live_half: + every side must have a name (SIDES_UNNAMED).
CREATE OR REPLACE FUNCTION public.start_live_half(p_room_id uuid)
RETURNS TABLE (half smallint, half_started_at timestamptz, half_ends_at timestamptz, server_now timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
  v_challenge live_challenges%ROWTYPE;
  v_host uuid;
  v_next smallint;
  v_duration integer;
  v_started timestamptz := now() + interval '5 seconds';
  v_bad integer;
BEGIN
  v_room := public.live_lock_room(p_room_id);
  SELECT * INTO v_challenge FROM live_challenges WHERE id = v_room.challenge_id;
  v_host := public.live_room_host(p_room_id);

  IF v_room.status = 'lobby' THEN
    IF v_uid IS DISTINCT FROM v_host THEN
      RAISE EXCEPTION 'NOT_HOST';
    END IF;
    IF NOT v_challenge.is_active OR now() < v_challenge.starts_at OR now() >= v_challenge.ends_at THEN
      RAISE EXCEPTION 'CHALLENGE_CLOSED';
    END IF;
    IF EXISTS (SELECT 1 FROM live_room_players
               WHERE room_id = p_room_id AND user_id IS NOT NULL AND (side IS NULL OR NOT is_ready)) THEN
      RAISE EXCEPTION 'PLAYERS_NOT_READY';
    END IF;
    -- Every side has players, and the same number of them.
    SELECT count(*) INTO v_bad FROM (
      SELECT s.side, count(p.user_id) AS n
      FROM generate_series(1, v_room.side_count) AS s(side)
      LEFT JOIN live_room_players p ON p.room_id = p_room_id AND p.side = s.side AND p.user_id IS NOT NULL
      GROUP BY s.side
    ) c
    WHERE c.n = 0 OR c.n <> (SELECT count(user_id) FROM live_room_players
                             WHERE room_id = p_room_id AND side = 1 AND user_id IS NOT NULL);
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'SIDES_UNEVEN';
    END IF;
    -- Every side has a team name.
    IF (SELECT count(*) FROM live_room_side_names WHERE room_id = p_room_id AND side <= v_room.side_count)
       < v_room.side_count THEN
      RAISE EXCEPTION 'SIDES_UNNAMED';
    END IF;
    v_next := 1;
  ELSIF v_room.status = 'playing' THEN
    IF v_room.half_closed_at IS NULL THEN
      RAISE EXCEPTION 'HALF_NOT_DONE';
    END IF;
    IF v_room.current_half >= jsonb_array_length(v_challenge.halves) THEN
      RAISE EXCEPTION 'MATCH_OVER';
    END IF;
    IF v_uid IS DISTINCT FROM v_host AND now() < v_room.half_closed_at + interval '3 minutes' THEN
      RAISE EXCEPTION 'NOT_HOST';
    END IF;
    v_next := v_room.current_half + 1;
  ELSE
    RAISE EXCEPTION 'ROOM_NOT_ACTIVE';
  END IF;

  v_duration := (v_challenge.halves -> (v_next - 1) ->> 'duration_sec')::integer;

  UPDATE live_rooms
  SET status = 'playing',
      current_half = v_next,
      half_started_at = v_started,
      half_ends_at = v_started + make_interval(secs => v_duration),
      log_closes_at = v_started + make_interval(secs => v_duration + 120),
      half_closed_at = NULL,
      started_at = COALESCE(started_at, now()),
      last_activity_at = now()
  WHERE id = p_room_id;

  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT p.user_id, 'live_half_started',
    CASE WHEN pr.language = 'ar' THEN format('الشوط %s يبدأ الآن', v_next)
         ELSE format('Half %s starts now', v_next) END,
    CASE WHEN pr.language = 'ar' THEN format('افتح %s، العد التنازلي بدأ.', v_challenge.title)
         ELSE format('Open %s, the countdown is on.', v_challenge.title) END,
    jsonb_build_object('screen', 'live-room', 'roomId', p_room_id::text, 'room_id', p_room_id::text,
                       'half', v_next)
  FROM live_room_players p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.room_id = p_room_id AND p.user_id IS NOT NULL AND p.user_id <> v_uid
    AND NOT EXISTS (
      SELECT 1 FROM notification_preferences np
      WHERE np.user_id = p.user_id AND (np.prefs->>'live_half_started') = 'false'
    );

  RETURN QUERY SELECT v_next, v_started, v_started + make_interval(secs => v_duration), now();
END;
$function$;

-- get_live_room_state: + side_names {"1": "Wolves", …}.
CREATE OR REPLACE FUNCTION public.get_live_room_state(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
  v_host uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_live_room_player(p_room_id) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM';
  END IF;
  PERFORM public.live_touch(p_room_id);
  PERFORM public.live_advance(p_room_id);

  SELECT * INTO v_room FROM live_rooms WHERE id = p_room_id;
  v_host := public.live_room_host(p_room_id);

  RETURN jsonb_build_object(
    'server_now', now(),
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
      'side_count', v_room.side_count, 'host_id', v_host,
      'current_half', v_room.current_half,
      'half_started_at', v_room.half_started_at, 'half_ends_at', v_room.half_ends_at,
      'log_closes_at', v_room.log_closes_at, 'half_closed_at', v_room.half_closed_at,
      'anyone_can_start_at', v_room.half_closed_at + interval '3 minutes',
      'created_at', v_room.created_at, 'started_at', v_room.started_at,
      'finished_at', v_room.finished_at),
    'side_names', COALESCE((
      SELECT jsonb_object_agg(n.side::text, n.name) FROM live_room_side_names n WHERE n.room_id = p_room_id
    ), '{}'::jsonb),
    'challenge', (SELECT jsonb_build_object(
                    'id', c.id, 'title', c.title, 'description', c.description,
                    'halves', c.halves, 'rest_sec', c.rest_sec, 'team_size', c.team_size)
                  FROM live_challenges c WHERE c.id = v_room.challenge_id),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'display_name', pr.display_name, 'side', p.side,
               'is_ready', p.is_ready, 'is_host', p.user_id IS NOT DISTINCT FROM v_host,
               'joined_at', p.joined_at,
               'online', p.user_id IS NOT NULL AND public.live_is_online(p_room_id, p.user_id),
               'last_seen_at', (SELECT x.last_seen_at FROM live_room_presence x
                                WHERE x.room_id = p_room_id AND x.user_id = p.user_id))
             ORDER BY p.joined_at, p.id)
      FROM live_room_players p LEFT JOIN profiles pr ON pr.id = p.user_id
      WHERE p.room_id = p_room_id), '[]'::jsonb),
    -- Who has logged the current half (numbers hidden while it's open).
    'logged', COALESCE((
      SELECT jsonb_agg(r.user_id)
      FROM live_half_results r
      WHERE r.room_id = p_room_id AND r.half = v_room.current_half), '[]'::jsonb),
    'results', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'half', r.half, 'user_id', r.user_id, 'side', r.side, 'reps', to_jsonb(r.reps),
               'points', r.points, 'entered_by', r.entered_by, 'entered_at', r.entered_at)
             ORDER BY r.half, r.entered_at)
      FROM live_half_results r
      WHERE r.room_id = p_room_id
        AND (r.half < v_room.current_half
             OR v_room.half_closed_at IS NOT NULL
             OR v_room.status IN ('finished', 'abandoned')
             OR r.user_id = v_uid)), '[]'::jsonb)
  );
END;
$function$;

-- get_my_live_history: + my_side_name.
DROP FUNCTION public.get_my_live_history();
CREATE FUNCTION public.get_my_live_history()
RETURNS TABLE (room_id uuid, challenge_id uuid, challenge_title text, finished_at timestamptz,
  side_count smallint, halves_played smallint, my_side smallint, my_points numeric,
  side_points numeric, side_place bigint, is_best_player boolean, player_count bigint,
  my_side_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH mine AS (
    SELECT r.*, p.side AS my_side
    FROM live_room_players p
    JOIN live_rooms r ON r.id = p.room_id
    WHERE p.user_id = auth.uid() AND r.status = 'finished' AND p.side IS NOT NULL
  ),
  side_totals AS (
    SELECT m.id AS room_id, s.side,
      COALESCE((SELECT sum(x.points) FROM live_half_results x
                WHERE x.room_id = m.id AND x.side = s.side), 0) AS total
    FROM mine m CROSS JOIN LATERAL generate_series(1, m.side_count) AS s(side)
  ),
  places AS (
    SELECT st.room_id, st.side, st.total,
      rank() OVER (PARTITION BY st.room_id ORDER BY st.total DESC) AS place
    FROM side_totals st
  ),
  player_totals AS (
    SELECT x.room_id, x.user_id, sum(x.points) AS total, max(x.entered_at) AS last_at
    FROM live_half_results x
    WHERE x.room_id IN (SELECT id FROM mine) AND x.user_id IS NOT NULL
    GROUP BY x.room_id, x.user_id
  ),
  best AS (
    SELECT DISTINCT ON (pt.room_id) pt.room_id, pt.user_id
    FROM player_totals pt
    ORDER BY pt.room_id, pt.total DESC, pt.last_at ASC
  )
  SELECT m.id, m.challenge_id, c.title, m.finished_at, m.side_count, m.current_half, m.my_side,
    COALESCE((SELECT pt.total FROM player_totals pt WHERE pt.room_id = m.id AND pt.user_id = auth.uid()), 0),
    pl.total, pl.place,
    COALESCE((SELECT b.user_id = auth.uid() FROM best b WHERE b.room_id = m.id), false),
    (SELECT count(user_id) FROM live_room_players p2 WHERE p2.room_id = m.id),
    (SELECT n.name FROM live_room_side_names n WHERE n.room_id = m.id AND n.side = m.my_side)
  FROM mine m
  JOIN live_challenges c ON c.id = m.challenge_id
  JOIN places pl ON pl.room_id = m.id AND pl.side = m.my_side
  WHERE auth.uid() IS NOT NULL
  ORDER BY m.finished_at DESC;
$function$;

-- admin_get_live_rooms: + side_names.
DROP FUNCTION public.admin_get_live_rooms(uuid);
CREATE FUNCTION public.admin_get_live_rooms(p_challenge_id uuid)
RETURNS TABLE (room_id uuid, status text, side_count smallint, current_half smallint,
  host_name text, players jsonb, side_names jsonb, created_at timestamptz, started_at timestamptz,
  finished_at timestamptz, last_activity_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN QUERY
  SELECT r.id, r.status, r.side_count, r.current_half,
    (SELECT p.display_name FROM profiles p WHERE p.id = public.live_room_host(r.id)),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'user_id', lp.user_id, 'display_name', pr.display_name, 'side', lp.side)
              ORDER BY lp.side NULLS LAST, lp.joined_at, lp.id)
              FROM live_room_players lp LEFT JOIN profiles pr ON pr.id = lp.user_id
              WHERE lp.room_id = r.id), '[]'::jsonb),
    COALESCE((SELECT jsonb_object_agg(n.side::text, n.name) FROM live_room_side_names n WHERE n.room_id = r.id), '{}'::jsonb),
    r.created_at, r.started_at, r.finished_at, r.last_activity_at
  FROM live_rooms r
  WHERE r.challenge_id = p_challenge_id
  ORDER BY r.created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.name_live_side(uuid, text), public.get_my_live_history(),
  public.admin_get_live_rooms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.name_live_side(uuid, text), public.get_my_live_history(),
  public.admin_get_live_rooms(uuid) TO authenticated, service_role;
