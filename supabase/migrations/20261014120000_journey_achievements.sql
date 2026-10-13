-- Journey achievements, step 1 (docs/features/JOURNEY_ACHIEVEMENTS_PLAN.md).
-- Owner decisions 2026-10-14: 8 achievements from LIFETIME Journey points,
-- never lost (even after a program switch or a same-day undo); each is
-- celebrated once, on any device; a community-only leaderboard ranks members
-- by points from the last 7 days. Existing users get the levels they have
-- already earned (one celebration: the highest).

-- Levels ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journey_levels (
  level      smallint PRIMARY KEY CHECK (level BETWEEN 1 AND 8),
  key        text NOT NULL UNIQUE,
  threshold  integer NOT NULL UNIQUE CHECK (threshold > 0)
);

INSERT INTO public.journey_levels (level, key, threshold) VALUES
  (1, 'rising', 100), (2, 'consistent', 300), (3, 'committed', 750), (4, 'determined', 1500),
  (5, 'warrior', 3000), (6, 'champion', 5000), (7, 'elite', 8000), (8, 'legend', 12000)
ON CONFLICT (level) DO UPDATE SET key = EXCLUDED.key, threshold = EXCLUDED.threshold;

ALTER TABLE public.journey_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone signed in reads journey levels" ON public.journey_levels;
CREATE POLICY "Anyone signed in reads journey levels" ON public.journey_levels
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.journey_levels FROM anon, authenticated;
GRANT SELECT ON public.journey_levels TO authenticated;

-- Reached / celebrated ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journey_achievements (
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level          smallint NOT NULL REFERENCES public.journey_levels(level),
  reached_at     timestamptz NOT NULL DEFAULT now(),
  celebrated_at  timestamptz,
  PRIMARY KEY (user_id, level)
);

ALTER TABLE public.journey_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Warriors read own achievements" ON public.journey_achievements;
CREATE POLICY "Warriors read own achievements" ON public.journey_achievements
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- Written only by the SECURITY DEFINER functions below.
REVOKE ALL ON public.journey_achievements FROM anon, authenticated;
GRANT SELECT ON public.journey_achievements TO authenticated;

