-- Team Challenge, phase 1 (docs/features/TEAM_CHALLENGE_PLAN.md).
--
-- Admins publish a weekly team challenge; a leader creates a team, members
-- join with an invite code, and the team makes unlimited attempts (best
-- counts). Format decides who submits:
--   sync / switch  -> the leader submits one result for the team
--   collect        -> every member submits their own; the team score is the sum
-- For Time is lower-is-better seconds (cap reached = cap + 1 s per missing
-- rep); AMRAP is Weekly Challenge points (rounds x round points + partial).
--
-- Lessons from the Tournament audit: the client can't write any of these
-- tables. Every write is a SECURITY DEFINER function that checks the caller,
-- and every time is a server timestamp, never a client-reported number.
-- Errors are raised as bare codes (e.g. 'TEAM_FULL') that the app maps to
-- EN/AR strings.

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE public.team_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  format text NOT NULL CHECK (format IN ('sync', 'switch', 'collect')),
  scoring_type text NOT NULL CHECK (scoring_type IN ('time', 'reps')),
  -- [{name, reps, points}], same shape as weekly_challenges.movements
  movements jsonb NOT NULL CHECK (jsonb_typeof(movements) = 'array'),
  -- For Time: rounds of the movement list (1 = one pass). AMRAP: always 1.
  rounds smallint NOT NULL DEFAULT 1 CHECK (rounds BETWEEN 1 AND 50),
  -- AMRAP duration, or For Time cap
  time_limit_sec integer NOT NULL CHECK (time_limit_sec BETWEEN 60 AND 7200),
  team_size smallint NOT NULL CHECK (team_size BETWEEN 2 AND 4),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  started_notification_sent_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX team_challenges_window_idx ON public.team_challenges (starts_at, ends_at);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.team_challenges(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 24),
  -- NULL after the leader's account is deleted; team_leader() then falls
  -- back to the earliest-joined member.
  leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code text NOT NULL UNIQUE,
  -- Set at the first submitted attempt; the roster is frozen from then on.
  locked_at timestamptz,
  best_attempt_id uuid,
  best_score numeric,
  best_submitted_at timestamptz,
  attempts_count integer NOT NULL DEFAULT 0,
  -- Who created it (for the per-challenge rate limit); never changes.
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX teams_challenge_name_key ON public.teams (challenge_id, lower(btrim(name)));
CREATE INDEX teams_challenge_best_idx ON public.teams (challenge_id) WHERE best_score IS NOT NULL;

CREATE TABLE public.team_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  -- SET NULL keeps a locked team's history when a member deletes their
  -- account ("Deleted user"); a NULL row doesn't count toward the roster.
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX team_members_user_idx ON public.team_members (user_id);

CREATE TABLE public.team_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.team_challenges(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'submitted', 'abandoned')),
  -- now() + 3 s at start: the 3-2-1 countdown runs until started_at on every phone.
  started_at timestamptz NOT NULL,
  cap_at timestamptz NOT NULL,
  score numeric,
  capped boolean,
  submitted_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- At most one running attempt per team.
CREATE UNIQUE INDEX team_attempts_one_running ON public.team_attempts (team_id) WHERE status = 'running';
CREATE INDEX team_attempts_team_idx ON public.team_attempts (team_id, created_at DESC);

ALTER TABLE public.teams
  ADD CONSTRAINT teams_best_attempt_fkey FOREIGN KEY (best_attempt_id)
  REFERENCES public.team_attempts(id) ON DELETE SET NULL;

-- One row for the whole team (sync/switch, is_team_row) or one per member (collect).
CREATE TABLE public.team_attempt_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.team_attempts(id) ON DELETE CASCADE,
  is_team_row boolean NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  time_sec numeric,          -- finished For Time only
  rounds integer,            -- AMRAP / capped progress
  partial integer[],         -- reps per movement in the unfinished round
  capped boolean NOT NULL DEFAULT false,
  score numeric NOT NULL,    -- seconds (time) or points (reps), computed here
  entered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  CHECK (is_team_row = (user_id IS NULL) OR NOT is_team_row)
);

CREATE UNIQUE INDEX team_attempt_results_team_row ON public.team_attempt_results (attempt_id) WHERE is_team_row;
CREATE UNIQUE INDEX team_attempt_results_member_row ON public.team_attempt_results (attempt_id, user_id) WHERE NOT is_team_row;

-- ── Access: read-only for the app, writes only through the functions below ──

ALTER TABLE public.team_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_attempt_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.team_challenges, public.teams, public.team_members,
  public.team_attempts, public.team_attempt_results FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.team_challenges, public.teams, public.team_members,
  public.team_attempts, public.team_attempt_results TO service_role;

GRANT SELECT ON public.team_challenges, public.team_members,
  public.team_attempts, public.team_attempt_results TO authenticated;
