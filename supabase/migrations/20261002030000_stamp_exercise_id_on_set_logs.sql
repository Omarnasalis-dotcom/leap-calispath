-- Stamp the movement itself on every logged set.
--
-- workout_set_logs only pointed at a program slot (block_exercise_id), and
-- save_program_template deletes + reinserts a program's block_exercises on
-- every save, so ON DELETE SET NULL stripped the link from everything
-- logged before the edit (2,333 of 4,008 sets on prod, 2026-10-02). That
-- lost history for the coach progress screen, the AI Coach's logged
-- weights and the admin Performance charts.
--
-- 1. workout_set_logs.exercise_id -> exercise_library, which program
--    edits never touch.
-- 2. A BEFORE INSERT trigger fills it from the slot on every write path,
--    so old app builds need no change. It overwrites whatever the client
--    sent, and it can never fail the insert: any error leaves exercise_id
--    NULL and the set saves as before. On UPDATE it only runs when the
--    slot is set to a non-NULL value, so the FK's own SET NULL can't wipe
--    it.
-- 3. Backfill only where the slot link still exists. Sets already
--    unlinked stay NULL: nothing in the data says for certain which
--    movement they were, and a guess would put wrong numbers in front of
--    coaches and the AI Coach.
-- 4. Readers switch to exercise_id: admin_get_user_performance (this
--    also drops the 20261002020000 "block's only weighted exercise"
--    guess) and get_warrior_progress. The AI Coach Edge Function follows
--    as a separate deploy.
--
-- Rollback: DROP TRIGGER workout_set_logs_stamp_exercise ON
-- public.workout_set_logs; (and workout_set_logs_restamp_exercise)
-- restores today's logging exactly. The column is additive.

