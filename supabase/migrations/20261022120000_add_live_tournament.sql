-- Live Tournament, step 1 (docs/features/LIVE_TOURNAMENT_PLAN.md).
--
-- Admins publish weekly live challenges: 2 or 3 timed halves, each a list of
-- exercises with a max reps and points per rep. A player creates a room from
-- one and shares its code; players join, pick a side and tap Ready; the host
-- starts each half. After a half every player logs their reps (0..max per
-- exercise) within 2 minutes; the room sees the standings and the host starts
-- the next half. After the last half, sides are ranked by total points and
-- the best player is the one with the most points.
--
-- Fully separate from Team Challenge: only new live_* objects, nothing
-- existing changes. Same rules as Team Challenge: the client can't write any
-- of these tables, every write is a SECURITY DEFINER function that checks the
-- caller, every time is a server timestamp, and errors are bare codes
-- (e.g. 'ROOM_FULL') that the app maps to EN/AR strings.
--
-- There is no cron: any call that touches a room first runs live_advance(),
-- which closes an expired logging window, ends the match after the last half
-- and expires stale rooms.

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE public.live_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  -- [{duration_sec, movements: [{name, reps (the max), points}]}], 2–3 halves.
  -- Fully validated by live_valid_halves() in admin_upsert_live_challenge.
  halves jsonb NOT NULL CHECK (jsonb_typeof(halves) = 'array'),
  rest_sec integer NOT NULL DEFAULT 60 CHECK (rest_sec BETWEEN 0 AND 600),
  -- Max players per side.
  team_size smallint NOT NULL CHECK (team_size BETWEEN 1 AND 6),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX live_challenges_window_idx ON public.live_challenges (starts_at, ends_at);

CREATE TABLE public.live_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.live_challenges(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  -- NULL after the host's account is deleted; live_room_host() then falls
  -- back to the earliest-joined player.
  host_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  side_count smallint NOT NULL CHECK (side_count BETWEEN 2 AND 4),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished', 'abandoned')),
  -- 0 in the lobby, then 1..number of halves.
  current_half smallint NOT NULL DEFAULT 0,
  -- The current half: 3-2-1 until half_started_at, the timer until
  -- half_ends_at, logging until half_closed_at (everyone logged) or
  -- log_closes_at (2 minutes), whichever comes first.
  half_started_at timestamptz,
  half_ends_at timestamptz,
  log_closes_at timestamptz,
  half_closed_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX live_rooms_challenge_idx ON public.live_rooms (challenge_id, created_at DESC);
CREATE INDEX live_rooms_active_idx ON public.live_rooms (status) WHERE status IN ('lobby', 'playing');

CREATE TABLE public.live_room_players (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  -- SET NULL keeps a finished room's history when a player deletes their
  -- account; a NULL row never counts as a player.
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  side smallint CHECK (side BETWEEN 1 AND 4),
  is_ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX live_room_players_user_idx ON public.live_room_players (user_id);

CREATE TABLE public.live_half_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  half smallint NOT NULL CHECK (half BETWEEN 1 AND 3),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  side smallint NOT NULL CHECK (side BETWEEN 1 AND 4),
  reps integer[] NOT NULL,   -- one value per exercise of that half, 0..max
  points numeric NOT NULL,   -- computed here, never sent by the app
  entered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, half, user_id)
);

-- ── Access: read-only for the app, writes only through the functions below ──

ALTER TABLE public.live_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_half_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.live_challenges, public.live_rooms, public.live_room_players,
  public.live_half_results FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.live_challenges, public.live_rooms, public.live_room_players,
  public.live_half_results TO service_role;

-- Players can read their own room and roster (RLS below), which realtime
-- needs. The room code isn't hidden: only players already in the room can
-- read the row. live_half_results has no client grant at all: other
-- players' numbers stay hidden until logging closes, which only
-- get_live_room_state can decide.
GRANT SELECT ON public.live_challenges, public.live_rooms, public.live_room_players TO authenticated;

CREATE FUNCTION public.is_live_room_player(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM live_room_players WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$function$;

CREATE POLICY "Signed-in users read active live challenges"
  ON public.live_challenges FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());

CREATE POLICY "Players read their live room"
  ON public.live_rooms FOR SELECT TO authenticated
  USING (public.is_live_room_player(id));

