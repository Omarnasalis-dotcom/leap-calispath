-- admin_get_user_performance: recover weighted sets whose exercise link
-- was nulled.
--
-- save_program_template rewrites a program's block_exercises on every edit,
-- and workout_set_logs.block_exercise_id is ON DELETE SET NULL, so any edit
-- after logging strips the link from the sets already logged (on prod
-- 2026-10-02, 18 of 21 weighted sets). The block itself survives, so when
-- the link is gone and the block now has exactly ONE weighted exercise,
-- attribute the set to it; with two or more weighted exercises it is
-- ambiguous and the set is skipped. Everything else is unchanged from
-- 20261002010000.

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
      SELECT DISTINCT ON (wl.id, ex.exercise_id)
             ex.exercise_id, wl.completed_at, pb.week_number,
             sl.weight_used, sl.reps_completed
      FROM workout_set_logs sl
      JOIN workout_logs wl ON wl.id = sl.workout_log_id
      LEFT JOIN block_exercises be ON be.id = sl.block_exercise_id
      LEFT JOIN LATERAL (
        SELECT (array_agg(b2.exercise_id))[1] AS exercise_id
        FROM block_exercises b2
        WHERE sl.block_exercise_id IS NULL
          AND b2.block_id = wl.block_id
          AND b2.is_weighted
        HAVING count(*) = 1
      ) fb ON true
      CROSS JOIN LATERAL (SELECT COALESCE(be.exercise_id, fb.exercise_id) AS exercise_id) ex
      LEFT JOIN program_blocks pb ON pb.id = wl.block_id
      WHERE wl.warrior_id = p_user_id
        AND sl.weight_used > 0
        AND ex.exercise_id IS NOT NULL
      ORDER BY wl.id, ex.exercise_id, sl.weight_used DESC, sl.reps_completed DESC NULLS LAST
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