ALTER TABLE public.workout_set_logs
  ADD COLUMN IF NOT EXISTS exercise_id uuid
  REFERENCES public.exercise_library(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workout_set_logs_exercise_id_idx
  ON public.workout_set_logs (exercise_id);

-- SECURITY DEFINER: the lookup must not depend on whether the inserting
-- user can read block_exercises under RLS. It reads one column by id.
CREATE OR REPLACE FUNCTION public.workout_set_logs_stamp_exercise()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    NEW.exercise_id := (
      SELECT be.exercise_id FROM public.block_exercises be
      WHERE be.id = NEW.block_exercise_id
    );
  EXCEPTION WHEN OTHERS THEN
    NEW.exercise_id := NULL;
  END;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.workout_set_logs_stamp_exercise() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workout_set_logs_stamp_exercise ON public.workout_set_logs;
CREATE TRIGGER workout_set_logs_stamp_exercise
  BEFORE INSERT ON public.workout_set_logs
  FOR EACH ROW EXECUTE FUNCTION public.workout_set_logs_stamp_exercise();

DROP TRIGGER IF EXISTS workout_set_logs_restamp_exercise ON public.workout_set_logs;
CREATE TRIGGER workout_set_logs_restamp_exercise
  BEFORE UPDATE OF block_exercise_id ON public.workout_set_logs
  FOR EACH ROW
  WHEN (NEW.block_exercise_id IS NOT NULL)
  EXECUTE FUNCTION public.workout_set_logs_stamp_exercise();

-- 3. Backfill from surviving links only.
UPDATE public.workout_set_logs sl
SET exercise_id = be.exercise_id
FROM public.block_exercises be
WHERE be.id = sl.block_exercise_id
  AND sl.exercise_id IS NULL;

-- 4a. Admin Performance charts: weighted series reads exercise_id.
--     Otherwise unchanged from 20261002010000.
CREATE OR REPLACE FUNCTION public.admin_get_user_performance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_weighted jsonb;
  v_bodyweight jsonb;
  v_completion jsonb;
  v_worlds jsonb;
  v_first_world timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  -- 1. Weighted movements. Same-named library entries merge into one line.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('exercise', x.name, 'points', x.points)
                            ORDER BY x.name), '[]'::jsonb)
  INTO v_weighted
  FROM (
    SELECT el.name,
           jsonb_agg(jsonb_build_object(
             'date', s.completed_at,
             'week', s.week_number,
             'weight', s.weight_used,
             'reps', s.reps_completed
           ) ORDER BY s.completed_at) AS points
    FROM (
      SELECT DISTINCT ON (wl.id, sl.exercise_id)
             sl.exercise_id, wl.completed_at, pb.week_number,
             sl.weight_used, sl.reps_completed
      FROM workout_set_logs sl
      JOIN workout_logs wl ON wl.id = sl.workout_log_id
      LEFT JOIN program_blocks pb ON pb.id = wl.block_id
      WHERE wl.warrior_id = p_user_id
        AND sl.weight_used > 0
        AND sl.exercise_id IS NOT NULL
      ORDER BY wl.id, sl.exercise_id, sl.weight_used DESC, sl.reps_completed DESC NULLS LAST
    ) s
    JOIN exercise_library el ON el.id = s.exercise_id
    GROUP BY el.name
  ) x;

  -- 2. Bodyweight.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', logged_at, 'weight_kg', weight_kg)
                            ORDER BY logged_at), '[]'::jsonb)
  INTO v_bodyweight
  FROM bodyweight_logs
  WHERE warrior_id = p_user_id;

  -- 3. Block completion per program week, newest program first.
  SELECT COALESCE(jsonb_agg(p.prog ORDER BY p.assigned_at DESC), '[]'::jsonb)
  INTO v_completion
  FROM (
    SELECT wp.assigned_at,
           jsonb_build_object(
             'program_id', wp.id,
             'name', pt.name,
             'status', wp.status,
             'assigned_at', wp.assigned_at,
             'current_week', wp.current_week,
             'weeks', (
               SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'week', w.week_number,
                        'total', w.total,
                        'completed', w.completed,
                        'missed', w.missed
                      ) ORDER BY w.week_number), '[]'::jsonb)
               FROM (
                 SELECT b.week_number,
                        count(*) AS total,
                        count(*) FILTER (WHERE b.done) AS completed,
                        count(*) FILTER (WHERE NOT b.done AND b.skipped) AS missed
                 FROM (
                   SELECT COALESCE(pb.week_number, 1) AS week_number,
                          EXISTS (SELECT 1 FROM workout_logs wl
                                  WHERE wl.warrior_program_id = wp.id
                                    AND wl.block_id = pb.id
                                    AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%') AS done,
                          EXISTS (SELECT 1 FROM workout_logs wl
                                  WHERE wl.warrior_program_id = wp.id
                                    AND wl.block_id = pb.id
                                    AND wl.notes LIKE '[STATUS:MISSED]%') AS skipped
                   FROM program_blocks pb
                   WHERE pb.template_id = wp.template_id
                     AND COALESCE(pb.week_number, 1) <= wp.current_week
                 ) b
                 GROUP BY b.week_number
               ) w
             )
           ) AS prog
    FROM warrior_programs wp
    JOIN program_templates pt ON pt.id = wp.template_id
    WHERE wp.warrior_id = p_user_id
  ) p;

  -- 4. World scores per calendar week.
  SELECT LEAST(
    (SELECT min(logged_at) FROM static_holds WHERE user_id = p_user_id),
    (SELECT min(created_at) FROM one_min_max_logs WHERE user_id = p_user_id),
    (SELECT min(created_at) FROM power_assessment_log WHERE user_id = p_user_id)
  ) INTO v_first_world;

  IF v_first_world IS NULL THEN
    v_worlds := '[]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'week_start', wk.ws::date,
             'static', (
               SELECT COALESCE(sum(q.best), 0) FROM (
                 SELECT max(sh.points) AS best
                 FROM static_holds sh
                 JOIN static_movements sm ON sm.id = sh.movement_id
                 WHERE sh.user_id = p_user_id
                   AND sm.category IS NOT NULL
                   AND sh.logged_at < wk.ws + interval '1 week'
                 GROUP BY sm.category
               ) q
             ),
             'onemm', (
               SELECT COALESCE(sum(q.best), 0) FROM (
                 SELECT max(l.points) AS best
                 FROM one_min_max_logs l
                 JOIN onemm_movements om ON om.id = l.movement_id
                 WHERE l.user_id = p_user_id
                   AND NOT l.excluded_from_pb
                   AND l.created_at < wk.ws + interval '1 week'
                 GROUP BY om.pattern_id
               ) q
             ),
             'power', (
               SELECT COALESCE(max(pullup_1rm), 0) + COALESCE(max(dip_1rm), 0)
                    + COALESCE(max(squat_1rm), 0) + 2 * COALESCE(max(muscleup_1rm), 0)
               FROM power_assessment_log
               WHERE user_id = p_user_id
                 AND created_at < wk.ws + interval '1 week'
             )
           ) ORDER BY wk.ws), '[]'::jsonb)
    INTO v_worlds
    FROM generate_series(
      GREATEST(date_trunc('week', v_first_world), date_trunc('week', now()) - interval '25 weeks'),
      date_trunc('week', now()),
      interval '1 week'
    ) AS wk(ws);
  END IF;

  RETURN jsonb_build_object(
    'weighted', v_weighted,
    'bodyweight', v_bodyweight,
    'completion', v_completion,
    'worlds', v_worlds
  );