CREATE POLICY "Players read their live room roster"
  ON public.live_room_players FOR SELECT TO authenticated
  USING (public.is_live_room_player(room_id));

-- Live updates for the room screens (the app also polls, so a dropped event
-- is only a delay).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_rooms, public.live_room_players;
  END IF;
END $$;

-- ── Helpers (scoring mirrored in src/lib/liveTournament.ts) ────────────────

-- True when p_halves is 2–3 halves of 60–1800 s, each with 1–8 exercises
-- that have a name, a max of 1–500 reps and 0–1000 points per rep.
CREATE FUNCTION public.live_valid_halves(p_halves jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- CASE, not AND/OR: Postgres may evaluate those in any order, and
  -- jsonb_array_length on a non-array raises instead of returning false.
  SELECT CASE
    WHEN jsonb_typeof(p_halves) IS DISTINCT FROM 'array' THEN false
    WHEN jsonb_array_length(p_halves) NOT BETWEEN 2 AND 3 THEN false
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

-- Exercises of half p_half (1-based).
CREATE FUNCTION public.live_half_movements(p_halves jsonb, p_half integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT p_halves -> (p_half - 1) -> 'movements';
$function$;

-- Points for one player's log: sum of reps x points. Callers have already
-- checked every value is within 0..max.
CREATE FUNCTION public.live_reps_points(p_movements jsonb, p_reps integer[])
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(COALESCE(p_reps[m.ord::integer], 0) * (m.value->>'points')::numeric), 0)
  FROM jsonb_array_elements(p_movements) WITH ORDINALITY AS m(value, ord);
$function$;

-- The room's host: host_id while that user is still in the room, otherwise
-- the earliest-joined remaining player.
CREATE FUNCTION public.live_room_host(p_room_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT r.host_id FROM live_rooms r
      WHERE r.id = p_room_id
        AND EXISTS (SELECT 1 FROM live_room_players p WHERE p.room_id = r.id AND p.user_id = r.host_id)),
    (SELECT p.user_id FROM live_room_players p
      WHERE p.room_id = p_room_id AND p.user_id IS NOT NULL
      ORDER BY p.joined_at, p.id LIMIT 1)
  );
$function$;

-- Closes the current half at p_at and, after the last half, ends the match.
-- Caller holds the room row lock.
CREATE FUNCTION public.live_close_half(p_room_id uuid, p_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room live_rooms%ROWTYPE;
  v_halves integer;
BEGIN
  SELECT * INTO v_room FROM live_rooms WHERE id = p_room_id;
  IF v_room.status <> 'playing' OR v_room.half_closed_at IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT jsonb_array_length(halves) INTO v_halves FROM live_challenges WHERE id = v_room.challenge_id;

  UPDATE live_rooms
  SET half_closed_at = p_at,
      last_activity_at = now(),
      status = CASE WHEN current_half >= v_halves THEN 'finished' ELSE status END,
      finished_at = CASE WHEN current_half >= v_halves THEN p_at ELSE finished_at END
  WHERE id = p_room_id;
END;
$function$;

-- Moves a room forward on the server clock: closes logging at the 2-minute
-- deadline, ends a match nobody continued for 30 minutes (results kept), and
-- abandons a lobby idle for 2 hours. Steps repeat until nothing is left (a
-- room untouched for an hour may need two: close logging, then end). Takes
-- the row lock only when there is something to do, so polling doesn't
-- serialize on it.
CREATE FUNCTION public.live_advance(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room live_rooms%ROWTYPE;
  v_locked boolean := false;
BEGIN
  LOOP
    SELECT * INTO v_room FROM live_rooms WHERE id = p_room_id;
    IF NOT FOUND OR v_room.status NOT IN ('lobby', 'playing') THEN
      RETURN;
    END IF;
    IF NOT (
         (v_room.status = 'lobby' AND now() > v_room.last_activity_at + interval '2 hours')
      OR (v_room.status = 'playing' AND v_room.half_closed_at IS NULL AND now() >= v_room.log_closes_at)
      OR (v_room.status = 'playing' AND v_room.half_closed_at IS NOT NULL
          AND now() > v_room.half_closed_at + interval '30 minutes')
    ) THEN
      RETURN;
    END IF;

    IF NOT v_locked THEN
      -- Re-read under the lock: another call may have advanced it already.
      SELECT * INTO v_room FROM live_rooms WHERE id = p_room_id FOR UPDATE;
      v_locked := true;
    END IF;

    IF v_room.status = 'lobby' AND now() > v_room.last_activity_at + interval '2 hours' THEN
      UPDATE live_rooms SET status = 'abandoned', finished_at = now() WHERE id = p_room_id;
    ELSIF v_room.status = 'playing' AND v_room.half_closed_at IS NULL AND now() >= v_room.log_closes_at THEN
      PERFORM public.live_close_half(p_room_id, v_room.log_closes_at);
    ELSIF v_room.status = 'playing' AND v_room.half_closed_at IS NOT NULL
          AND now() > v_room.half_closed_at + interval '30 minutes' THEN
      -- Nobody started the next half: end with the halves played so far.
      UPDATE live_rooms SET status = 'finished', finished_at = now() WHERE id = p_room_id;
    ELSE
      RETURN;
    END IF;
  END LOOP;
END;
$function$;

-- Advances every unfinished room the user is in (so a stale one never blocks
-- them), then serializes create/join for that user: one live room at a time.
CREATE FUNCTION public.live_prepare_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('live_room_user:' || p_user_id::text));
  FOR v_room_id IN
    SELECT r.id FROM live_rooms r JOIN live_room_players p ON p.room_id = r.id
    WHERE p.user_id = p_user_id AND r.status IN ('lobby', 'playing')
  LOOP
    PERFORM public.live_advance(v_room_id);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM live_rooms r JOIN live_room_players p ON p.room_id = r.id
    WHERE p.user_id = p_user_id AND r.status IN ('lobby', 'playing')
  ) THEN
    RAISE EXCEPTION 'ALREADY_IN_ROOM';
  END IF;