-- invite_code is deliberately left out; members read it via get_team_state.
GRANT SELECT (id, challenge_id, name, leader_id, locked_at, best_attempt_id, best_score,
  best_submitted_at, attempts_count, created_by, created_at) ON public.teams TO authenticated;

CREATE FUNCTION public.is_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM team_members WHERE team_id = p_team_id AND user_id = auth.uid()
  );
$function$;

CREATE POLICY "Signed-in users read active team challenges"
  ON public.team_challenges FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());

CREATE POLICY "Members read their team"
  ON public.teams FOR SELECT TO authenticated
  USING (public.is_team_member(id));

CREATE POLICY "Members read their team roster"
  ON public.team_members FOR SELECT TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Members read their team attempts"
  ON public.team_attempts FOR SELECT TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Members read their team attempt results"
  ON public.team_attempt_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_attempts a
    WHERE a.id = attempt_id AND public.is_team_member(a.team_id)
  ));

-- Live updates for the lobby and attempt screens (the app also polls, so a
-- dropped event or a DELETE without a full replica identity is only a delay).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.team_members, public.team_attempts, public.team_attempt_results;
  END IF;
END $$;

-- ── Scoring helpers (mirrored in src/lib/teamChallenge.ts) ─────────────────

-- Reps in one pass of the movement list.
CREATE FUNCTION public.tc_round_reps(p_movements jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM((m->>'reps')::integer), 0)::integer FROM jsonb_array_elements(p_movements) m;
$function$;

-- Points for one full round: sum of reps x points.
CREATE FUNCTION public.tc_round_points(p_movements jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM((m->>'reps')::numeric * (m->>'points')::numeric), 0)
  FROM jsonb_array_elements(p_movements) m;
$function$;

-- Unfinished-round reps / points, each movement clamped to 0..its reps.
CREATE FUNCTION public.tc_partial_reps(p_movements jsonb, p_partial integer[])
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(GREATEST(0, LEAST((m.value->>'reps')::integer, COALESCE(p_partial[m.ord::integer], 0)))), 0)::integer
  FROM jsonb_array_elements(p_movements) WITH ORDINALITY AS m(value, ord);
$function$;

CREATE FUNCTION public.tc_partial_points(p_movements jsonb, p_partial integer[])
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(
    GREATEST(0, LEAST((m.value->>'reps')::integer, COALESCE(p_partial[m.ord::integer], 0)))
    * (m.value->>'points')::numeric), 0)
  FROM jsonb_array_elements(p_movements) WITH ORDINALITY AS m(value, ord);
$function$;

-- The team's leader: leader_id while that user is still on the team,
-- otherwise the earliest-joined remaining member.
CREATE FUNCTION public.team_leader(p_team_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT t.leader_id FROM teams t
      WHERE t.id = p_team_id
        AND EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = t.leader_id)),
    (SELECT m.user_id FROM team_members m
      WHERE m.team_id = p_team_id AND m.user_id IS NOT NULL
      ORDER BY m.joined_at, m.id LIMIT 1)
  );
$function$;

-- Settles a running attempt once every result it needs exists: sets the
-- team score, marks it submitted, locks the roster and keeps the team's
-- best. Caller must already hold the attempt row lock (FOR UPDATE).
CREATE FUNCTION public.tc_finalize_attempt(p_attempt_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt team_attempts%ROWTYPE;
  v_challenge team_challenges%ROWTYPE;
  v_team teams%ROWTYPE;
  v_score numeric;
  v_capped boolean;
  v_missing integer;
BEGIN
  SELECT * INTO v_attempt FROM team_attempts WHERE id = p_attempt_id;
  IF v_attempt.status <> 'running' THEN
    RETURN false;
  END IF;
  SELECT * INTO v_challenge FROM team_challenges WHERE id = v_attempt.challenge_id;

  IF v_challenge.format = 'collect' THEN
    SELECT count(*) INTO v_missing
    FROM team_members m
    WHERE m.team_id = v_attempt.team_id AND m.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM team_attempt_results r
        WHERE r.attempt_id = p_attempt_id AND NOT r.is_team_row AND r.user_id = m.user_id
      );
    IF v_missing > 0 THEN
      RETURN false;
    END IF;
    SELECT sum(r.score), bool_or(r.capped) INTO v_score, v_capped
    FROM team_attempt_results r
    WHERE r.attempt_id = p_attempt_id AND NOT r.is_team_row;
  ELSE
    SELECT r.score, r.capped INTO v_score, v_capped
    FROM team_attempt_results r
    WHERE r.attempt_id = p_attempt_id AND r.is_team_row;
  END IF;

  IF v_score IS NULL THEN
    RETURN false;
  END IF;

  UPDATE team_attempts
  SET status = 'submitted', score = v_score, capped = COALESCE(v_capped, false), submitted_at = now()
  WHERE id = p_attempt_id;

  SELECT * INTO v_team FROM teams WHERE id = v_attempt.team_id FOR UPDATE;

  UPDATE teams
  SET attempts_count = attempts_count + 1,
      locked_at = COALESCE(locked_at, now()),
      best_attempt_id = CASE WHEN is_better THEN p_attempt_id ELSE best_attempt_id END,
      best_score = CASE WHEN is_better THEN v_score ELSE best_score END,
      best_submitted_at = CASE WHEN is_better THEN now() ELSE best_submitted_at END
  FROM (SELECT v_team.best_score IS NULL
          OR (v_challenge.scoring_type = 'time' AND v_score < v_team.best_score)
          OR (v_challenge.scoring_type = 'reps' AND v_score > v_team.best_score) AS is_better) b
  WHERE id = v_attempt.team_id;

  RETURN true;
