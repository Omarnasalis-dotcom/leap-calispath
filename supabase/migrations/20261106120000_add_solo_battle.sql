-- Solo Battle (docs/features/LIVE_SOLO_PLAN.md): an every-player-for-themselves
-- match on the Live engine, 2–12 players, plus 1-half matches for both modes.
--
-- A Solo Battle is a live room where each player is a side of one: timers,
-- logging, hidden numbers, host fallback, presence, push, history and the
-- PLAYERS board all work unchanged. What this migration adds:
--   * live_challenges.format ('teams' | 'solo'), also on templates.
--   * Up to 12 sides. A solo room opens with 12 places, gives each player a
--     side on joining, and at Start renumbers them 1..N and sets side_count
--     to N, so places and history are "of N" with no empty sides.
--   * 1–3 halves for both modes (was 2–3).
--   * Solo host logging: the host can log for a player only 30 s after time
--     is up, only while that player has been offline for 30 s, and never
--     over a log the player entered themselves. Live Teams keep their rule.
--
-- Older apps (1.2.15–1.2.17) read live_challenges directly and know nothing
-- about solo rooms, so:
--   * Direct reads return teams challenges only; new apps use
--     get_open_live_challenges().
--   * join_live_room refuses a solo code unless the app says it supports
--     solo (p_supports_solo), so an older app can't enter one.
--
-- Changed functions are copied from their latest versions (20261022120000,
-- 20261023120000, 20261023130000, 20261023140000; compared with prod before
-- copying) with only the additions marked "Solo Battle". Functions that gain
-- a parameter or a result column are dropped, recreated and re-granted.

-- ── Tables ────────────────────────────────────────────────────────────────

ALTER TABLE public.live_challenges
  ADD COLUMN format text NOT NULL DEFAULT 'teams' CHECK (format IN ('teams', 'solo'));
ALTER TABLE public.live_challenges
  ADD CONSTRAINT live_challenges_solo_size_check CHECK (format = 'teams' OR team_size = 1);

ALTER TABLE public.live_challenge_templates
  ADD COLUMN format text NOT NULL DEFAULT 'teams' CHECK (format IN ('teams', 'solo'));

ALTER TABLE public.live_rooms DROP CONSTRAINT live_rooms_side_count_check;
ALTER TABLE public.live_rooms
  ADD CONSTRAINT live_rooms_side_count_check CHECK (side_count BETWEEN 2 AND 12);

ALTER TABLE public.live_room_players DROP CONSTRAINT live_room_players_side_check;
ALTER TABLE public.live_room_players
  ADD CONSTRAINT live_room_players_side_check CHECK (side BETWEEN 1 AND 12);

ALTER TABLE public.live_half_results DROP CONSTRAINT live_half_results_side_check;
ALTER TABLE public.live_half_results
  ADD CONSTRAINT live_half_results_side_check CHECK (side BETWEEN 1 AND 12);

-- live_room_side_names stays 1..4: only team rooms have names.

-- Older apps read this table directly: keep solo challenges out of their list.
DROP POLICY "Signed-in users read active live challenges" ON public.live_challenges;
CREATE POLICY "Signed-in users read active live team challenges"
  ON public.live_challenges FOR SELECT TO authenticated
  USING ((is_active AND format = 'teams') OR public.is_admin());

-- ── Reads ─────────────────────────────────────────────────────────────────