END;
$function$;

-- Advances, locks and returns a room for the write functions below; raises
-- unless the caller is a player in it.
CREATE FUNCTION public.live_lock_room(p_room_id uuid)
RETURNS public.live_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room live_rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  PERFORM public.live_advance(p_room_id);
  SELECT * INTO v_room FROM live_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_live_room_player(p_room_id) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM';
  END IF;
  RETURN v_room;
END;
$function$;

-- ── Admin ─────────────────────────────────────────────────────────────────

CREATE FUNCTION public.admin_upsert_live_challenge(
  p_id uuid,
  p_title text,
  p_description text,
  p_halves jsonb,
  p_rest_sec integer,
  p_team_size integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing live_challenges%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_halves IS NULL OR NOT public.live_valid_halves(p_halves) THEN
    RAISE EXCEPTION 'INVALID_HALVES';
  END IF;
  IF p_team_size IS NULL OR p_team_size NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'INVALID_TEAM_SIZE';
  END IF;
  IF p_rest_sec IS NULL OR p_rest_sec NOT BETWEEN 0 AND 600 THEN
    RAISE EXCEPTION 'INVALID_REST';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO live_challenges (title, description, halves, rest_sec, team_size,
      starts_at, ends_at, is_active, created_by)
    VALUES (btrim(p_title), COALESCE(p_description, ''), p_halves, p_rest_sec, p_team_size,
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
      OR v_existing.team_size IS DISTINCT FROM p_team_size::smallint
    ) THEN
      RAISE EXCEPTION 'CHALLENGE_LOCKED';
    END IF;
    UPDATE live_challenges
    SET title = btrim(p_title), description = COALESCE(p_description, ''), halves = p_halves,
        rest_sec = p_rest_sec, team_size = p_team_size, starts_at = p_starts_at,
        ends_at = p_ends_at, is_active = COALESCE(p_is_active, is_active), updated_at = now()
    WHERE id = p_id;
    v_id := p_id;
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), CASE WHEN p_id IS NULL THEN 'live_challenge_create' ELSE 'live_challenge_update' END,
          v_id::text, jsonb_build_object('title', btrim(p_title)));

  RETURN v_id;
END;
$function$;

