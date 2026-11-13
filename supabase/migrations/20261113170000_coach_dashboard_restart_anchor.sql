-- Coaching dashboard, owner-approved 2026-11-13:
-- 1. Commitment counts from when this run of the program began: the later of
--    the assign date, the last time weeks were archived (archive + restart,
--    e.g. Elhaddad after a month away), and the start of the first visible
--    week. Time before a restart no longer counts against the athlete.
-- 2. Overwrite always restarts the week clock (it resets to week 1; when the
--    client was already on week 1 the week number didn't change, so the old
--    start date stayed). The trigger now lets server functions set the start
--    on purpose; clients still can't.

CREATE OR REPLACE FUNCTION public.stamp_current_week_started()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.current_week_started_at := COALESCE(NEW.assigned_at, now());
  ELSIF NEW.current_week IS DISTINCT FROM OLD.current_week
     -- a closed/paused program switched back on starts its week again
     OR (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active') THEN
    NEW.current_week_started_at := now();
  ELSIF NEW.current_week_started_at IS DISTINCT FROM OLD.current_week_started_at
        AND current_user NOT IN ('authenticated', 'anon') THEN
    -- set on purpose by a server function (e.g. overwrite_client_program
    -- restarting week 1); a client can't write it directly.
    NULL;
  ELSE
    NEW.current_week_started_at := OLD.current_week_started_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.overwrite_client_program(p_warrior_program_id uuid, p_blocks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_coach_id uuid;
  v_is_admin boolean;
BEGIN
  SELECT template_id, coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() IS NULL OR (auth.uid() != v_coach_id AND NOT COALESCE(v_is_admin, false)) THEN
    RAISE EXCEPTION 'Not authorized to modify this client''s program';
  END IF;

  IF NOT COALESCE(v_is_admin, false) AND public.is_coaching_paused(v_coach_id) THEN
    RAISE EXCEPTION 'Coaching access is paused';
  END IF;

  DELETE FROM public.workout_logs WHERE warrior_program_id = p_warrior_program_id;
  DELETE FROM public.coach_week_notes WHERE warrior_program_id = p_warrior_program_id;
  DELETE FROM public.block_exercises
    WHERE block_id IN (SELECT id FROM public.program_blocks WHERE template_id = v_template_id);
  DELETE FROM public.program_blocks WHERE template_id = v_template_id;
  DELETE FROM public.program_week_archive WHERE template_id = v_template_id;

  PERFORM public._insert_client_program_blocks(v_template_id, 0, p_blocks);

  UPDATE public.warrior_programs
  SET current_week = 1,
      current_week_started_at = now()
  WHERE id = p_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.coach_client_state(p_ids uuid[])
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
  reason text
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
      (SELECT max(a.archived_at) FROM program_week_archive a WHERE a.template_id = wp.template_id) AS archived_at
    FROM warrior_programs wp
    JOIN profiles w ON w.id = wp.warrior_id
    LEFT JOIN profiles c ON c.id = wp.coach_id
    JOIN program_templates pt ON pt.id = wp.template_id
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
      p.tz, p.warrior_name, p.coach_name, p.template_name, p.archived_at
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
    r.reason
  FROM r;
$$;

REVOKE ALL ON FUNCTION public.coach_client_state(uuid[]) FROM PUBLIC, anon, authenticated;