-- Every open challenge of both formats, newest first (replaces the app's
-- direct table read, which RLS now limits to teams).
CREATE FUNCTION public.get_open_live_challenges()
RETURNS TABLE (id uuid, title text, description text, halves jsonb, rest_sec integer,
  team_size smallint, format text, starts_at timestamptz, ends_at timestamptz, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  RETURN QUERY
  SELECT c.id, c.title, c.description, c.halves, c.rest_sec, c.team_size, c.format,
    c.starts_at, c.ends_at, c.is_active
  FROM live_challenges c
  WHERE c.is_active AND now() >= c.starts_at AND now() < c.ends_at
  ORDER BY c.starts_at DESC;
END;
$function$;

-- ── Halves: 1–3 for both modes ────────────────────────────────────────────

-- True when p_halves is 1–3 halves of 60–1800 s, each with 1–8 exercises
-- that have a name, a max of 1–500 reps and 0–1000 points per rep.
CREATE OR REPLACE FUNCTION public.live_valid_halves(p_halves jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- CASE, not AND/OR: Postgres may evaluate those in any order, and
  -- jsonb_array_length on a non-array raises instead of returning false.
  SELECT CASE
    WHEN jsonb_typeof(p_halves) IS DISTINCT FROM 'array' THEN false
    WHEN jsonb_array_length(p_halves) NOT BETWEEN 1 AND 3 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_halves) h
      WHERE CASE
        WHEN jsonb_typeof(h) <> 'object' THEN true
        WHEN COALESCE(h->>'duration_sec', '') !~ '^[0-9]{1,5}$' THEN true
        WHEN (h->>'duration_sec')::integer NOT BETWEEN 60 AND 1800 THEN true
        WHEN jsonb_typeof(h->'movements') IS DISTINCT FROM 'array' THEN true
        WHEN jsonb_array_length(h->'movements') NOT BETWEEN 1 AND 8 THEN true
        ELSE EXISTS (
          SELECT 1 FROM jsonb_array_elements(h->'movements') m
          WHERE CASE
            WHEN jsonb_typeof(m) <> 'object' THEN true
            WHEN char_length(btrim(COALESCE(m->>'name', ''))) NOT BETWEEN 1 AND 60 THEN true
            WHEN COALESCE(m->>'reps', '') !~ '^[0-9]{1,4}$' THEN true
            WHEN (m->>'reps')::integer NOT BETWEEN 1 AND 500 THEN true
            WHEN COALESCE(m->>'points', '') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' THEN true
            ELSE (m->>'points')::numeric > 1000
          END
        )
      END
    )
  END;
$function$;

-- ── Admin ─────────────────────────────────────────────────────────────────