END;
$function$;

-- A running attempt nobody finished is abandoned 15 minutes after its cap.
CREATE FUNCTION public.tc_expire_stale_attempts(p_team_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE team_attempts SET status = 'abandoned'
  WHERE team_id = p_team_id AND status = 'running' AND now() > cap_at + interval '15 minutes';
$function$;

-- ── Admin ─────────────────────────────────────────────────────────────────

CREATE FUNCTION public.admin_upsert_team_challenge(
  p_id uuid,
  p_title text,
  p_description text,
  p_format text,
  p_scoring_type text,
  p_movements jsonb,
  p_rounds integer,
  p_time_limit_sec integer,
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
  v_existing team_challenges%ROWTYPE;
  v_id uuid;
  v_rounds integer := CASE WHEN p_scoring_type = 'reps' THEN 1 ELSE p_rounds END;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF jsonb_typeof(p_movements) <> 'array'
     OR jsonb_array_length(p_movements) NOT BETWEEN 1 AND 12
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_movements) m
       WHERE jsonb_typeof(m) <> 'object'
          OR char_length(btrim(COALESCE(m->>'name', ''))) NOT BETWEEN 1 AND 60
          OR CASE WHEN COALESCE(m->>'reps', '') ~ '^[0-9]{1,4}$'
                  THEN (m->>'reps')::integer NOT BETWEEN 1 AND 500 ELSE true END
          OR CASE WHEN COALESCE(m->>'points', '') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
                  THEN (m->>'points')::numeric > 1000 ELSE true END
     ) THEN
    RAISE EXCEPTION 'INVALID_MOVEMENTS';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO team_challenges (title, description, format, scoring_type, movements, rounds,
      time_limit_sec, team_size, starts_at, ends_at, is_active, created_by)
    VALUES (btrim(p_title), COALESCE(p_description, ''), p_format, p_scoring_type, p_movements, v_rounds,
      p_time_limit_sec, p_team_size, p_starts_at, p_ends_at, COALESCE(p_is_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_existing FROM team_challenges WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    -- Once teams exist, anything that changes how a result is scored is frozen.
    IF EXISTS (SELECT 1 FROM teams WHERE challenge_id = p_id) AND (
         v_existing.format IS DISTINCT FROM p_format
      OR v_existing.scoring_type IS DISTINCT FROM p_scoring_type
      OR v_existing.movements IS DISTINCT FROM p_movements
      OR v_existing.rounds IS DISTINCT FROM v_rounds::smallint
      OR v_existing.time_limit_sec IS DISTINCT FROM p_time_limit_sec
      OR v_existing.team_size IS DISTINCT FROM p_team_size::smallint
      OR v_existing.starts_at IS DISTINCT FROM p_starts_at
    ) THEN
      RAISE EXCEPTION 'CHALLENGE_LOCKED';
    END IF;
    UPDATE team_challenges
    SET title = btrim(p_title), description = COALESCE(p_description, ''), format = p_format,
        scoring_type = p_scoring_type, movements = p_movements, rounds = v_rounds,
        time_limit_sec = p_time_limit_sec, team_size = p_team_size, starts_at = p_starts_at,
        ends_at = p_ends_at, is_active = COALESCE(p_is_active, is_active), updated_at = now()
    WHERE id = p_id;
    v_id := p_id;
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), CASE WHEN p_id IS NULL THEN 'team_challenge_create' ELSE 'team_challenge_update' END,
          v_id::text, jsonb_build_object('title', btrim(p_title)));

  RETURN v_id;
END;
$function$;

