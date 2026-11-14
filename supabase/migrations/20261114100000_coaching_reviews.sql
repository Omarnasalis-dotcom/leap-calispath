-- Coaching reviews (owner-approved 2026-11-14, "make it simple"):
--   check-in  6 weeks after the package starts (packages of 7+ weeks):
--             mood (5 faces) + workload (too easy / just right / too hard)
--   final     in the package's last week: journey stars (1-5) + continue
--             (yes / take a break / no) + recommend to a friend (0-10)
--   both      optional comment.
-- The athlete gets a push with a Review button (and a Journey card for 14
-- days, one nudge after 3 days), once app_config.coaching_reviews_enabled
-- is on. The coach gets "wants to continue" and a
-- heads-up for 1-2 stars, a sad face, or 0-6 on recommend (via the hourly
-- coach reminders), and sees every answer in the admin panel.
-- Coach clients with a package only. One of each per package.

-- Off until the app build with the review screen is in the stores (the
-- live app can't open the push yet). Turn on with:
--   UPDATE public.app_config SET coaching_reviews_enabled = true;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS coaching_reviews_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.coaching_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.coaching_packages(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warrior_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('checkin', 'final')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  nudged_at timestamptz,
  answered_at timestamptz,
  mood smallint CHECK (mood BETWEEN 1 AND 5),
  workload text CHECK (workload IN ('easy', 'right', 'hard')),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  continue_choice text CHECK (continue_choice IN ('yes', 'break', 'no')),
  recommend smallint CHECK (recommend BETWEEN 0 AND 10),
  comment text CHECK (comment IS NULL OR length(comment) <= 1000),
  UNIQUE (package_id, kind)
);
CREATE INDEX IF NOT EXISTS coaching_reviews_warrior_idx ON public.coaching_reviews (warrior_id, sent_at DESC);
ALTER TABLE public.coaching_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coaching_reviews FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Asking: what the hourly job should send to athletes now. Creates the review
-- rows (or marks the nudge) unless p_dry_run. Moments: check-in from day 42
-- of the package (within a week of it), final from 7 days before the end
-- (until the end); a nudge 3 days after sending if unanswered. Only
-- 09:00-20:59 in the athlete's timezone, active coach programs only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coaching_reviews_due(p_dry_run boolean DEFAULT false)
RETURNS TABLE (review_id uuid, warrior_id uuid, kind text, nudge boolean, title text, body text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  r record;
  v_id uuid;
BEGIN
  -- Athletes are only asked once the switch is on (see app_config above).
  IF NOT EXISTS (SELECT 1 FROM app_config WHERE coaching_reviews_enabled) THEN
    RETURN;
  END IF;

  FOR r IN
    WITH cur AS (
      -- Each client's current package with the coach of their active program.
      SELECT DISTINCT ON (cp.coach_id, cp.warrior_id)
        cp.id AS package_id, cp.coach_id, cp.warrior_id, cp.starts_on, cp.ends_on,
        public.journey_points_tz(NULLIF(w.timezone, '')) AS tz,
        COALESCE(NULLIF(btrim(c.display_name), ''), 'your coach') AS coach_name
      FROM coaching_packages cp
      JOIN warrior_programs wp ON wp.warrior_id = cp.warrior_id AND wp.coach_id = cp.coach_id AND wp.status = 'active'
      JOIN profiles w ON w.id = cp.warrior_id
      JOIN profiles c ON c.id = cp.coach_id
      WHERE cp.cancelled_at IS NULL
        AND cp.coach_id NOT IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid)
      ORDER BY cp.coach_id, cp.warrior_id, cp.ends_on DESC, cp.created_at DESC
    ),
    due AS (
      SELECT cur.*, 'checkin'::text AS kind
      FROM cur
      WHERE cur.ends_on - cur.starts_on >= 49
        AND (now() AT TIME ZONE cur.tz)::date BETWEEN cur.starts_on + 42 AND cur.starts_on + 49
      UNION ALL
      SELECT cur.*, 'final'
      FROM cur
      WHERE (now() AT TIME ZONE cur.tz)::date BETWEEN cur.ends_on - 7 AND cur.ends_on
    )
    SELECT due.*
    FROM due
    WHERE EXTRACT(hour FROM now() AT TIME ZONE due.tz) BETWEEN 9 AND 20
      AND NOT EXISTS (SELECT 1 FROM coaching_reviews x WHERE x.package_id = due.package_id AND x.kind = due.kind)
  LOOP
    v_id := NULL;
    IF NOT p_dry_run THEN
      INSERT INTO coaching_reviews (package_id, coach_id, warrior_id, kind)
      VALUES (r.package_id, r.coach_id, r.warrior_id, r.kind)
      ON CONFLICT (package_id, kind) DO NOTHING
      RETURNING id INTO v_id;
      CONTINUE WHEN v_id IS NULL;
    END IF;
    review_id := v_id; warrior_id := r.warrior_id; kind := r.kind; nudge := false;
    title := CASE r.kind WHEN 'checkin' THEN 'Quick check-in' ELSE 'How was your journey?' END;
    body := CASE r.kind
      WHEN 'checkin' THEN '6 weeks in! Two taps to tell ' || r.coach_name || ' how it''s going.'
      ELSE 'Your coaching package ends ' || to_char(r.ends_on, 'FMDD Mon') || '. Three taps to tell ' || r.coach_name || ' how it went.'
    END;
    RETURN NEXT;
  END LOOP;

  -- One nudge, 3 days after asking, while it's still open (14 days).
  FOR r IN
    SELECT cr.id, cr.warrior_id, cr.kind,
      COALESCE(NULLIF(btrim(c.display_name), ''), 'your coach') AS coach_name
    FROM coaching_reviews cr
    JOIN profiles w ON w.id = cr.warrior_id
    JOIN profiles c ON c.id = cr.coach_id
    WHERE cr.answered_at IS NULL AND cr.nudged_at IS NULL
      AND cr.sent_at <= now() - interval '3 days'
      AND cr.sent_at > now() - interval '14 days'
      AND EXTRACT(hour FROM now() AT TIME ZONE public.journey_points_tz(NULLIF(w.timezone, ''))) BETWEEN 9 AND 20
  LOOP
    IF NOT p_dry_run THEN
      UPDATE coaching_reviews SET nudged_at = now() WHERE id = r.id AND nudged_at IS NULL;
      CONTINUE WHEN NOT FOUND;
    END IF;
    review_id := r.id; warrior_id := r.warrior_id; kind := r.kind; nudge := true;
    title := CASE r.kind WHEN 'checkin' THEN 'Quick check-in' ELSE 'How was your journey?' END;
    body := 'A few taps to tell ' || r.coach_name || ' how it''s going. It helps them coach you.';
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.coaching_reviews_due(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coaching_reviews_due(boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Athlete side (the app).
-- ---------------------------------------------------------------------------
-- The caller's open review (asked, not answered, under 14 days old), with
-- what the screen shows: coach name and, for the final one, a journey recap.
CREATE OR REPLACE FUNCTION public.get_my_coaching_review(p_review_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  SELECT cr.id, cr.kind, cr.sent_at, cr.answered_at, cp.starts_on, cp.ends_on,
    COALESCE(NULLIF(btrim(c.display_name), ''), 'Your coach') AS coach_name
  INTO v_row
  FROM coaching_reviews cr
  JOIN coaching_packages cp ON cp.id = cr.package_id
  JOIN profiles c ON c.id = cr.coach_id
  WHERE cr.warrior_id = v_uid
    AND (p_review_id IS NULL OR cr.id = p_review_id)
    AND cr.answered_at IS NULL
    AND cr.sent_at > now() - interval '14 days'
  ORDER BY cr.sent_at DESC
  LIMIT 1;
  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'kind', v_row.kind,
    'coach_name', v_row.coach_name,
    'ends_on', v_row.ends_on,
    'weeks', GREATEST(1, ((LEAST(current_date, v_row.ends_on) - v_row.starts_on) / 7)),
    'workouts', (
      SELECT count(DISTINCT wl.completed_at::date) FROM workout_logs wl
      WHERE wl.warrior_id = v_uid AND wl.completed_at::date >= v_row.starts_on
        AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%'));
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_coaching_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_coaching_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_coaching_review(
  p_review_id uuid,
  p_mood smallint DEFAULT NULL,
  p_workload text DEFAULT NULL,
  p_rating smallint DEFAULT NULL,
  p_continue text DEFAULT NULL,
  p_recommend smallint DEFAULT NULL,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
  v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  SELECT kind INTO v_kind FROM coaching_reviews
  WHERE id = p_review_id AND warrior_id = v_uid AND answered_at IS NULL AND sent_at > now() - interval '14 days'
  FOR UPDATE;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'REVIEW_NOT_OPEN' USING ERRCODE = 'P0002';
  END IF;
  IF length(v_comment) > 1000 THEN
    RAISE EXCEPTION 'COMMENT_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'checkin' THEN
    IF p_mood IS NULL OR p_mood NOT BETWEEN 1 AND 5 OR p_workload IS NULL OR p_workload NOT IN ('easy', 'right', 'hard') THEN
      RAISE EXCEPTION 'MISSING_ANSWERS' USING ERRCODE = '22023';
    END IF;
    UPDATE coaching_reviews SET mood = p_mood, workload = p_workload, comment = v_comment, answered_at = now()
    WHERE id = p_review_id;
  ELSE
    IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5
       OR p_continue IS NULL OR p_continue NOT IN ('yes', 'break', 'no')
       OR p_recommend IS NULL OR p_recommend NOT BETWEEN 0 AND 10 THEN
      RAISE EXCEPTION 'MISSING_ANSWERS' USING ERRCODE = '22023';
    END IF;
    UPDATE coaching_reviews
    SET rating = p_rating, continue_choice = p_continue, recommend = p_recommend, comment = v_comment, answered_at = now()
    WHERE id = p_review_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_coaching_review(uuid, smallint, text, smallint, text, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_coaching_review(uuid, smallint, text, smallint, text, smallint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Coach side (admin panel): a client's reviews with this coach.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coaching_reviews(p_coach_id uuid, p_warrior_id uuid)
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
      'id', cr.id, 'kind', cr.kind, 'package_id', cr.package_id, 'sent_at', cr.sent_at, 'answered_at', cr.answered_at,
      'mood', cr.mood, 'workload', cr.workload, 'rating', cr.rating, 'continue', cr.continue_choice,
      'recommend', cr.recommend, 'comment', cr.comment) ORDER BY cr.sent_at DESC)
    FROM coaching_reviews cr
    WHERE cr.coach_id = p_coach_id AND cr.warrior_id = p_warrior_id), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_coaching_reviews(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coaching_reviews(uuid, uuid) TO authenticated;

-- coach_client_state carries the latest answered review (dashboard chip).
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
  coach_tz text,
  review_kind text,
  review_mood smallint,
  review_workload text,
  review_rating smallint,
  review_continue text,
  review_recommend smallint,
  review_answered_at timestamptz
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
      pkg.id AS package_id, pkg.starts_on AS package_starts_on, pkg.ends_on AS package_ends_on, pkg.note AS package_note,
      rv.kind AS review_kind, rv.mood AS review_mood, rv.workload AS review_workload, rv.rating AS review_rating,
      rv.continue_choice AS review_continue, rv.recommend AS review_recommend, rv.answered_at AS review_answered_at
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
    -- The latest answered review in this package (for the dashboard chip).
    LEFT JOIN LATERAL (
      SELECT cr.kind, cr.mood, cr.workload, cr.rating, cr.continue_choice, cr.recommend, cr.answered_at
      FROM coaching_reviews cr
      WHERE cr.package_id = pkg.id AND cr.answered_at IS NOT NULL
      ORDER BY cr.answered_at DESC
      LIMIT 1
    ) rv ON true
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
      p.ctz, p.package_id, p.package_starts_on, p.package_ends_on, p.package_note,
      p.review_kind, p.review_mood, p.review_workload, p.review_rating, p.review_continue, p.review_recommend, p.review_answered_at
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
    r.ctz,
    r.review_kind, r.review_mood, r.review_workload, r.review_rating, r.review_continue, r.review_recommend, r.review_answered_at
  FROM r;
$$;

REVOKE ALL ON FUNCTION public.coach_client_state(uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_coach_reminders_due()
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
    -- so the old one's reminders stop. Keyed by the end date too, so a
    -- freeze (or an edit) that moves the end re-arms them for the new date. Moments start at midnight in the
    -- coach's timezone and go out from 09:00.
    SELECT s.*, 'pkg:' || s.package_id || ':' || s.package_ends_on || ':d14',
      (s.package_ends_on - 14)::timestamp AT TIME ZONE s.coach_tz,
      'package_14', 'Package ends in 2 weeks',
      s.who || '''s coaching package ends in 2 weeks (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL AND s.package_ends_on - 14 >= s.package_starts_on
    UNION ALL
    SELECT s.*, 'pkg:' || s.package_id || ':' || s.package_ends_on || ':d7',
      (s.package_ends_on - 7)::timestamp AT TIME ZONE s.coach_tz,
      'package_7', 'Package ends in 1 week',
      s.who || '''s coaching package ends in 1 week (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL AND s.package_ends_on - 7 >= s.package_starts_on
    UNION ALL
    SELECT s.*, 'pkg:' || s.package_id || ':' || s.package_ends_on || ':expired',
      s.package_ends_on::timestamp AT TIME ZONE s.coach_tz,
      'package_expired', 'Package expired',
      s.who || '''s coaching package expired today (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL
    UNION ALL
    -- The athlete answered "continue: yes" in their end-of-package review.
    SELECT s.*, 'review:' || cr.id || ':continue', cr.answered_at,
      'review_continue', 'Client wants to continue',
      s.who || ' wants to continue after this package'
        || CASE WHEN cr.rating IS NOT NULL THEN ' (rated it ' || cr.rating || '/5).' ELSE '.' END
    FROM s JOIN coaching_reviews cr ON cr.package_id = s.package_id
    WHERE cr.kind = 'final' AND cr.continue_choice = 'yes' AND cr.answered_at IS NOT NULL
    UNION ALL
    -- A review that needs a look: 1-2 stars, a sad face, or 0-6 on "recommend".
    SELECT s.*, 'review:' || cr.id || ':low', cr.answered_at,
      'review_low', CASE cr.kind WHEN 'checkin' THEN 'Check-in needs a look' ELSE 'Review needs a look' END,
      s.who || CASE cr.kind WHEN 'checkin' THEN '''s check-in: ' ELSE '''s review: ' END
        || concat_ws(', ',
             CASE WHEN cr.mood IS NOT NULL THEN 'feeling ' || (ARRAY['awful','not great','okay','good','great'])[cr.mood] END,
             CASE cr.workload WHEN 'easy' THEN 'workload too easy' WHEN 'hard' THEN 'workload too hard' END,
             CASE WHEN cr.rating IS NOT NULL THEN cr.rating || '/5 stars' END,
             CASE WHEN cr.recommend IS NOT NULL THEN 'recommend ' || cr.recommend || '/10' END,
             CASE cr.continue_choice WHEN 'break' THEN 'wants a break' WHEN 'no' THEN 'not continuing' END)
        || '.'
    FROM s JOIN coaching_reviews cr ON cr.package_id = s.package_id
    WHERE cr.answered_at IS NOT NULL
      AND (cr.mood <= 2 OR cr.rating <= 2 OR cr.recommend <= 6)
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