-- admin_upsert_live_challenge: + p_format. A solo challenge always has
-- team_size 1, and format freezes with the rest once a room exists.
DROP FUNCTION public.admin_upsert_live_challenge(uuid, text, text, jsonb, integer, integer, timestamptz, timestamptz, boolean);
CREATE FUNCTION public.admin_upsert_live_challenge(
  p_id uuid,
  p_title text,
  p_description text,
  p_halves jsonb,
  p_rest_sec integer,
  p_team_size integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean,
  p_format text DEFAULT 'teams'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing live_challenges%ROWTYPE;
  v_id uuid;
  v_size integer := CASE WHEN p_format = 'solo' THEN 1 ELSE p_team_size END; -- Solo Battle
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  -- Solo Battle
  IF p_format IS NULL OR p_format NOT IN ('teams', 'solo') THEN
    RAISE EXCEPTION 'INVALID_FORMAT';
  END IF;
  IF p_halves IS NULL OR NOT public.live_valid_halves(p_halves) THEN
    RAISE EXCEPTION 'INVALID_HALVES';
  END IF;
  IF v_size IS NULL OR v_size NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'INVALID_TEAM_SIZE';
  END IF;
  IF p_rest_sec IS NULL OR p_rest_sec NOT BETWEEN 0 AND 600 THEN
    RAISE EXCEPTION 'INVALID_REST';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO live_challenges (title, description, halves, rest_sec, team_size, format,
      starts_at, ends_at, is_active, created_by)
    VALUES (btrim(p_title), COALESCE(p_description, ''), p_halves, p_rest_sec, v_size, p_format,
      p_starts_at, p_ends_at, COALESCE(p_is_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing FROM live_challenges WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    -- Once a room exists, anything that changes how a match is played or
    -- scored is frozen.
    IF EXISTS (SELECT 1 FROM live_rooms WHERE challenge_id = p_id) AND (
         v_existing.halves IS DISTINCT FROM p_halves
      OR v_existing.team_size IS DISTINCT FROM v_size::smallint
      OR v_existing.format IS DISTINCT FROM p_format
    ) THEN
      RAISE EXCEPTION 'CHALLENGE_LOCKED';
    END IF;
    UPDATE live_challenges
    SET title = btrim(p_title), description = COALESCE(p_description, ''), halves = p_halves,
        rest_sec = p_rest_sec, team_size = v_size, format = p_format, starts_at = p_starts_at,
        ends_at = p_ends_at, is_active = COALESCE(p_is_active, is_active), updated_at = now()
    WHERE id = p_id;
    v_id := p_id;
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), CASE WHEN p_id IS NULL THEN 'live_challenge_create' ELSE 'live_challenge_update' END,
          v_id::text, jsonb_build_object('title', btrim(p_title), 'format', p_format));

  RETURN v_id;
END;
$function$;

-- admin_get_live_challenges: + format.
DROP FUNCTION public.admin_get_live_challenges();
CREATE FUNCTION public.admin_get_live_challenges()
RETURNS TABLE (id uuid, title text, description text, halves jsonb, rest_sec integer,
  team_size smallint, format text, starts_at timestamptz, ends_at timestamptz, is_active boolean,
  created_at timestamptz, room_count bigint, finished_room_count bigint, live_room_count bigint,
  player_count bigint)
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
  SELECT c.id, c.title, c.description, c.halves, c.rest_sec, c.team_size, c.format, c.starts_at,
    c.ends_at, c.is_active, c.created_at,
    (SELECT count(*) FROM live_rooms r WHERE r.challenge_id = c.id),
    (SELECT count(*) FROM live_rooms r WHERE r.challenge_id = c.id AND r.status = 'finished'),
    (SELECT count(*) FROM live_rooms r WHERE r.challenge_id = c.id AND r.status IN ('lobby', 'playing')),
    (SELECT count(DISTINCT p.user_id) FROM live_room_players p JOIN live_rooms r ON r.id = p.room_id
      WHERE r.challenge_id = c.id)
  FROM live_challenges c
  ORDER BY c.starts_at DESC;
END;
$function$;

-- ── Lobby ─────────────────────────────────────────────────────────────────

-- create_live_room: a solo room ignores p_side_count, opens with 12 places
-- and seats the host in the first.
CREATE OR REPLACE FUNCTION public.create_live_room(p_challenge_id uuid, p_side_count integer DEFAULT 2)
RETURNS TABLE (room_id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_room_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_format text; -- Solo Battle
  v_sides integer := p_side_count; -- Solo Battle
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  -- Solo Battle: read the format first, its side count isn't the caller's.
  SELECT format INTO v_format FROM live_challenges
  WHERE id = p_challenge_id AND is_active AND now() >= starts_at AND now() < ends_at;
  IF v_format = 'solo' THEN
    v_sides := 12;
  ELSIF p_side_count IS NULL OR p_side_count NOT BETWEEN 2 AND 4 THEN
    RAISE EXCEPTION 'INVALID_SIDES';
  END IF;
  IF v_format IS NULL THEN
    RAISE EXCEPTION 'CHALLENGE_CLOSED';
  END IF;
  PERFORM public.live_prepare_user(v_uid);

  LOOP
    v_code := (
      SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1), '')
      FROM generate_series(1, 6)
    );
    BEGIN
      INSERT INTO live_rooms (challenge_id, code, host_id, side_count)
      VALUES (p_challenge_id, v_code, v_uid, v_sides)
      RETURNING id INTO v_room_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- code collision: try another
    END;
  END LOOP;

  INSERT INTO live_room_players (room_id, user_id, side)
  VALUES (v_room_id, v_uid, CASE WHEN v_format = 'solo' THEN 1 END);
  PERFORM public.live_touch(v_room_id);

  RETURN QUERY SELECT v_room_id, v_code;
END;
$function$;