CREATE FUNCTION public.admin_delete_team_challenge(p_id uuid)
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
  IF EXISTS (SELECT 1 FROM teams WHERE challenge_id = p_id) THEN
    RAISE EXCEPTION 'CHALLENGE_HAS_TEAMS';
  END IF;
  DELETE FROM team_challenges WHERE id = p_id RETURNING title INTO v_title;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'team_challenge_delete', p_id::text, jsonb_build_object('title', v_title));
END;
$function$;

-- Moderation (e.g. an offensive team name). Removes the team and its results.
CREATE FUNCTION public.admin_delete_team(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_team teams%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  DELETE FROM teams WHERE id = p_team_id RETURNING * INTO v_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'team_delete', p_team_id::text,
          jsonb_build_object('name', v_team.name, 'challenge_id', v_team.challenge_id));
END;
$function$;

-- Admin reads: RLS only lets team members see teams, so the admin panel
-- lists challenges with their counts, and every team (including ones that
-- never submitted, for moderation), through these.
CREATE FUNCTION public.admin_get_team_challenges()
RETURNS TABLE (id uuid, title text, description text, format text, scoring_type text,
  movements jsonb, rounds smallint, time_limit_sec integer, team_size smallint,
  starts_at timestamptz, ends_at timestamptz, is_active boolean, created_at timestamptz,
  team_count bigint, ranked_team_count bigint, submitted_attempts bigint, player_count bigint)
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
  SELECT c.id, c.title, c.description, c.format, c.scoring_type, c.movements, c.rounds,
    c.time_limit_sec, c.team_size, c.starts_at, c.ends_at, c.is_active, c.created_at,
    (SELECT count(*) FROM teams t WHERE t.challenge_id = c.id),
    (SELECT count(*) FROM teams t WHERE t.challenge_id = c.id AND t.best_score IS NOT NULL),
    (SELECT count(*) FROM team_attempts a WHERE a.challenge_id = c.id AND a.status = 'submitted'),
    (SELECT count(DISTINCT m.user_id) FROM team_members m JOIN teams t ON t.id = m.team_id
      WHERE t.challenge_id = c.id)
  FROM team_challenges c
  ORDER BY c.starts_at DESC;
END;
$function$;

CREATE FUNCTION public.admin_get_challenge_teams(p_challenge_id uuid)
RETURNS TABLE (team_id uuid, name text, members jsonb, member_count bigint, locked_at timestamptz,
  best_score numeric, attempts_count integer, best_submitted_at timestamptz, created_at timestamptz)
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
  SELECT t.id, t.name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'user_id', m.user_id, 'display_name', p.display_name,
                'is_leader', m.user_id IS NOT DISTINCT FROM public.team_leader(t.id))
              ORDER BY m.joined_at, m.id)
              FROM team_members m LEFT JOIN profiles p ON p.id = m.user_id
              WHERE m.team_id = t.id), '[]'::jsonb),
    (SELECT count(m.user_id) FROM team_members m WHERE m.team_id = t.id),
    t.locked_at, t.best_score, t.attempts_count, t.best_submitted_at, t.created_at
  FROM teams t
  WHERE t.challenge_id = p_challenge_id
  ORDER BY t.best_score IS NULL, t.created_at DESC;
END;
$function$;

-- ── Teams ─────────────────────────────────────────────────────────────────

CREATE FUNCTION public.create_team(p_challenge_id uuid, p_name text)
RETURNS TABLE (team_id uuid, invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(COALESCE(p_name, ''));
  v_code text;
  v_team_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 24 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM team_challenges
    WHERE id = p_challenge_id AND is_active AND now() >= starts_at AND now() < ends_at
  ) THEN
    RAISE EXCEPTION 'CHALLENGE_CLOSED';
  END IF;
  IF (SELECT count(*) FROM teams WHERE challenge_id = p_challenge_id AND created_by = v_uid) >= 10 THEN
    RAISE EXCEPTION 'TOO_MANY_TEAMS';
  END IF;

  LOOP
    v_code := (
      SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1), '')
      FROM generate_series(1, 6)
    );
    BEGIN
      INSERT INTO teams (challenge_id, name, leader_id, invite_code, created_by)
      VALUES (p_challenge_id, v_name, v_uid, v_code, v_uid)
      RETURNING id INTO v_team_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM teams t WHERE t.challenge_id = p_challenge_id AND lower(btrim(t.name)) = lower(v_name)) THEN
        RAISE EXCEPTION 'NAME_TAKEN';
      END IF;
      -- invite code collision: try another
    END;
  END LOOP;

  INSERT INTO team_members (team_id, user_id) VALUES (v_team_id, v_uid);

  RETURN QUERY SELECT v_team_id, v_code;
END;
$function$;