-- Only a challenge nobody has played can be deleted (deleting would erase
-- players' history); switch is_active off to hide one instead.
CREATE FUNCTION public.admin_delete_live_challenge(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF EXISTS (SELECT 1 FROM live_rooms WHERE challenge_id = p_id) THEN
    RAISE EXCEPTION 'CHALLENGE_HAS_ROOMS';
  END IF;
  DELETE FROM live_challenges WHERE id = p_id RETURNING title INTO v_title;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'live_challenge_delete', p_id::text, jsonb_build_object('title', v_title));
END;
$function$;

CREATE FUNCTION public.admin_get_live_challenges()
RETURNS TABLE (id uuid, title text, description text, halves jsonb, rest_sec integer,
  team_size smallint, starts_at timestamptz, ends_at timestamptz, is_active boolean,
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
  SELECT c.id, c.title, c.description, c.halves, c.rest_sec, c.team_size, c.starts_at,
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

CREATE FUNCTION public.admin_get_live_rooms(p_challenge_id uuid)
RETURNS TABLE (room_id uuid, status text, side_count smallint, current_half smallint,
  host_name text, players jsonb, created_at timestamptz, started_at timestamptz,
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
    r.created_at, r.started_at, r.finished_at, r.last_activity_at
  FROM live_rooms r
  WHERE r.challenge_id = p_challenge_id
  ORDER BY r.created_at DESC;
END;
$function$;

-- Moderation / unsticking a room. An abandoned room keeps no result.
CREATE FUNCTION public.admin_abandon_live_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE live_rooms SET status = 'abandoned', finished_at = now(), last_activity_at = now()
  WHERE id = p_room_id AND status IN ('lobby', 'playing');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_ACTIVE';
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'live_room_abandon', p_room_id::text, '{}'::jsonb);
END;
$function$;

-- ── Lobby ─────────────────────────────────────────────────────────────────

CREATE FUNCTION public.create_live_room(p_challenge_id uuid, p_side_count integer DEFAULT 2)
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_side_count IS NULL OR p_side_count NOT BETWEEN 2 AND 4 THEN
    RAISE EXCEPTION 'INVALID_SIDES';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM live_challenges
    WHERE id = p_challenge_id AND is_active AND now() >= starts_at AND now() < ends_at
  ) THEN
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
      VALUES (p_challenge_id, v_code, v_uid, p_side_count)
      RETURNING id INTO v_room_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- code collision: try another
    END;
  END LOOP;

  INSERT INTO live_room_players (room_id, user_id) VALUES (v_room_id, v_uid);

  RETURN QUERY SELECT v_room_id, v_code;
END;
$function$;

-- Returns the room id. Joining a room you're already in just returns it, so
-- a retried request after a network drop is harmless.
CREATE FUNCTION public.join_live_room(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
  v_size integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_room FROM live_rooms WHERE code = upper(btrim(COALESCE(p_code, '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;
  IF EXISTS (SELECT 1 FROM live_room_players WHERE room_id = v_room.id AND user_id = v_uid) THEN
    RETURN v_room.id;
  END IF;

  PERFORM public.live_prepare_user(v_uid);
  PERFORM public.live_advance(v_room.id);
  -- Row lock: two people can't both take the last place.
  SELECT * INTO v_room FROM live_rooms WHERE id = v_room.id FOR UPDATE;
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_STARTED';
  END IF;
  SELECT team_size INTO v_size FROM live_challenges WHERE id = v_room.challenge_id;
  IF (SELECT count(user_id) FROM live_room_players WHERE room_id = v_room.id) >= v_size * v_room.side_count THEN
    RAISE EXCEPTION 'ROOM_FULL';
  END IF;

  INSERT INTO live_room_players (room_id, user_id) VALUES (v_room.id, v_uid);
  UPDATE live_rooms SET last_activity_at = now() WHERE id = v_room.id;
  RETURN v_room.id;
END;
$function$;

-- p_side NULL = back to "no side". Picking a side always clears Ready.
CREATE FUNCTION public.pick_live_side(p_room_id uuid, p_side integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
  v_size integer;
BEGIN
  v_room := public.live_lock_room(p_room_id);
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_STARTED';
  END IF;
  IF p_side IS NOT NULL THEN
    IF p_side NOT BETWEEN 1 AND v_room.side_count THEN
      RAISE EXCEPTION 'INVALID_SIDE';
    END IF;
    SELECT team_size INTO v_size FROM live_challenges WHERE id = v_room.challenge_id;
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

CREATE FUNCTION public.set_live_ready(p_room_id uuid, p_ready boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room live_rooms%ROWTYPE;
BEGIN
  v_room := public.live_lock_room(p_room_id);
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_STARTED';
  END IF;
  IF COALESCE(p_ready, false) AND NOT EXISTS (
    SELECT 1 FROM live_room_players WHERE room_id = p_room_id AND user_id = v_uid AND side IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PICK_SIDE_FIRST';
  END IF;
  UPDATE live_room_players SET is_ready = COALESCE(p_ready, false)
  WHERE room_id = p_room_id AND user_id = v_uid;
  UPDATE live_rooms SET last_activity_at = now() WHERE id = p_room_id;
END;
$function$;

-- Leave (self) or remove (host removes p_user_id). Lobby only. If the host
-- leaves, the earliest-joined player hosts; the last one out abandons it.
CREATE FUNCTION public.leave_live_room(p_room_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid := COALESCE(p_user_id, auth.uid());
  v_room live_rooms%ROWTYPE;
  v_host uuid;
  v_next uuid;
BEGIN
  v_room := public.live_lock_room(p_room_id);
  v_host := public.live_room_host(p_room_id);
  IF v_target <> v_uid AND v_uid IS DISTINCT FROM v_host THEN
    RAISE EXCEPTION 'NOT_HOST';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM live_room_players WHERE room_id = p_room_id AND user_id = v_target) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM';
  END IF;
  IF v_room.status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_STARTED';
  END IF;

  DELETE FROM live_room_players WHERE room_id = p_room_id AND user_id = v_target;

  IF v_target IS NOT DISTINCT FROM v_host THEN
    SELECT user_id INTO v_next FROM live_room_players
    WHERE room_id = p_room_id AND user_id IS NOT NULL
    ORDER BY joined_at, id LIMIT 1;
    IF v_next IS NULL THEN
      UPDATE live_rooms SET status = 'abandoned', finished_at = now(), last_activity_at = now()
      WHERE id = p_room_id;
      RETURN;
    END IF;
    UPDATE live_rooms SET host_id = v_next WHERE id = p_room_id;
  END IF;
  UPDATE live_rooms SET last_activity_at = now() WHERE id = p_room_id;
END;
$function$;

-- ── Match ─────────────────────────────────────────────────────────────────

-- Starts half 1 (from the lobby) or the next half (once logging of the
-- previous one closed). The host starts; if the host hasn't 3 minutes after
-- logging closed, any player can. The half starts 3 s later (3-2-1).
CREATE FUNCTION public.start_live_half(p_room_id uuid)
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
  v_started timestamptz := now() + interval '3 seconds';
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

  RETURN QUERY SELECT v_next, v_started, v_started + make_interval(secs => v_duration), now();
END;
$function$;

-- Logs one player's reps for the current half: the player themselves, or
-- the host for anyone. Allowed from the end of the timer (2 s allowance for
-- network delay) until logging closes; a player can fix their log until
-- then. Each value must be 0..that exercise's max. Logging closes as soon as
-- every player has logged.
CREATE FUNCTION public.submit_live_reps(p_room_id uuid, p_half integer, p_user_id uuid, p_reps integer[])
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

  UPDATE live_rooms SET last_activity_at = now() WHERE id = p_room_id;

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

CREATE FUNCTION public.abandon_live_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room live_rooms%ROWTYPE;
BEGIN
  v_room := public.live_lock_room(p_room_id);
  IF auth.uid() IS DISTINCT FROM public.live_room_host(p_room_id) THEN
    RAISE EXCEPTION 'NOT_HOST';
  END IF;
  IF v_room.status NOT IN ('lobby', 'playing') THEN
    RAISE EXCEPTION 'ROOM_NOT_ACTIVE';
  END IF;
  UPDATE live_rooms SET status = 'abandoned', finished_at = now(), last_activity_at = now()
  WHERE id = p_room_id;
END;
$function$;

-- ── Reads ─────────────────────────────────────────────────────────────────

-- Everything the room screens need, plus the server clock so every phone
-- shows the same timer. Other players' numbers for the half being logged are
-- left out until logging closes (only who has logged is shown).
CREATE FUNCTION public.get_live_room_state(p_room_id uuid)
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
    'challenge', (SELECT jsonb_build_object(
                    'id', c.id, 'title', c.title, 'description', c.description,
                    'halves', c.halves, 'rest_sec', c.rest_sec, 'team_size', c.team_size)
                  FROM live_challenges c WHERE c.id = v_room.challenge_id),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'display_name', pr.display_name, 'side', p.side,
               'is_ready', p.is_ready, 'is_host', p.user_id IS NOT DISTINCT FROM v_host,
               'joined_at', p.joined_at)
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

-- The caller's unfinished room, if any (to resume after reopening the app).
CREATE FUNCTION public.get_my_live_room()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  FOR v_room_id IN
    SELECT r.id FROM live_rooms r JOIN live_room_players p ON p.room_id = r.id
    WHERE p.user_id = auth.uid() AND r.status IN ('lobby', 'playing')
  LOOP
    PERFORM public.live_advance(v_room_id);
  END LOOP;
  SELECT r.id INTO v_room_id
  FROM live_rooms r JOIN live_room_players p ON p.room_id = r.id
  WHERE p.user_id = auth.uid() AND r.status IN ('lobby', 'playing')
  ORDER BY r.created_at DESC LIMIT 1;
  RETURN v_room_id;
END;
$function$;

-- The caller's finished rooms, newest first: their side's place (1 = won,
-- ties share a place), points, and whether they were the best player.
CREATE FUNCTION public.get_my_live_history()
RETURNS TABLE (room_id uuid, challenge_id uuid, challenge_title text, finished_at timestamptz,
  side_count smallint, halves_played smallint, my_side smallint, my_points numeric,
  side_points numeric, side_place bigint, is_best_player boolean, player_count bigint)
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
    (SELECT count(user_id) FROM live_room_players p2 WHERE p2.room_id = m.id)
  FROM mine m
  JOIN live_challenges c ON c.id = m.challenge_id
  JOIN places pl ON pl.room_id = m.id AND pl.side = m.my_side
  WHERE auth.uid() IS NOT NULL
  ORDER BY m.finished_at DESC;
$function$;

-- ── Function privileges ───────────────────────────────────────────────────
-- Internal helpers: owner only (they run inside the definer functions above).
REVOKE EXECUTE ON FUNCTION public.live_valid_halves(jsonb), public.live_half_movements(jsonb, integer),
  public.live_reps_points(jsonb, integer[]), public.live_room_host(uuid),
  public.live_close_half(uuid, timestamptz), public.live_advance(uuid),
  public.live_prepare_user(uuid), public.live_lock_room(uuid)
  FROM PUBLIC, anon, authenticated;

-- is_live_room_player is used inside RLS policies, so authenticated must run it.
REVOKE EXECUTE ON FUNCTION public.is_live_room_player(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_live_room_player(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION
  public.admin_upsert_live_challenge(uuid, text, text, jsonb, integer, integer, timestamptz, timestamptz, boolean),
  public.admin_delete_live_challenge(uuid),
  public.admin_get_live_challenges(),
  public.admin_get_live_rooms(uuid),
  public.admin_abandon_live_room(uuid),
  public.create_live_room(uuid, integer),
  public.join_live_room(text),
  public.pick_live_side(uuid, integer),
  public.set_live_ready(uuid, boolean),
  public.leave_live_room(uuid, uuid),
  public.start_live_half(uuid),
  public.submit_live_reps(uuid, integer, uuid, integer[]),
  public.abandon_live_room(uuid),
  public.get_live_room_state(uuid),
  public.get_my_live_room(),
  public.get_my_live_history()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_upsert_live_challenge(uuid, text, text, jsonb, integer, integer, timestamptz, timestamptz, boolean),
  public.admin_delete_live_challenge(uuid),
  public.admin_get_live_challenges(),
  public.admin_get_live_rooms(uuid),
  public.admin_abandon_live_room(uuid),
  public.create_live_room(uuid, integer),
  public.join_live_room(text),
  public.pick_live_side(uuid, integer),
  public.set_live_ready(uuid, boolean),
  public.leave_live_room(uuid, uuid),
  public.start_live_half(uuid),
  public.submit_live_reps(uuid, integer, uuid, integer[]),
  public.abandon_live_room(uuid),
  public.get_live_room_state(uuid),
  public.get_my_live_room(),
  public.get_my_live_history()
  TO authenticated, service_role;

-- ── Feature flag ──────────────────────────────────────────────────────────
-- Per-platform switch for the LIVE tab (admins always see it, so it can be
-- tested on prod before it's switched on). Read like team_challenge_enabled.
ALTER TABLE IF EXISTS public.app_config
  ADD COLUMN IF NOT EXISTS live_tournament_enabled boolean NOT NULL DEFAULT false;