-- Award: every level the lifetime ledger total has reached ------------------
CREATE OR REPLACE FUNCTION public.journey_achievements_award(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.journey_achievements (user_id, level)
  SELECT p_user, l.level
  FROM public.journey_levels l
  WHERE l.threshold <= (SELECT COALESCE(sum(points), 0) FROM public.journey_points WHERE user_id = p_user)
  ON CONFLICT (user_id, level) DO NOTHING;
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_achievements_award(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_achievements_award(uuid) TO service_role;

-- State for the summary --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.journey_achievement_state(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH life AS (
    SELECT COALESCE(sum(points), 0)::integer AS pts FROM public.journey_points WHERE user_id = p_user
  ), owned AS (
    SELECT COALESCE(max(level), 0) AS lvl FROM public.journey_achievements WHERE user_id = p_user
  ), pending AS (
    SELECT max(level) AS top, array_agg(level ORDER BY level) AS all_levels
    FROM public.journey_achievements WHERE user_id = p_user AND celebrated_at IS NULL
  ), last_celebrated AS (
    SELECT COALESCE(max(level), 0) AS lvl FROM public.journey_achievements
    WHERE user_id = p_user AND celebrated_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'level', (SELECT lvl FROM owned),
    'lifetime', (SELECT pts FROM life),
    'current_threshold', (SELECT threshold FROM public.journey_levels WHERE level = (SELECT lvl FROM owned)),
    'next_level', (SELECT min(level) FROM public.journey_levels WHERE level > (SELECT lvl FROM owned)),
    'next_threshold', (SELECT min(threshold) FROM public.journey_levels WHERE level > (SELECT lvl FROM owned)),
    'pending', CASE WHEN (SELECT top FROM pending) IS NULL THEN NULL ELSE jsonb_build_object(
      'level', (SELECT top FROM pending),
      -- Shown in the reveal as "the badge you had": the last celebrated one.
      'previous_level', (SELECT lvl FROM last_celebrated),
      'skipped', to_jsonb(COALESCE((SELECT array_remove(all_levels, top) FROM pending), ARRAY[]::smallint[]))
    ) END
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_achievement_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_achievement_state(uuid) TO service_role;

-- Celebrated: that level and every lower one, once, on any device ----------
CREATE OR REPLACE FUNCTION public.journey_mark_celebrated(p_level integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.journey_achievements
  SET celebrated_at = now()
  WHERE user_id = v_user AND level <= p_level AND celebrated_at IS NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_mark_celebrated(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journey_mark_celebrated(integer) TO authenticated, service_role;

-- Community leaderboard: the caller's community only, last 7 days ----------
-- Weekly points = every ledger row dated within that MEMBER's own last 7
-- local days (their profile time zone), so nobody's latest day is cut off
-- for viewers in another time zone. Members with 0
-- weekly points are not ranked; the caller is always returned. Ties go to
-- whoever reached their total first. Only username, badge level, weekly
-- points, rank and is_you leave the server: no ids, country, gender or email.
CREATE OR REPLACE FUNCTION public.get_journey_community_board(p_tz text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_community uuid;
  v_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.community_id, c.name INTO v_community, v_name
  FROM public.profiles p LEFT JOIN public.communities c ON c.id = p.community_id
  WHERE p.id = v_user;

  IF v_community IS NULL THEN
    RETURN jsonb_build_object('community', NULL, 'members', 0, 'rows', '[]'::jsonb);
  END IF;

  RETURN (
    WITH members AS (
      SELECT p.id, COALESCE(NULLIF(trim(p.display_name), ''), 'Warrior') AS username,
             -- The caller's own day comes from the app's time zone; everyone
             -- else's from their profile.
             (now() AT TIME ZONE public.journey_points_tz(CASE WHEN p.id = v_user THEN p_tz ELSE p.timezone END))::date AS today
      FROM public.profiles p WHERE p.community_id = v_community
    ), weekly AS (
      SELECT m.id, m.username,
             COALESCE(sum(jp.points), 0)::integer AS pts,
             max(jp.created_at) AS reached_at
      FROM members m
      LEFT JOIN public.journey_points jp
        ON jp.user_id = m.id AND jp.local_date BETWEEN m.today - 6 AND m.today
      GROUP BY m.id, m.username
    ), ranked AS (
      SELECT w.*,
             CASE WHEN w.pts > 0 THEN row_number() OVER (
               ORDER BY (w.pts > 0) DESC, w.pts DESC, w.reached_at ASC NULLS LAST, w.username) END AS rnk,
             -- Recorded levels are written when a member opens Journey; until
             -- then their lifetime total still shows the badge they've earned.
             GREATEST(
               (SELECT COALESCE(max(a.level), 0) FROM public.journey_achievements a WHERE a.user_id = w.id),
               (SELECT COALESCE(max(l.level), 0) FROM public.journey_levels l
                WHERE l.threshold <= (SELECT COALESCE(sum(points), 0) FROM public.journey_points WHERE user_id = w.id))
             ) AS badge
      FROM weekly w
    )
    SELECT jsonb_build_object(
      'community', v_name,
      'members', (SELECT count(*) FROM members),
      'rows', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'username', r.username, 'weekly_points', r.pts, 'rank', r.rnk,
                 'badge_level', r.badge, 'is_you', r.id = v_user)
               ORDER BY r.rnk NULLS LAST)
        FROM (SELECT * FROM ranked WHERE rnk IS NOT NULL AND rnk <= 100 OR id = v_user) r
      ), '[]'::jsonb)
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_journey_community_board(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_journey_community_board(text) TO authenticated, service_role;

-- Award hook (live definition + step 6) ----------------------------------------
CREATE OR REPLACE FUNCTION public.journey_points_award(p_user uuid, p_tz text, p_day_has_quest boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz      text := public.journey_points_tz(p_tz);
  v_today   date := (now() AT TIME ZONE v_tz)::date;
  v_current_week integer;
  v_slot    record;
  v_task    record;
  v_results integer;
  v_used    integer;
  v_is_trial boolean;
  v_cap     integer := public.journey_points_value('honor_daily_cap');
  v_paid    integer;
  v_pts     integer;
  v_run     date[];
  v_n       integer;
  v_m       integer;
  -- Points went live on this date; nothing earlier is paid retroactively.
  v_launch  constant date := date '2026-10-04';
BEGIN
  -- What today's lane card needs for Perfect day, kept so a later sync
  -- (another day, or one without the flag) can still judge today.
  IF p_day_has_quest IS NOT NULL THEN
    INSERT INTO public.journey_day_flags (user_id, local_date, has_quest)
    VALUES (p_user, v_today, p_day_has_quest)
    ON CONFLICT (user_id, local_date) DO UPDATE SET has_quest = EXCLUDED.has_quest;
  END IF;

  -- 1. Program days: fully logged, at least one block actually done.
  INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
  SELECT p_user, 'program_day', d.program_id || ':w' || d.wk || ':' || d.day_key,
         public.journey_points_value('program_day'),
         (d.finished_at AT TIME ZONE v_tz)::date, d.day_name
  FROM (
    SELECT wp.id AS program_id,
           COALESCE(pb.week_number, 1) AS wk,
           upper(trim(split_part(pb.name, ' | ', 1))) AS day_key,
           min(trim(split_part(pb.name, ' | ', 1))) AS day_name,
           count(*) AS n_blocks,
           count(l.finished_at) AS n_logged,
           count(*) FILTER (WHERE l.any_done) AS n_done,
           max(l.finished_at) AS finished_at
    FROM public.warrior_programs wp
    JOIN public.program_blocks pb ON pb.template_id = wp.template_id
    LEFT JOIN LATERAL (
      SELECT max(wl.completed_at) AS finished_at,
             bool_or(COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%') AS any_done
      FROM public.workout_logs wl
      WHERE wl.warrior_program_id = wp.id AND wl.block_id = pb.id
    ) l ON true
    WHERE wp.warrior_id = p_user
    GROUP BY 1, 2, 3
  ) d
  WHERE d.n_logged = d.n_blocks AND d.n_done > 0 AND d.finished_at IS NOT NULL
  ON CONFLICT (user_id, source, source_key) DO NOTHING;

  -- 2. Side quests and Strength Trials marked done on the Journey lane,
  --    each backed by a distinct real result since that program started.
  FOR v_slot IN
    SELECT s.warrior_program_id, s.slot_key, s.created_at, wp.assigned_at
    FROM public.journey_quest_slots s
    JOIN public.warrior_programs wp ON wp.id = s.warrior_program_id AND wp.warrior_id = p_user
    WHERE s.user_id = p_user AND s.status = 'done'
      -- Never a slot ahead of the week the program is actually on.
      AND substring(s.slot_key FROM '^w([0-9]+)_')::integer <= COALESCE(wp.current_week, 1)
      AND NOT EXISTS (
        SELECT 1 FROM public.journey_points jp
        WHERE jp.user_id = p_user AND jp.source IN ('side_quest', 'trial')
          AND jp.source_key = s.warrior_program_id || ':' || s.slot_key
      )
    ORDER BY s.created_at
  LOOP
    v_is_trial := v_slot.slot_key LIKE '%\_trial';
    IF v_is_trial THEN
      SELECT count(*) INTO v_results FROM public.trial_history
      WHERE user_id = p_user AND completed AND attempted_at >= v_slot.assigned_at;
    ELSE
      SELECT (SELECT count(*) FROM public.weekly_entries WHERE user_id = p_user AND created_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.one_min_max_logs WHERE user_id = p_user AND created_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.static_holds WHERE user_id = p_user AND created_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.power_assessments WHERE user_id = p_user AND assessed_at >= v_slot.assigned_at)
      INTO v_results;
    END IF;
    SELECT count(*) INTO v_used FROM public.journey_points
    WHERE user_id = p_user
      AND source = CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END
      AND source_key LIKE v_slot.warrior_program_id || ':%';
    IF v_used < v_results THEN
      -- label = the slot key, so "today's side quest" can be matched to
      -- the actual slot on today's card (not an old quest paid today).
      INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
      VALUES (p_user, CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END,
              v_slot.warrior_program_id || ':' || v_slot.slot_key,
              public.journey_points_value(CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END),
              (v_slot.created_at AT TIME ZONE v_tz)::date, v_slot.slot_key)
      ON CONFLICT (user_id, source, source_key) DO NOTHING;
    END IF;
  END LOOP;

  -- 3. Extras: every unpaid tick, book → run → meal, within that date's
  --    cap (owner decision 2026-10-04: they count at once, workout or not).
  FOR v_task IN
    SELECT t.local_date, t.task, t.amount
    FROM public.journey_daily_tasks t
    WHERE t.user_id = p_user
      AND NOT EXISTS (SELECT 1 FROM public.journey_points jp
                      WHERE jp.user_id = p_user AND jp.source = 'task_' || t.task AND jp.source_key = t.local_date::text)
    ORDER BY t.local_date, array_position(ARRAY['book', 'run', 'meal'], t.task)
  LOOP
    SELECT COALESCE(sum(points), 0) INTO v_paid FROM public.journey_points
    WHERE user_id = p_user AND source IN ('task_book', 'task_run', 'task_meal') AND local_date = v_task.local_date;
    v_pts := LEAST(public.journey_points_value('task_' || v_task.task), GREATEST(v_cap - v_paid, 0));
    INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
    VALUES (p_user, 'task_' || v_task.task, v_task.local_date::text, v_pts, v_task.local_date, v_task.amount::text)
    ON CONFLICT (user_id, source, source_key) DO NOTHING;
  END LOOP;

  -- 4. Perfect day, for every day since launch (not just today): Points
  --    only sync on the Journey tab, so a day finished in Train was lost if
  --    Journey wasn't reopened that day. A day needs its program day, all
  --    three extras and — when that day's card had one — a side quest paid
  --    that day (today: from the current week, so an old quest caught up
  --    today doesn't count).
  SELECT current_week INTO v_current_week FROM public.warrior_programs
  WHERE warrior_id = p_user AND status = 'active' ORDER BY assigned_at DESC LIMIT 1;
  INSERT INTO public.journey_points (user_id, source, source_key, points, local_date)
  SELECT p_user, 'perfect_day', pd.d::text, public.journey_points_value('perfect_day'), pd.d
  FROM (SELECT DISTINCT local_date AS d FROM public.journey_points
        WHERE user_id = p_user AND source = 'program_day' AND local_date BETWEEN v_launch AND v_today) pd
  WHERE (SELECT count(*) FROM public.journey_points
         WHERE user_id = p_user AND source IN ('task_book', 'task_run', 'task_meal') AND local_date = pd.d) = 3
    AND (NOT COALESCE((SELECT f.has_quest FROM public.journey_day_flags f
                       WHERE f.user_id = p_user AND f.local_date = pd.d), true)
         OR EXISTS (SELECT 1 FROM public.journey_points q
                    WHERE q.user_id = p_user AND q.source = 'side_quest' AND q.local_date = pd.d
                      AND (pd.d < v_today OR q.label LIKE 'w' || COALESCE(v_current_week, 1) || '\_%')))
  ON CONFLICT (user_id, source, source_key) DO NOTHING;

  -- 5. Streak ladder for every run since launch (3, 7, 14, then every 30):
  --    a milestone no longer has to be synced by the next day, and one in a
  --    run that has since broken is still paid. Runs break after more than 3
  --    days between program days (same rule as journey_points_current_run);
  --    the key (run start : count) matches the rows paid before this change.
  INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
  SELECT p_user, 'streak', n.run_start || ':' || n.m,
         public.journey_points_value(CASE WHEN n.m >= 30 THEN 'streak_30' ELSE 'streak_' || n.m END),
         n.local_date, n.m::text
  FROM (
    SELECT r.local_date,
           row_number() OVER (PARTITION BY r.run_id ORDER BY r.local_date) AS m,
           min(r.local_date) OVER (PARTITION BY r.run_id) AS run_start
    FROM (
      SELECT g.local_date, sum(g.brk) OVER (ORDER BY g.local_date) AS run_id
      FROM (
        SELECT d.local_date,
               CASE WHEN d.local_date - lag(d.local_date) OVER (ORDER BY d.local_date) <= 3 THEN 0 ELSE 1 END AS brk
        FROM (SELECT DISTINCT local_date FROM public.journey_points
              WHERE user_id = p_user AND source = 'program_day' AND local_date <= v_today) d
      ) g
    ) r
  ) n
  WHERE (n.m IN (3, 7, 14) OR (n.m >= 30 AND n.m % 30 = 0))
    AND n.local_date >= v_launch
  ON CONFLICT (user_id, source, source_key) DO NOTHING;

  -- 6. Achievements: record every level the lifetime total has reached
  --    (2026-10-14, docs/features/JOURNEY_ACHIEVEMENTS_PLAN.md).
  PERFORM public.journey_achievements_award(p_user);
END;
$function$
;

-- Summary (live definition + 'achievement') -------------------------------------
CREATE OR REPLACE FUNCTION public.journey_points_summary(p_user uuid, p_tz text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz     text := public.journey_points_tz(p_tz);
  v_today  date := (now() AT TIME ZONE v_tz)::date;
  v_run    date[] := public.journey_points_current_run(p_user, v_today);
BEGIN
  RETURN jsonb_build_object(
    'today', v_today,
    'total', (SELECT COALESCE(sum(points), 0) FROM public.journey_points_visible(p_user, v_tz)),
    'streak', coalesce(array_length(v_run, 1), 0),
    'best_streak', public.journey_points_best_run(p_user),
    'trained_today', EXISTS (SELECT 1 FROM public.journey_points
                             WHERE user_id = p_user AND source = 'program_day' AND local_date = v_today),
    'values', (SELECT jsonb_object_agg(key, value) FROM public.journey_points_config),
    'tasks_today', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'task', t.task, 'amount', t.amount,
               'paid', EXISTS (SELECT 1 FROM public.journey_points jp WHERE jp.user_id = p_user
                               AND jp.source = 'task_' || t.task AND jp.source_key = t.local_date::text))
             ORDER BY array_position(ARRAY['book', 'run', 'meal'], t.task))
      FROM public.journey_daily_tasks t WHERE t.user_id = p_user AND t.local_date = v_today), '[]'::jsonb),
    'week', (
      SELECT jsonb_agg(jsonb_build_object(
               'date', d::date,
               'points', (SELECT COALESCE(sum(points), 0) FROM public.journey_points_visible(p_user, v_tz) WHERE local_date = d::date),
               'trained', EXISTS (SELECT 1 FROM public.journey_points WHERE user_id = p_user AND source = 'program_day' AND local_date = d::date))
             ORDER BY d)
      FROM generate_series(v_today - 6, v_today, interval '1 day') d),
    -- Ledger for the history sheet: the last 7 local dates that have points.
    'recent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', local_date, 'source', source, 'label', label, 'points', points)
             ORDER BY local_date DESC, created_at, id)
      FROM public.journey_points_visible(p_user, v_tz)
      WHERE local_date IN (
        SELECT DISTINCT local_date FROM public.journey_points_visible(p_user, v_tz) ORDER BY local_date DESC LIMIT 7)), '[]'::jsonb),
    -- Achievements from LIFETIME points (never the current-program view):
    -- level owned, progress to the next one, and the highest level still to
    -- celebrate with the lower ones it skipped.
    'achievement', public.journey_achievement_state(p_user),
    -- Awarded by this very call (same transaction) — what the app animates.
    'new_awards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', source, 'label', label, 'points', points, 'date', local_date) ORDER BY id)
      FROM public.journey_points WHERE user_id = p_user AND created_at = now()), '[]'::jsonb)
  );
END;
$function$
;