CREATE FUNCTION public.join_team(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_team teams%ROWTYPE;
  v_size integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Row lock: two people can't both take the last place.
  SELECT * INTO v_team FROM teams WHERE invite_code = upper(btrim(COALESCE(p_code, ''))) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;

  SELECT team_size INTO v_size FROM team_challenges
  WHERE id = v_team.challenge_id AND is_active AND now() < ends_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHALLENGE_CLOSED';
  END IF;
  IF EXISTS (SELECT 1 FROM team_members WHERE team_id = v_team.id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;
  IF v_team.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_LOCKED';
  END IF;
  IF (SELECT count(user_id) FROM team_members WHERE team_id = v_team.id) >= v_size THEN
    RAISE EXCEPTION 'TEAM_FULL';
  END IF;

  INSERT INTO team_members (team_id, user_id) VALUES (v_team.id, v_uid);
  RETURN v_team.id;
END;
$function$;

-- Leave (self) or remove (leader removes p_user_id). Only before the roster
-- locks and never during an attempt. If the leader leaves, the earliest
-- remaining member leads; the last member leaving deletes the team.
CREATE FUNCTION public.leave_team(p_team_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid := COALESCE(p_user_id, auth.uid());
  v_team teams%ROWTYPE;
  v_leader uuid;
  v_next uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = p_team_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;
  v_leader := public.team_leader(p_team_id);
  IF v_target <> v_uid AND v_uid IS DISTINCT FROM v_leader THEN
    RAISE EXCEPTION 'NOT_LEADER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = p_team_id AND user_id = v_target) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;
  IF v_team.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_LOCKED';
  END IF;
  PERFORM public.tc_expire_stale_attempts(p_team_id);
  IF EXISTS (SELECT 1 FROM team_attempts WHERE team_id = p_team_id AND status = 'running') THEN
    RAISE EXCEPTION 'ATTEMPT_RUNNING';
  END IF;

  DELETE FROM team_members WHERE team_id = p_team_id AND user_id = v_target;

  IF v_target IS NOT DISTINCT FROM v_leader THEN
    SELECT user_id INTO v_next FROM team_members
    WHERE team_id = p_team_id AND user_id IS NOT NULL
    ORDER BY joined_at, id LIMIT 1;
    IF v_next IS NULL THEN
      DELETE FROM teams WHERE id = p_team_id;
    ELSE
      UPDATE teams SET leader_id = v_next WHERE id = p_team_id;
    END IF;
  END IF;
END;
$function$;

-- ── Attempts ──────────────────────────────────────────────────────────────

CREATE FUNCTION public.start_team_attempt(p_team_id uuid)
RETURNS TABLE (attempt_id uuid, started_at timestamptz, cap_at timestamptz, server_now timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_team teams%ROWTYPE;
  v_challenge team_challenges%ROWTYPE;
  v_started timestamptz := now() + interval '3 seconds';
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;
  IF v_uid IS DISTINCT FROM public.team_leader(p_team_id) THEN
    RAISE EXCEPTION 'NOT_LEADER';
  END IF;

  SELECT * INTO v_challenge FROM team_challenges WHERE id = v_team.challenge_id;
  IF NOT v_challenge.is_active OR now() < v_challenge.starts_at OR now() >= v_challenge.ends_at THEN
    RAISE EXCEPTION 'CHALLENGE_CLOSED';
  END IF;
  IF (SELECT count(user_id) FROM team_members WHERE team_id = p_team_id) < v_challenge.team_size THEN
    RAISE EXCEPTION 'TEAM_NOT_FULL';
  END IF;

  PERFORM public.tc_expire_stale_attempts(p_team_id);
  IF EXISTS (SELECT 1 FROM team_attempts WHERE team_id = p_team_id AND status = 'running') THEN
    RAISE EXCEPTION 'ATTEMPT_RUNNING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM team_attempts
    WHERE team_id = p_team_id AND created_at > now() - interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'COOLDOWN';
  END IF;

  INSERT INTO team_attempts (team_id, challenge_id, started_at, cap_at, created_by)
  VALUES (p_team_id, v_challenge.id, v_started,
          v_started + make_interval(secs => v_challenge.time_limit_sec), v_uid)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_started, v_started + make_interval(secs => v_challenge.time_limit_sec), now();
END;
$function$;

-- Locks and returns a running attempt for the write functions below;
-- raises if the caller isn't on the team or the attempt is over. (An
-- expired attempt is marked abandoned by tc_expire_stale_attempts on the
-- next start / state read; an UPDATE here would roll back with the RAISE.)
CREATE FUNCTION public.tc_lock_running_attempt(p_attempt_id uuid)
RETURNS public.team_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt team_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM team_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_team_member(v_attempt.team_id) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;
  IF v_attempt.status <> 'running' THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_RUNNING';
  END IF;
  IF now() > v_attempt.cap_at + interval '15 minutes' THEN
    RAISE EXCEPTION 'ATTEMPT_EXPIRED';
  END IF;
  RETURN v_attempt;
END;
$function$;

-- For Time finish, timed by the server. p_user_id NULL = the whole team
-- (sync/switch, leader only); otherwise that member (collect: the member
-- themselves or the leader on their behalf).
CREATE FUNCTION public.finish_team_attempt(p_attempt_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE (time_sec numeric, attempt_submitted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_attempt team_attempts%ROWTYPE;
  v_challenge team_challenges%ROWTYPE;
  v_leader uuid;
  v_time numeric;
  v_done boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  v_attempt := public.tc_lock_running_attempt(p_attempt_id);
  SELECT * INTO v_challenge FROM team_challenges WHERE id = v_attempt.challenge_id;
  v_leader := public.team_leader(v_attempt.team_id);

  IF v_challenge.scoring_type <> 'time' THEN
    RAISE EXCEPTION 'WRONG_SCORING';
  END IF;
  IF p_user_id IS NULL THEN
    IF v_challenge.format = 'collect' THEN RAISE EXCEPTION 'WRONG_FORMAT'; END IF;
    IF v_uid IS DISTINCT FROM v_leader THEN RAISE EXCEPTION 'NOT_LEADER'; END IF;
  ELSE
    IF v_challenge.format <> 'collect' THEN RAISE EXCEPTION 'WRONG_FORMAT'; END IF;
    IF p_user_id <> v_uid AND v_uid IS DISTINCT FROM v_leader THEN RAISE EXCEPTION 'NOT_LEADER'; END IF;
    IF NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = v_attempt.team_id AND user_id = p_user_id) THEN
      RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;
  END IF;

  IF now() < v_attempt.started_at THEN
    RAISE EXCEPTION 'NOT_STARTED';
  END IF;
  IF now() >= v_attempt.cap_at THEN
    RAISE EXCEPTION 'CAP_REACHED';
  END IF;

  v_time := round(EXTRACT(EPOCH FROM now() - v_attempt.started_at)::numeric, 1);
  -- Same floor as submit_weekly_score: at least 1 s per required rep.
  IF v_time < v_challenge.rounds * public.tc_round_reps(v_challenge.movements) THEN
    RAISE EXCEPTION 'TOO_FAST';
  END IF;

  BEGIN
    INSERT INTO team_attempt_results (attempt_id, is_team_row, user_id, time_sec, capped, score, entered_by)
    VALUES (p_attempt_id, p_user_id IS NULL, p_user_id, v_time, false, v_time, v_uid);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED';
  END;

  v_done := public.tc_finalize_attempt(p_attempt_id);
  RETURN QUERY SELECT v_time, v_done;
END;
$function$;

-- Rounds + reps entry: AMRAP results, or progress when For Time hit the cap.
-- p_user_id NULL = the whole team (sync/switch, leader); otherwise that
-- member (collect: themselves, or the leader filling in for them).
CREATE FUNCTION public.submit_team_progress(p_attempt_id uuid, p_user_id uuid,
  p_rounds integer, p_partial integer[])
RETURNS TABLE (score numeric, attempt_submitted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_attempt team_attempts%ROWTYPE;
  v_challenge team_challenges%ROWTYPE;
  v_leader uuid;
  v_required integer;
  v_done integer;
  v_score numeric;
  v_max numeric;
  v_finished boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  v_attempt := public.tc_lock_running_attempt(p_attempt_id);
  SELECT * INTO v_challenge FROM team_challenges WHERE id = v_attempt.challenge_id;
  v_leader := public.team_leader(v_attempt.team_id);

  IF p_user_id IS NULL THEN
    IF v_challenge.format = 'collect' THEN RAISE EXCEPTION 'WRONG_FORMAT'; END IF;
    IF v_uid IS DISTINCT FROM v_leader THEN RAISE EXCEPTION 'NOT_LEADER'; END IF;
  ELSE
    IF v_challenge.format <> 'collect' THEN RAISE EXCEPTION 'WRONG_FORMAT'; END IF;
    IF p_user_id <> v_uid AND v_uid IS DISTINCT FROM v_leader THEN RAISE EXCEPTION 'NOT_LEADER'; END IF;
    IF NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = v_attempt.team_id AND user_id = p_user_id) THEN
      RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;
  END IF;

  -- Only once the clock is out (2 s allowance for network delay).
  IF now() < v_attempt.cap_at - interval '2 seconds' THEN
    RAISE EXCEPTION 'TIME_NOT_UP';
  END IF;
  IF p_rounds IS NULL OR p_rounds < 0
     OR (p_partial IS NOT NULL AND COALESCE(array_length(p_partial, 1), 0) <> jsonb_array_length(v_challenge.movements)) THEN
    RAISE EXCEPTION 'INVALID_PROGRESS';
  END IF;

  IF v_challenge.scoring_type = 'time' THEN
    v_required := v_challenge.rounds * public.tc_round_reps(v_challenge.movements);
    v_done := LEAST(v_required,
      p_rounds * public.tc_round_reps(v_challenge.movements) + public.tc_partial_reps(v_challenge.movements, p_partial));
    -- Cap + 1 s per missing rep: a finished team always beats a capped one.
    v_score := v_challenge.time_limit_sec + (v_required - v_done);
  ELSE
    v_score := p_rounds * public.tc_round_points(v_challenge.movements)
             + public.tc_partial_points(v_challenge.movements, p_partial);
    -- Same ceiling as submit_weekly_score: 3 rounds a minute, plus one.
    v_max := public.tc_round_points(v_challenge.movements) * (v_challenge.time_limit_sec / 60.0 * 3 + 1);
    IF v_max > 0 AND v_score > v_max THEN
      RAISE EXCEPTION 'SCORE_TOO_HIGH';
    END IF;
  END IF;

  BEGIN
    INSERT INTO team_attempt_results (attempt_id, is_team_row, user_id, rounds, partial, capped, score, entered_by)
    VALUES (p_attempt_id, p_user_id IS NULL, p_user_id, p_rounds, p_partial,
            v_challenge.scoring_type = 'time', v_score, v_uid);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED';
  END;

  v_finished := public.tc_finalize_attempt(p_attempt_id);
  RETURN QUERY SELECT v_score, v_finished;
END;
$function$;

CREATE FUNCTION public.abandon_team_attempt(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt team_attempts%ROWTYPE;
  v_challenge team_challenges%ROWTYPE;
  v_leader uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  v_attempt := public.tc_lock_running_attempt(p_attempt_id);
  SELECT * INTO v_challenge FROM team_challenges WHERE id = v_attempt.challenge_id;
  v_leader := public.team_leader(v_attempt.team_id);
  IF auth.uid() IS DISTINCT FROM v_leader THEN
    RAISE EXCEPTION 'NOT_LEADER';
  END IF;
  UPDATE team_attempts SET status = 'abandoned' WHERE id = p_attempt_id;
END;
$function$;

-- ── Reads ─────────────────────────────────────────────────────────────────

-- Everything the lobby / attempt screens need, plus the server clock so
-- every phone shows the same timer.
CREATE FUNCTION public.get_team_state(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_team teams%ROWTYPE;
  v_leader uuid;
  v_attempt team_attempts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_team_member(p_team_id) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;
  PERFORM public.tc_expire_stale_attempts(p_team_id);

  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  v_leader := public.team_leader(p_team_id);
  SELECT * INTO v_attempt FROM team_attempts
  WHERE team_id = p_team_id ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'server_now', now(),
    'team', jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'invite_code', v_team.invite_code,
      'leader_id', v_leader, 'locked_at', v_team.locked_at,
      'best_score', v_team.best_score, 'best_attempt_id', v_team.best_attempt_id,
      'attempts_count', v_team.attempts_count),
    'challenge', (SELECT to_jsonb(c) - 'created_by' - 'started_notification_sent_at'
                  FROM team_challenges c WHERE c.id = v_team.challenge_id),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'display_name', p.display_name,
               'is_leader', m.user_id IS NOT DISTINCT FROM v_leader, 'joined_at', m.joined_at)
             ORDER BY m.joined_at, m.id)
      FROM team_members m LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.team_id = p_team_id), '[]'::jsonb),
    'attempt', CASE WHEN v_attempt.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_attempt.id, 'status', v_attempt.status, 'started_at', v_attempt.started_at,
      'cap_at', v_attempt.cap_at, 'score', v_attempt.score, 'capped', v_attempt.capped,
      'submitted_at', v_attempt.submitted_at,
      'results', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'user_id', r.user_id, 'is_team_row', r.is_team_row, 'time_sec', r.time_sec,
                 'rounds', r.rounds, 'partial', to_jsonb(r.partial), 'capped', r.capped,
                 'score', r.score, 'entered_by', r.entered_by) ORDER BY r.entered_at)
        FROM team_attempt_results r WHERE r.attempt_id = v_attempt.id), '[]'::jsonb))
    END
  );
