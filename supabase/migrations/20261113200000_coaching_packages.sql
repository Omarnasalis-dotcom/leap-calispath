-- Coaching packages (owner-approved 2026-11-13): the online coaching a client
-- pays their coach for directly, entered by the coach. Reminders go to the
-- coach only (2 weeks left, 1 week left, expiry day); an expired package is
-- only flagged, the program keeps running.
--
-- One row per paid period; a renewal is a new row (history kept), an edit
-- changes the row, removing one sets cancelled_at. The current package is the
-- latest-ending one that isn't cancelled. No direct table access: everything
-- goes through the functions below, scoped like the coaching dashboard
-- (the coach, the coach's assistants, admins).

CREATE TABLE IF NOT EXISTS public.coaching_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warrior_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT coaching_packages_dates CHECK (ends_on >= starts_on AND ends_on <= starts_on + 731),
  CONSTRAINT coaching_packages_note_len CHECK (note IS NULL OR length(note) <= 300)
);
CREATE INDEX IF NOT EXISTS coaching_packages_pair_idx ON public.coaching_packages (coach_id, warrior_id, ends_on DESC);
ALTER TABLE public.coaching_packages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coaching_packages FROM anon, authenticated;

-- Whether the caller may manage this coach's clients' packages.
CREATE OR REPLACE FUNCTION public.can_manage_coach_packages(p_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (public.is_admin() OR auth.uid() = p_coach_id OR public.is_assistant_for(p_coach_id));
$$;
REVOKE ALL ON FUNCTION public.can_manage_coach_packages(uuid) FROM PUBLIC, anon, authenticated;

-- Set a new package (or renewal), or edit one (p_package_id).
CREATE OR REPLACE FUNCTION public.set_coaching_package(
  p_coach_id uuid,
  p_warrior_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_note text DEFAULT NULL,
  p_package_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF NOT public.can_manage_coach_packages(p_coach_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() AND public.is_coaching_paused(p_coach_id) THEN
    RAISE EXCEPTION 'Coaching access is paused' USING ERRCODE = '42501';
  END IF;
  IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on OR p_ends_on > p_starts_on + 731 THEN
    RAISE EXCEPTION 'BAD_DATES' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) > 300 THEN
    RAISE EXCEPTION 'NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM warrior_programs
    WHERE warrior_id = p_warrior_id AND coach_id = p_coach_id AND status IS DISTINCT FROM 'deleted'
  ) THEN
    RAISE EXCEPTION 'NOT_YOUR_CLIENT' USING ERRCODE = '42501';
  END IF;

  IF p_package_id IS NOT NULL THEN
    UPDATE coaching_packages
    SET starts_on = p_starts_on, ends_on = p_ends_on, note = v_note, updated_at = now()
    WHERE id = p_package_id AND coach_id = p_coach_id AND warrior_id = p_warrior_id AND cancelled_at IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO coaching_packages (coach_id, warrior_id, starts_on, ends_on, note)
    VALUES (p_coach_id, p_warrior_id, p_starts_on, p_ends_on, v_note)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_coaching_package(uuid, uuid, date, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_coaching_package(uuid, uuid, date, date, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_coaching_package(p_package_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach uuid;
BEGIN
  SELECT coach_id INTO v_coach FROM coaching_packages WHERE id = p_package_id AND cancelled_at IS NULL;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_coach_packages(v_coach) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  UPDATE coaching_packages SET cancelled_at = now(), updated_at = now() WHERE id = p_package_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_coaching_package(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_coaching_package(uuid) TO authenticated;

-- A client's packages with one coach, newest first (history).
CREATE OR REPLACE FUNCTION public.get_coaching_packages(p_coach_id uuid, p_warrior_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_coach_packages(p_coach_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cp.id, 'starts_on', cp.starts_on, 'ends_on', cp.ends_on, 'note', cp.note, 'created_at', cp.created_at)
      ORDER BY cp.ends_on DESC, cp.created_at DESC)
    FROM coaching_packages cp
    WHERE cp.coach_id = p_coach_id AND cp.warrior_id = p_warrior_id AND cp.cancelled_at IS NULL), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_coaching_packages(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coaching_packages(uuid, uuid) TO authenticated;

-- Every current package the caller can see (Clients list column).
CREATE OR REPLACE FUNCTION public.get_current_coaching_packages()
RETURNS TABLE (coach_id uuid, warrior_id uuid, package_id uuid, starts_on date, ends_on date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (cp.coach_id, cp.warrior_id) cp.coach_id, cp.warrior_id, cp.id, cp.starts_on, cp.ends_on
  FROM coaching_packages cp
  WHERE cp.cancelled_at IS NULL
    AND auth.uid() IS NOT NULL
    AND (public.is_admin() OR cp.coach_id = auth.uid()
         OR cp.coach_id IN (SELECT ca.coach_id FROM coach_assistants ca WHERE ca.assistant_id = auth.uid()))
  ORDER BY cp.coach_id, cp.warrior_id, cp.ends_on DESC, cp.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_current_coaching_packages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_coaching_packages() TO authenticated;

-- coach_client_state gains the current package (new columns: drop + create;
-- nothing depends on it at the catalog level, the callers are recreated or
-- unchanged below).
DROP FUNCTION IF EXISTS public.coach_client_state(uuid[]);

CREATE FUNCTION public.coach_client_state(p_ids uuid[])
RETURNS TABLE (
  assignment_id uuid,
  warrior_id uuid,
  warrior_name text,
  coach_id uuid,
  coach_name text,
  template_id uuid,
  template_name text,
  assigned_at timestamptz,
  current_week integer,
  week_index integer,
  week_count integer,
  next_week integer,
  last_week integer,
  week_started_at timestamptz,
  day_no integer,
  days jsonb,
  days_per_week integer,
  days_logged integer,
  days_trained integer,
  blocks_total integer,
  blocks_logged integer,
  due integer,
  due_at timestamptz,
  week_finished boolean,
  finished_at timestamptz,
  last_log_at timestamptz,
  last_activity_at timestamptz,
  rpe_high integer,
  notes_count integer,
  missed_days integer,
  done_28d integer,
  commitment integer,
  weeks_streak integer,
  status text,
  reason text,
  package_id uuid,
  package_starts_on date,
  package_ends_on date,
  package_note text,
  package_days_left integer,
  coach_tz text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (
    SELECT wp.id, wp.warrior_id, wp.coach_id, wp.template_id, wp.assigned_at,
      COALESCE(wp.current_week, 1) AS cw,
      COALESCE(wp.current_week_started_at, wp.assigned_at, now()) AS started,
      public.journey_points_tz(NULLIF(w.timezone, '')) AS tz,
      btrim(w.display_name) AS warrior_name,
      btrim(c.display_name) AS coach_name,
      pt.name AS template_name,
      (SELECT max(a.archived_at) FROM program_week_archive a WHERE a.template_id = wp.template_id) AS archived_at,
      public.journey_points_tz(NULLIF(c.timezone, '')) AS ctz,
      pkg.id AS package_id, pkg.starts_on AS package_starts_on, pkg.ends_on AS package_ends_on, pkg.note AS package_note
    FROM warrior_programs wp
    JOIN profiles w ON w.id = wp.warrior_id
    LEFT JOIN profiles c ON c.id = wp.coach_id
    JOIN program_templates pt ON pt.id = wp.template_id
    -- The client's current coaching package with this coach: the latest one.
    LEFT JOIN LATERAL (
      SELECT cp.id, cp.starts_on, cp.ends_on, cp.note
      FROM coaching_packages cp
      WHERE cp.coach_id = wp.coach_id AND cp.warrior_id = wp.warrior_id AND cp.cancelled_at IS NULL
      ORDER BY cp.ends_on DESC, cp.created_at DESC
      LIMIT 1
    ) pkg ON true
    WHERE wp.id = ANY (p_ids)
  ),
  -- Real blocks (with exercises) of weeks the athlete can see.
  blk AS (
    SELECT pb.id, pb.template_id, COALESCE(pb.week_number, 1) AS wk,
      btrim(split_part(COALESCE(pb.name, ''), '|', 1)) AS day, pb.order_index
    FROM program_blocks pb
    WHERE pb.template_id IN (SELECT p.template_id FROM p)
      AND EXISTS (SELECT 1 FROM block_exercises be WHERE be.block_id = pb.id)
      AND NOT EXISTS (
        SELECT 1 FROM program_week_archive a
        WHERE a.template_id = pb.template_id AND a.week_number = COALESCE(pb.week_number, 1))
  ),
  -- The latest log of each block.
  lg AS (
    SELECT DISTINCT ON (wl.warrior_program_id, wl.block_id)
      wl.warrior_program_id AS pid, wl.block_id, wl.completed_at, wl.rpe, wl.notes,
      COALESCE(wl.notes, '') LIKE '[STATUS:MISSED]%' AS missed
    FROM workout_logs wl
    WHERE wl.warrior_program_id = ANY (p_ids) AND wl.block_id IS NOT NULL
    ORDER BY wl.warrior_program_id, wl.block_id, wl.completed_at DESC
  ),
  -- Every training day of every week.
  dd AS (
    SELECT p.id AS pid, b.wk, b.day, min(b.order_index) AS ord,
      count(*)::int AS blocks,
      count(l.block_id)::int AS logged,
      count(l.block_id) FILTER (WHERE NOT l.missed)::int AS completed,
      max(l.completed_at) AS last_at,
      min(l.completed_at) FILTER (WHERE NOT l.missed) AS first_done_at,
      count(l.block_id) FILTER (WHERE NOT l.missed AND l.rpe >= 9)::int AS rpe_high,
      -- Athlete's own words: what's left after the app's "[LOG] …" lines.
      count(l.block_id) FILTER (
        WHERE NOT l.missed
          AND btrim(regexp_replace(COALESCE(l.notes, ''), '^\[.*$', '', 'gn'), E' \n\r\t') <> ''
      )::int AS notes
    FROM p
    JOIN blk b ON b.template_id = p.template_id
    LEFT JOIN lg l ON l.pid = p.id AND l.block_id = b.id
    GROUP BY p.id, b.wk, b.day
  ),
  wk AS (
    SELECT pid, wk, count(*)::int AS ndays,
      count(*) FILTER (WHERE logged > 0)::int AS days_logged,
      count(*) FILTER (WHERE completed > 0)::int AS days_trained,
      sum(blocks)::int AS blocks, sum(logged)::int AS logged,
      max(last_at) AS last_at
    FROM dd
    GROUP BY pid, wk
  ),
  weeks AS (
    SELECT pid, array_agg(wk ORDER BY wk) AS nums, round(avg(ndays))::int AS avg_days
    FROM wk GROUP BY pid
  ),
  -- The week the athlete actually sees, the same way the app picks it
  -- (WarriorProgramScreen): current_week, or the last built week when
  -- current_week isn't built; and when that week is fully logged, the first
  -- later week with something left (else the last week).
  eff AS (
    SELECT p.id AS pid,
      CASE
        WHEN bd.base IS NULL THEN p.cw
        WHEN bd.done THEN COALESCE(
          (SELECT min(w2.wk) FROM wk w2 WHERE w2.pid = p.id AND w2.wk > bd.base AND w2.logged < w2.blocks),
          (SELECT max(w2.wk) FROM wk w2 WHERE w2.pid = p.id AND w2.wk > bd.base),
          bd.base)
        ELSE bd.base
      END AS ew
    FROM p
    LEFT JOIN LATERAL (
      SELECT b0.base,
        COALESCE((SELECT w1.logged >= w1.blocks FROM wk w1 WHERE w1.pid = p.id AND w1.wk = b0.base), false) AS done
      FROM (
        SELECT CASE WHEN p.cw = ANY (w.nums) THEN p.cw ELSE (SELECT max(x) FROM unnest(w.nums) x) END AS base
        FROM weeks w WHERE w.pid = p.id
      ) b0
    ) bd ON true
  ),
  -- p, with the week the athlete sees as cw. Its start: the recorded start
  -- when it's current_week itself, else its first logged workout, else when
  -- the week before was last logged.
  pe AS (
    SELECT p.id, p.warrior_id, p.coach_id, p.template_id, p.assigned_at,
      e.ew AS cw,
      CASE WHEN e.ew = p.cw THEN p.started ELSE COALESCE(
        (SELECT min(l.completed_at) FROM lg l JOIN blk b ON b.id = l.block_id WHERE l.pid = p.id AND b.wk = e.ew),
        (SELECT max(l.completed_at) FROM lg l JOIN blk b ON b.id = l.block_id WHERE l.pid = p.id AND b.wk < e.ew),
        p.started) END AS started,
      p.tz, p.warrior_name, p.coach_name, p.template_name, p.archived_at,
      p.ctz, p.package_id, p.package_starts_on, p.package_ends_on, p.package_note
    FROM p JOIN eff e ON e.pid = p.id
  ),
  -- Weeks finished in a row (every day trained), counting back from the
  -- current week when it's done, else from the week before.
  streak AS (
    SELECT x.pid, count(*)::int AS n
    FROM (
      SELECT w.pid,
        bool_and(w.days_trained = w.ndays) OVER (
          PARTITION BY w.pid ORDER BY w.wk DESC ROWS UNBOUNDED PRECEDING) AS run
      FROM wk w JOIN pe p ON p.id = w.pid
      WHERE w.wk < p.cw OR (w.wk = p.cw AND w.days_trained = w.ndays)
    ) x
    WHERE x.run
    GROUP BY x.pid
  ),
  s AS (
    SELECT p.*,
      COALESCE(cur.ndays, 0) AS n,
      COALESCE(cur.days_logged, 0) AS days_logged,
      COALESCE(cur.days_trained, 0) AS days_trained,
      COALESCE(cur.blocks, 0) AS blocks,
      COALESCE(cur.logged, 0) AS logged,
      cur.last_at AS week_last_at,
      w.nums, w.avg_days,
      (SELECT max(l.completed_at) FROM lg l WHERE l.pid = p.id) AS last_log_at,
      (p.started AT TIME ZONE p.tz)::date AS start_date,
      ((now() AT TIME ZONE p.tz)::date - (p.started AT TIME ZONE p.tz)::date) + 1 AS day_no
    FROM pe p
    LEFT JOIN wk cur ON cur.pid = p.id AND cur.wk = p.cw
    LEFT JOIN weeks w ON w.pid = p.id
  ),
  c AS (
    SELECT s.*,
      (s.n > 0 AND s.logged = s.blocks) AS fin_strict,
      COALESCE(s.n > 0 AND s.days_logged = s.n AND s.week_last_at < now() - interval '24 hours', false) AS fin_soft,
      (SELECT min(x) FROM unnest(s.nums) x WHERE x > s.cw) AS next_wk,
      (SELECT max(x) FROM unnest(s.nums) x) AS last_wk,
      CASE WHEN s.n > 0
        THEN (SELECT count(*)::int FROM generate_series(1, s.n) k WHERE ceil(k * 7.0 / s.n) < s.day_no)
        ELSE 0 END AS due,
      GREATEST(COALESCE(s.last_log_at, s.started), s.started) AS last_activity
    FROM s
  ),
  f AS (
    SELECT c.*,
      (c.fin_strict OR c.fin_soft) AS finished,
      CASE WHEN c.fin_strict THEN c.week_last_at
           WHEN c.fin_soft THEN c.week_last_at + interval '24 hours' END AS fin_at
    FROM c
  ),
  r AS (
    SELECT f.*,
      GREATEST(f.assigned_at, COALESCE(f.archived_at, f.assigned_at),
        CASE WHEN array_position(f.nums, f.cw) = 1 THEN f.started END) AS anchor,
      CASE
        -- 14 days with nothing logged trumps everything: they've gone quiet.
        WHEN f.last_activity < now() - interval '14 days' THEN 'quiet'
        WHEN f.n = 0 THEN 'week_missing'
        WHEN f.finished AND f.next_wk IS NULL THEN 'week_finished'
        WHEN f.finished AND f.fin_at < now() - interval '3 days' THEN 'not_moved_on'
        WHEN f.finished THEN 'week_done'
        WHEN f.last_log_at IS NULL AND f.due >= 1 THEN 'not_started'
        -- Past the week's 7 days and not finished, whatever was logged.
        WHEN f.day_no > 7 THEN 'overdue'
        WHEN f.days_logged < f.due THEN 'behind'
        ELSE 'on_track'
      END AS reason
    FROM f
  )
  SELECT
    r.id, r.warrior_id, r.warrior_name, r.coach_id, r.coach_name,
    r.template_id, r.template_name, r.assigned_at,
    r.cw, array_position(r.nums, r.cw), COALESCE(array_length(r.nums, 1), 0),
    r.next_wk, r.last_wk,
    r.started, r.day_no,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day', d.day, 'blocks', d.blocks, 'logged', d.logged,
        'completed', d.completed, 'last_at', d.last_at) ORDER BY d.ord)
      FROM dd d WHERE d.pid = r.id AND d.wk = r.cw), '[]'::jsonb),
    r.n, r.days_logged, r.days_trained, r.blocks, r.logged,
    r.due,
    CASE WHEN r.n > 0 AND r.due > 0
      THEN ((r.start_date + ceil(r.due * 7.0 / r.n)::int)::timestamp AT TIME ZONE r.tz) END,
    r.finished, r.fin_at,
    r.last_log_at, r.last_activity,
    COALESCE((SELECT sum(d.rpe_high)::int FROM dd d WHERE d.pid = r.id AND d.wk = r.cw), 0),
    COALESCE((SELECT sum(d.notes)::int FROM dd d WHERE d.pid = r.id AND d.wk = r.cw), 0),
    COALESCE((SELECT count(*)::int FROM dd d WHERE d.pid = r.id AND d.wk = r.cw AND d.logged > 0 AND d.completed = 0), 0),
    COALESCE((SELECT count(*)::int FROM dd d WHERE d.pid = r.id AND d.first_done_at > now() - interval '28 days'), 0),
    -- Commitment: training days done in the last 28 days against what the
    -- program asks for in that time. New programs (under 7 days) aren't rated.
    -- Counted from when this run of the program began (anchor): a restart
    -- after archiving, or a fresh week 1, isn't charged for the time before.
    CASE WHEN r.anchor > now() - interval '7 days' OR COALESCE(r.avg_days, 0) = 0 THEN NULL
      ELSE LEAST(100, round(100.0 *
        (SELECT count(*) FROM dd d WHERE d.pid = r.id
           AND d.first_done_at > GREATEST(now() - interval '28 days', r.anchor))
        / (r.avg_days * LEAST(28.0, EXTRACT(epoch FROM now() - r.anchor) / 86400.0) / 7.0)))::int
    END,
    COALESCE((SELECT st.n FROM streak st WHERE st.pid = r.id), 0),
    CASE r.reason
      WHEN 'week_missing' THEN 'waiting'
      WHEN 'week_finished' THEN 'waiting'
      WHEN 'quiet' THEN 'quiet'
      WHEN 'not_moved_on' THEN 'behind'
      WHEN 'week_done' THEN 'week_done'
      WHEN 'not_started' THEN 'not_started'
      WHEN 'overdue' THEN 'behind'
      WHEN 'behind' THEN 'behind'
      ELSE 'on_track'
    END,
    r.reason,
    r.package_id, r.package_starts_on, r.package_ends_on, r.package_note,
    r.package_ends_on - (now() AT TIME ZONE r.ctz)::date,
    r.ctz
  FROM r;
$$;

REVOKE ALL ON FUNCTION public.coach_client_state(uuid[]) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.get_coach_reminders_due();
CREATE FUNCTION public.get_coach_reminders_due()
RETURNS TABLE (
  warrior_program_id uuid,
  warrior_id uuid,
  coach_id uuid,
  reminder_key text,
  kind text,
  title text,
  body text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT st.*, COALESCE(NULLIF(st.warrior_name, ''), 'Your client') AS who
    FROM public.coach_client_state(COALESCE((
      SELECT array_agg(wp.id) FROM warrior_programs wp
      WHERE wp.status = 'active'
        AND wp.coach_id NOT IN ('00000000-0000-0000-0000-000000000001'::uuid,
                                '00000000-0000-0000-0000-000000000002'::uuid)
        AND wp.coach_id <> wp.warrior_id), '{}'::uuid[])) st
  ),
  cand AS (
    -- Week finished and the next week isn't built: right away.
    SELECT s.*, s.assignment_id || ':w' || s.current_week AS k, s.finished_at AS ev,
      'week_finished' AS kind, 'Week finished: add a new week' AS t,
      s.who || ' finished week ' || s.current_week || '. Week ' || (s.current_week + 1) || ' isn''t built yet.' AS b
    FROM s WHERE s.reason = 'week_finished'
    UNION ALL
    -- …and still not built a day later.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':waiting', s.finished_at + interval '24 hours',
      'still_waiting', 'Still waiting on a new week',
      s.who || ' finished week ' || s.current_week || ' a day ago. Week ' || (s.current_week + 1) || ' isn''t built yet.'
    FROM s WHERE s.reason = 'week_finished'
    UNION ALL
    -- On a week that has no workouts.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':missing', s.week_started_at,
      'week_missing', 'Client has no workouts',
      s.who || ' is on week ' || s.current_week || ', which isn''t built yet.'
    FROM s WHERE s.reason = 'week_missing'
    UNION ALL
    -- Missed a pace checkpoint: one per checkpoint.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':due' || s.due, s.due_at,
      CASE WHEN s.reason = 'not_started' THEN 'not_started' ELSE 'behind' END,
      CASE WHEN s.reason = 'not_started' THEN 'Client hasn''t started' ELSE 'Client is behind' END,
      CASE WHEN s.reason = 'not_started'
        THEN s.who || ' hasn''t logged a workout yet (' || s.days_per_week || ' days a week, day ' || s.day_no || ').'
        ELSE s.who || ' is behind: ' || s.days_logged || ' of ' || s.days_per_week || ' workouts done, day '
             || LEAST(s.day_no, 7) || ' of week ' || s.current_week || '.' END
    FROM s WHERE s.reason IN ('behind', 'overdue', 'not_started') AND s.due > 0 AND s.days_logged < s.due
    UNION ALL
    -- Past the week's 7 days and still not done: every 3 days after that.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':over' || ((s.day_no - 8) / 3),
      ((s.week_started_at AT TIME ZONE public.journey_points_tz(NULLIF(w.timezone, '')))::date
        + 7 + 3 * ((s.day_no - 8) / 3))::timestamp AT TIME ZONE public.journey_points_tz(NULLIF(w.timezone, '')),
      'overdue', 'Week running late',
      s.who || ' is ' || (s.day_no - 7) || ' days past week ' || s.current_week || ': '
        || CASE WHEN s.days_logged >= s.days_per_week
             THEN 'all ' || s.days_per_week || ' days trained, ' || (s.blocks_total - s.blocks_logged)
                  || CASE WHEN s.blocks_total - s.blocks_logged = 1 THEN ' block' ELSE ' blocks' END || ' not logged.'
             ELSE s.days_logged || ' of ' || s.days_per_week || ' workouts done.' END
    FROM s JOIN profiles w ON w.id = s.warrior_id
    WHERE s.reason IN ('overdue', 'not_started') AND s.day_no >= 11
    UNION ALL
    -- Finished, the next week is ready, but not started 3 days later.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':nomove', s.finished_at + interval '3 days',
      'not_moved_on', 'Client hasn''t moved on',
      s.who || ' finished week ' || s.current_week || ' 3 days ago and hasn''t started week ' || s.next_week || '.'
    FROM s WHERE s.reason = 'not_moved_on'
    UNION ALL
    -- 14 days without training: once per quiet spell.
    SELECT s.*, s.assignment_id || ':quiet:' || to_char(s.last_activity_at, 'YYYYMMDD'),
      s.last_activity_at + interval '14 days',
      'quiet', 'Client gone quiet',
      s.who || ' hasn''t trained for 14 days.'
    FROM s WHERE s.reason = 'quiet'
    UNION ALL
    -- Coaching package (set by the coach): 2 weeks left, 1 week left, and
    -- the day it expires. Only the current package; a renewal replaces it,
    -- so the old one's reminders stop. Moments start at midnight in the
    -- coach's timezone and go out from 09:00.
    SELECT s.*, 'pkg:' || s.package_id || ':d14',
      (s.package_ends_on - 14)::timestamp AT TIME ZONE s.coach_tz,
      'package_14', 'Package ends in 2 weeks',
      s.who || '''s coaching package ends in 2 weeks (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL AND s.package_ends_on - 14 >= s.package_starts_on
    UNION ALL
    SELECT s.*, 'pkg:' || s.package_id || ':d7',
      (s.package_ends_on - 7)::timestamp AT TIME ZONE s.coach_tz,
      'package_7', 'Package ends in 1 week',
      s.who || '''s coaching package ends in 1 week (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL AND s.package_ends_on - 7 >= s.package_starts_on
    UNION ALL
    SELECT s.*, 'pkg:' || s.package_id || ':expired',
      s.package_ends_on::timestamp AT TIME ZONE s.coach_tz,
      'package_expired', 'Package expired',
      s.who || '''s coaching package expired today (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL
  )
  SELECT c.assignment_id, c.warrior_id, c.coach_id, c.k, c.kind, c.t, c.b
  FROM cand c
  JOIN profiles coach ON coach.id = c.coach_id
  WHERE c.ev IS NOT NULL
    AND c.ev <= now()
    AND c.ev > now() - interval '2 days'
    AND EXTRACT(hour FROM now() AT TIME ZONE public.journey_points_tz(NULLIF(coach.timezone, ''))) BETWEEN 9 AND 20
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = c.coach_id
        AND n.type IN ('client_needs_attention', 'client_week_complete')
        AND n.data->>'key' = c.k);
$$;

REVOKE ALL ON FUNCTION public.get_coach_reminders_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_reminders_due() TO service_role;