END;
$function$;

-- 4b. Coach progress / AI Coach self-read: exercise_name comes from
--     exercise_id. Otherwise unchanged from 20260821171000; the grants
--     from 20260927020000 are kept by CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.get_warrior_progress(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id uuid;
  v_warrior_id uuid;
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT coach_id, warrior_id INTO v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

  -- auth.uid() IS NULL must be checked explicitly: `NULL != v_coach_id` evaluates
  -- to NULL, and `IF NULL THEN` is falsy in plpgsql, so an unauthenticated/no-JWT
  -- caller would otherwise silently fall through this check instead of failing it.
  IF auth.uid() IS NULL OR (
    auth.uid() != v_coach_id
    AND auth.uid() != v_warrior_id
    AND NOT COALESCE(v_is_admin, false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this warrior''s progress';
  END IF;

  SELECT jsonb_build_object(
    'logs', COALESCE((
      SELECT jsonb_agg(log_row ORDER BY (log_row->>'completed_at')::timestamptz DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', wl.id,
          'block_id', wl.block_id,
          'block_name', pb.name,
          'week_number', pb.week_number,
          'completed_at', wl.completed_at,
          'notes', wl.notes,
          'rating', wl.rating,
          'feel', wl.feel,
          'rpe', wl.rpe,
          'missed_reason', wl.missed_reason,
          'missed_detail', wl.missed_detail,
          'session_seconds', wl.session_seconds,
          'status', CASE WHEN wl.notes LIKE '[STATUS:MISSED]%' THEN 'missed' ELSE 'completed' END,
          'sets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'set_index', wsl.set_index,
              'reps_completed', wsl.reps_completed,
              'weight_used', wsl.weight_used,
              'hold_seconds', wsl.hold_seconds,
              'exercise_name', el.name
            ) ORDER BY wsl.set_index)
            FROM public.workout_set_logs wsl
            LEFT JOIN public.exercise_library el ON el.id = wsl.exercise_id
            WHERE wsl.workout_log_id = wl.id
          ), '[]'::jsonb)
        ) AS log_row
        FROM public.workout_logs wl
        LEFT JOIN public.program_blocks pb ON pb.id = wl.block_id
        WHERE wl.warrior_program_id = p_warrior_program_id
      ) logs_sub
    ), '[]'::jsonb),
    'weekly_completion', COALESCE((
      SELECT jsonb_agg(week_row ORDER BY (week_row->>'week_start'))
      FROM (
        SELECT jsonb_build_object(
          'week_start', date_trunc('week', wl.completed_at),
          'total', count(*),
          'completed', count(*) FILTER (WHERE wl.notes NOT LIKE '[STATUS:MISSED]%'),
          'completion_pct', round(
            (count(*) FILTER (WHERE wl.notes NOT LIKE '[STATUS:MISSED]%'))::numeric
              / count(*) * 100
          )
        ) AS week_row
        FROM public.workout_logs wl
        WHERE wl.warrior_program_id = p_warrior_program_id
        GROUP BY date_trunc('week', wl.completed_at)
      ) weeks_sub
    ), '[]'::jsonb),
    'bodyweight_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('logged_at', bw.logged_at, 'weight_kg', bw.weight_kg))
      FROM (
        SELECT logged_at, weight_kg
        FROM public.bodyweight_logs
        WHERE warrior_id = v_warrior_id
        ORDER BY logged_at DESC
        LIMIT 12
      ) bw
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