END;
$function$;

-- Best attempt per team, ranked. Teams with no submitted attempt are hidden.
CREATE FUNCTION public.get_team_challenge_board(p_challenge_id uuid)
RETURNS TABLE (rank bigint, team_id uuid, team_name text, members jsonb, best_score numeric,
  attempts_count integer, best_submitted_at timestamptz, is_mine boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    row_number() OVER (ORDER BY
      CASE WHEN c.scoring_type = 'time' THEN t.best_score END ASC,
      CASE WHEN c.scoring_type = 'reps' THEN t.best_score END DESC,
      t.best_submitted_at ASC),
    t.id, t.name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name)
                ORDER BY m.joined_at, m.id)
              FROM team_members m LEFT JOIN profiles p ON p.id = m.user_id
              WHERE m.team_id = t.id), '[]'::jsonb),
    t.best_score, t.attempts_count, t.best_submitted_at,
    EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = auth.uid())
  FROM teams t
  JOIN team_challenges c ON c.id = t.challenge_id
  WHERE t.challenge_id = p_challenge_id
    AND t.best_score IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (c.is_active OR public.is_admin())
  ORDER BY 1;
$function$;

-- Team history for the caller: every team they're on, newest challenge first.
CREATE FUNCTION public.get_my_teams()
RETURNS TABLE (team_id uuid, team_name text, challenge_id uuid, challenge_title text,
  format text, scoring_type text, team_size smallint, starts_at timestamptz, ends_at timestamptz,
  members jsonb, is_leader boolean, locked_at timestamptz, best_score numeric,
  attempts_count integer, rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, c.id, c.title, c.format, c.scoring_type, c.team_size, c.starts_at, c.ends_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name)
                ORDER BY m.joined_at, m.id)
              FROM team_members m LEFT JOIN profiles p ON p.id = m.user_id
              WHERE m.team_id = t.id), '[]'::jsonb),
    public.team_leader(t.id) = auth.uid(),
    t.locked_at, t.best_score, t.attempts_count,
    CASE WHEN t.best_score IS NULL THEN NULL ELSE (
      SELECT count(*) + 1 FROM teams o
      WHERE o.challenge_id = t.challenge_id AND o.best_score IS NOT NULL AND o.id <> t.id
        AND (CASE WHEN c.scoring_type = 'time' THEN o.best_score < t.best_score ELSE o.best_score > t.best_score END
             OR (o.best_score = t.best_score AND o.best_submitted_at < t.best_submitted_at))
    ) END
  FROM team_members me
  JOIN teams t ON t.id = me.team_id
  JOIN team_challenges c ON c.id = t.challenge_id
  WHERE me.user_id = auth.uid()
  ORDER BY c.starts_at DESC, t.created_at DESC;