-- join_live_room: + p_supports_solo (older apps don't send it, so they can't
-- enter a solo room), and a solo player is seated in the lowest free place.
-- Returns the room id. Joining a room you're already in just returns it, so
-- a retried request after a network drop is harmless.
DROP FUNCTION public.join_live_room(text);
CREATE FUNCTION public.join_live_room(p_code text, p_supports_solo boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
  v_size integer;
  v_format text; -- Solo Battle
  v_side integer; -- Solo Battle
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_room FROM live_rooms WHERE code = upper(btrim(COALESCE(p_code, '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;
  IF EXISTS (SELECT 1 FROM live_room_players WHERE room_id = v_room.id AND user_id = v_uid) THEN
    PERFORM public.live_touch(v_room.id);
    RETURN v_room.id;
  END IF;

  -- Solo Battle
  SELECT team_size, format INTO v_size, v_format FROM live_challenges WHERE id = v_room.challenge_id;
  IF v_format = 'solo' AND NOT COALESCE(p_supports_solo, false) THEN
    RAISE EXCEPTION 'APP_UPDATE_REQUIRED';
  END IF;

  PERFORM public.live_prepare_user(v_uid);
  PERFORM public.live_advance(v_room.id);
  -- Row lock: two people can't both take the last place.
  SELECT * INTO v_room FROM live_rooms WHERE id = v_room.id FOR UPDATE;
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_STARTED';
  END IF;
  IF (SELECT count(user_id) FROM live_room_players WHERE room_id = v_room.id) >= v_size * v_room.side_count THEN
    RAISE EXCEPTION 'ROOM_FULL';
  END IF;

  -- Solo Battle: everyone is their own side. (A place freed by a player who
  -- left is reused; Start renumbers anyway.)
  IF v_format = 'solo' THEN
    SELECT min(s.side) INTO v_side
    FROM generate_series(1, v_room.side_count) AS s(side)
    WHERE NOT EXISTS (SELECT 1 FROM live_room_players p
                      WHERE p.room_id = v_room.id AND p.side = s.side AND p.user_id IS NOT NULL);
  END IF;

  INSERT INTO live_room_players (room_id, user_id, side) VALUES (v_room.id, v_uid, v_side);
  PERFORM public.live_touch(v_room.id);
  UPDATE live_rooms SET last_activity_at = now() WHERE id = v_room.id;
  RETURN v_room.id;
END;
$function$;

-- pick_live_side: refused in a solo room.
CREATE OR REPLACE FUNCTION public.pick_live_side(p_room_id uuid, p_side integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
  v_size integer;
  v_format text; -- Solo Battle
BEGIN
  v_room := public.live_lock_room(p_room_id);
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_STARTED';
  END IF;
  -- Solo Battle
  SELECT team_size, format INTO v_size, v_format FROM live_challenges WHERE id = v_room.challenge_id;
  IF v_format = 'solo' THEN
    RAISE EXCEPTION 'INVALID_SIDE';
  END IF;
  IF p_side IS NOT NULL THEN
    IF p_side NOT BETWEEN 1 AND v_room.side_count THEN
      RAISE EXCEPTION 'INVALID_SIDE';
    END IF;
    IF (SELECT count(*) FROM live_room_players
        WHERE room_id = p_room_id AND side = p_side AND user_id IS NOT NULL AND user_id <> v_uid) >= v_size THEN
      RAISE EXCEPTION 'SIDE_FULL';
    END IF;
  END IF;
  UPDATE live_room_players SET side = p_side, is_ready = false
  WHERE room_id = p_room_id AND user_id = v_uid;
  UPDATE live_rooms SET last_activity_at = now() WHERE id = p_room_id;
END;
$function$;

-- name_live_side: refused in a solo room (players show by their own name).
CREATE OR REPLACE FUNCTION public.name_live_side(p_room_id uuid, p_name text)
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
  -- Solo Battle
  IF (SELECT format FROM live_challenges WHERE id = v_room.challenge_id) = 'solo' THEN
    RAISE EXCEPTION 'INVALID_SIDE';
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

-- ── Match ─────────────────────────────────────────────────────────────────

-- start_live_half: a solo room needs 2+ ready players (no even-sides or
-- team-name checks) and renumbers its players 1..N at Start; a one-half
-- match's push says "Match" instead of "Half 1".
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
  v_players integer; -- Solo Battle
  v_side_count smallint; -- Solo Battle
  v_one_half boolean; -- Solo Battle
BEGIN
  v_room := public.live_lock_room(p_room_id);
  SELECT * INTO v_challenge FROM live_challenges WHERE id = v_room.challenge_id;
  v_host := public.live_room_host(p_room_id);
  v_side_count := v_room.side_count;
  v_one_half := jsonb_array_length(v_challenge.halves) = 1;

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
    IF v_challenge.format = 'solo' THEN
      -- Solo Battle: seats 1..N by join order, and side_count is the real
      -- player count from here on. Only rows that change are written (each
      -- write is a realtime event to every phone in the room).
      SELECT count(user_id) INTO v_players FROM live_room_players WHERE room_id = p_room_id;
      IF v_players < 2 THEN
        RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS';
      END IF;
      UPDATE live_room_players p SET side = o.seat
      FROM (SELECT id, row_number() OVER (ORDER BY joined_at, id) AS seat
            FROM live_room_players WHERE room_id = p_room_id AND user_id IS NOT NULL) o
      WHERE p.id = o.id AND p.side IS DISTINCT FROM o.seat;
      -- A deleted account's row has no place.
      UPDATE live_room_players SET side = NULL
      WHERE room_id = p_room_id AND user_id IS NULL AND side IS NOT NULL;
      v_side_count := v_players;
    ELSE
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
      side_count = v_side_count,
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
    CASE WHEN v_one_half AND pr.language = 'ar' THEN 'المباراة تبدأ الآن'
         WHEN v_one_half THEN 'Match starts now'
         WHEN pr.language = 'ar' THEN format('الشوط %s يبدأ الآن', v_next)
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

-- submit_live_reps: + the Solo Battle host rule (see the top of this file).
CREATE OR REPLACE FUNCTION public.submit_live_reps(p_room_id uuid, p_half integer, p_user_id uuid, p_reps integer[])
RETURNS TABLE (points numeric, half_closed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid := COALESCE(p_user_id, auth.uid());
  v_room live_rooms%ROWTYPE;
  v_challenge live_challenges%ROWTYPE;
  v_movements jsonb;
  v_side smallint;
  v_points numeric;
  v_closed boolean;
BEGIN
  v_room := public.live_lock_room(p_room_id);
  SELECT * INTO v_challenge FROM live_challenges WHERE id = v_room.challenge_id;

  IF v_target <> v_uid AND v_uid IS DISTINCT FROM public.live_room_host(p_room_id) THEN
    RAISE EXCEPTION 'NOT_HOST';
  END IF;
  SELECT side INTO v_side FROM live_room_players WHERE room_id = p_room_id AND user_id = v_target;
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'NOT_IN_ROOM';
  END IF;
  IF v_room.status NOT IN ('playing', 'finished') OR p_half IS DISTINCT FROM v_room.current_half::integer THEN
    RAISE EXCEPTION 'WRONG_HALF';
  END IF;
  IF v_room.half_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'LOGGING_CLOSED';
  END IF;
  IF now() < v_room.half_ends_at - interval '2 seconds' THEN
    RAISE EXCEPTION 'TIME_NOT_UP';
  END IF;

  -- Solo Battle: the host can step in only for a player who has been gone
  -- 30 s since time was up, and never over the player's own log.
  IF v_challenge.format = 'solo' AND v_target <> v_uid AND (
       now() < v_room.half_ends_at + interval '30 seconds'
    OR public.live_is_online(p_room_id, v_target, interval '30 seconds')
    OR EXISTS (SELECT 1 FROM live_half_results r
               WHERE r.room_id = p_room_id AND r.half = p_half AND r.user_id = v_target
                 AND r.entered_by = v_target)
  ) THEN
    RAISE EXCEPTION 'CANT_LOG_FOR_PLAYER';
  END IF;

  v_movements := public.live_half_movements(v_challenge.halves, p_half);
  IF p_reps IS NULL OR array_ndims(p_reps) IS DISTINCT FROM 1
     OR array_length(p_reps, 1) <> jsonb_array_length(v_movements)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_movements) WITH ORDINALITY AS m(value, ord)
       WHERE p_reps[m.ord::integer] IS NULL
          OR p_reps[m.ord::integer] < 0
          OR p_reps[m.ord::integer] > (m.value->>'reps')::integer
     ) THEN
    RAISE EXCEPTION 'INVALID_REPS';
  END IF;

  v_points := public.live_reps_points(v_movements, p_reps);

  INSERT INTO live_half_results (room_id, half, user_id, side, reps, points, entered_by)
  VALUES (p_room_id, p_half, v_target, v_side, p_reps, v_points, v_uid)
  ON CONFLICT (room_id, half, user_id) DO UPDATE
    SET reps = EXCLUDED.reps, points = EXCLUDED.points, entered_by = EXCLUDED.entered_by,
        updated_at = now();

  -- (No live_rooms touch here: it only feeds the lobby idle timer, and every
  -- touch sends a realtime event that makes every phone in the room reload.)

  v_closed := NOT EXISTS (
    SELECT 1 FROM live_room_players p
    WHERE p.room_id = p_room_id AND p.user_id IS NOT NULL AND p.side IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM live_half_results r
                      WHERE r.room_id = p_room_id AND r.half = p_half AND r.user_id = p.user_id)
  );
  IF v_closed THEN
    PERFORM public.live_close_half(p_room_id, now());
  END IF;

  RETURN QUERY SELECT v_points, v_closed;
END;
$function$;

-- get_live_room_state: + challenge.format.
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
                    'halves', c.halves, 'rest_sec', c.rest_sec, 'team_size', c.team_size,
                    'format', c.format)
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

-- get_my_live_history: + format.
DROP FUNCTION public.get_my_live_history();
CREATE FUNCTION public.get_my_live_history()
RETURNS TABLE (room_id uuid, challenge_id uuid, challenge_title text, finished_at timestamptz,
  side_count smallint, halves_played smallint, my_side smallint, my_points numeric,
  side_points numeric, side_place bigint, is_best_player boolean, player_count bigint,
  my_side_name text, format text)
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
    (SELECT n.name FROM live_room_side_names n WHERE n.room_id = m.id AND n.side = m.my_side),
    c.format
  FROM mine m
  JOIN live_challenges c ON c.id = m.challenge_id
  JOIN places pl ON pl.room_id = m.id AND pl.side = m.my_side
  WHERE auth.uid() IS NOT NULL
  ORDER BY m.finished_at DESC;
$function$;

-- get_live_team_board: team challenges only (a solo room is on PLAYERS).
CREATE OR REPLACE FUNCTION public.get_live_team_board(p_challenge_id uuid)
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
    WHERE id = p_challenge_id AND format = 'teams' AND (is_active OR public.is_admin()) AND auth.uid() IS NOT NULL
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

-- ── Grants ────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION
  public.get_open_live_challenges(),
  public.admin_upsert_live_challenge(uuid, text, text, jsonb, integer, integer, timestamptz, timestamptz, boolean, text),
  public.admin_get_live_challenges(),
  public.join_live_room(text, boolean),
  public.get_my_live_history()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.get_open_live_challenges(),
  public.admin_upsert_live_challenge(uuid, text, text, jsonb, integer, integer, timestamptz, timestamptz, boolean, text),
  public.admin_get_live_challenges(),
  public.join_live_room(text, boolean),
  public.get_my_live_history()
  TO authenticated, service_role;