$function$;

-- ── Function privileges ───────────────────────────────────────────────────
-- Internal helpers: owner only (they run inside the definer functions above).
REVOKE EXECUTE ON FUNCTION public.tc_round_reps(jsonb), public.tc_round_points(jsonb),
  public.tc_partial_reps(jsonb, integer[]), public.tc_partial_points(jsonb, integer[]),
  public.team_leader(uuid), public.tc_finalize_attempt(uuid),
  public.tc_expire_stale_attempts(uuid), public.tc_lock_running_attempt(uuid)
  FROM PUBLIC, anon, authenticated;

-- is_team_member is used inside RLS policies, so authenticated must run it.
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION
  public.admin_upsert_team_challenge(uuid, text, text, text, text, jsonb, integer, integer, integer, timestamptz, timestamptz, boolean),
  public.admin_delete_team_challenge(uuid),
  public.admin_delete_team(uuid),
  public.admin_get_team_challenges(),
  public.admin_get_challenge_teams(uuid),
  public.create_team(uuid, text),
  public.join_team(text),
  public.leave_team(uuid, uuid),
  public.start_team_attempt(uuid),
  public.finish_team_attempt(uuid, uuid),
  public.submit_team_progress(uuid, uuid, integer, integer[]),
  public.abandon_team_attempt(uuid),
  public.get_team_state(uuid),
  public.get_team_challenge_board(uuid),
  public.get_my_teams()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_upsert_team_challenge(uuid, text, text, text, text, jsonb, integer, integer, integer, timestamptz, timestamptz, boolean),
  public.admin_delete_team_challenge(uuid),
  public.admin_delete_team(uuid),
  public.admin_get_team_challenges(),
  public.admin_get_challenge_teams(uuid),
  public.create_team(uuid, text),
  public.join_team(text),
  public.leave_team(uuid, uuid),
  public.start_team_attempt(uuid),
  public.finish_team_attempt(uuid, uuid),
  public.submit_team_progress(uuid, uuid, integer, integer[]),
  public.abandon_team_attempt(uuid),
  public.get_team_state(uuid),
  public.get_team_challenge_board(uuid),
  public.get_my_teams()
  TO authenticated, service_role;

-- ── Feature flag ──────────────────────────────────────────────────────────
-- Per-platform switch for the app's Team tab (admins always see it, so it
-- can be tested on prod before it's switched on). Read like paywall_enabled.
ALTER TABLE IF EXISTS public.app_config
  ADD COLUMN IF NOT EXISTS team_challenge_enabled boolean NOT NULL DEFAULT false;
