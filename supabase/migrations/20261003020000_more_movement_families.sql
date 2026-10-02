-- Main movements: add deadlift, inverted row, push-up and pike push-up
-- (reps), extending 20261002090000.
--
-- Owner decisions (2026-10-03): ring rows count under inverted row
-- (variation "Rings"); incline push-ups count (variation "Incline");
-- scapula push-ups, knee push-ups, shoulder/toe-tap push-ups, inverted
-- row negatives/holds, seated/band rows, pike walk-outs/taps/sliding pike
-- ups and the inverted (balance) deadlift are left out.

ALTER TABLE public.exercise_library
  DROP CONSTRAINT IF EXISTS exercise_library_movement_family_check;
ALTER TABLE public.exercise_library
  ADD CONSTRAINT exercise_library_movement_family_check CHECK (
    movement_family IS NULL OR movement_family IN (
      'pull_up', 'inverted_row', 'dip', 'push_up', 'pike_push_up', 'squat', 'pistol_squat',
      'deadlift', 'muscle_up', 'handstand_push_up', 'front_lever_press',
      'front_lever', 'handstand', 'planche', 'back_lever'
    )
  );

UPDATE public.exercise_library el
SET movement_family = m.family,
    movement_variation = m.variation
FROM (VALUES
  -- Deadlift
  ('deadlift', 'deadlift', 'Conventional'),
  ('single leg deadlift', 'deadlift', 'Single leg'),
  -- Inverted row
  ('inverted row', 'inverted_row', 'Overhand'),
  ('inverted row (supinated grip)', 'inverted_row', 'Supinated'),
  ('inverted row wide grip', 'inverted_row', 'Wide grip'),
  ('inverted rows (narrow grip)', 'inverted_row', 'Narrow grip'),
  ('ring row', 'inverted_row', 'Rings'),
  ('ring row (supinated)', 'inverted_row', 'Rings, supinated'),
  ('ring row single arm', 'inverted_row', 'Rings, single arm'),
  -- Push-up
  ('push ups', 'push_up', 'Standard'),
  ('narrow push ups', 'push_up', 'Narrow'),
  ('push ups wide', 'push_up', 'Wide'),
  ('decline push ups', 'push_up', 'Decline'),
  ('decline dimond push ups', 'push_up', 'Decline diamond'),
  ('archer push ups', 'push_up', 'Archer'),
  ('single arm push ups', 'push_up', 'Single arm'),
  ('clap push ups', 'push_up', 'Clap'),
  ('ring push ups', 'push_up', 'Rings'),
  ('pesudo push ups', 'push_up', 'Pseudo planche'),
  ('pusedo planche push ups', 'push_up', 'Pseudo planche'),
  ('incline push ups', 'push_up', 'Incline'),
  ('incline dimond push ups', 'push_up', 'Incline diamond'),
  ('incline push ups parallet', 'push_up', 'Incline, parallettes'),
  -- Pike push-up
  ('pike push up', 'pike_push_up', 'Floor'),
  ('pike push ups', 'pike_push_up', 'Floor'),
  ('elvated pike push ups', 'pike_push_up', 'Elevated'),
  ('pike floating push ups', 'pike_push_up', 'Floating')
) AS m(name, family, variation)
WHERE lower(btrim(el.name)) = m.name
  AND el.movement_family IS NULL;

-- Same as 20261002090000 with the four new reps movements included.
CREATE OR REPLACE FUNCTION public._movement_reps_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH sets AS (
    SELECT el.movement_family AS family,
           COALESCE(el.movement_variation, '') AS variation,
           date_trunc('week', wl.completed_at)::date AS week_start,
           sl.reps_completed AS reps
    FROM workout_set_logs sl
    JOIN workout_logs wl ON wl.id = sl.workout_log_id
    JOIN exercise_library el ON el.id = sl.exercise_id
    WHERE wl.warrior_id = p_user_id
      AND sl.reps_completed > 0
      AND el.movement_family IN ('pull_up', 'inverted_row', 'dip', 'push_up', 'pike_push_up',
                                 'squat', 'pistol_squat', 'deadlift', 'muscle_up',
                                 'handstand_push_up', 'front_lever_press')
      AND wl.completed_at >= date_trunc('week', now()) - interval '25 weeks'
  ),
  by_var AS (
    SELECT family, week_start, variation, sum(reps) AS reps, max(reps) AS best
    FROM sets GROUP BY family, week_start, variation
  ),
  by_week AS (
    SELECT family, week_start,
           sum(reps) AS reps,
           max(best) AS best,
           jsonb_object_agg(variation, reps) AS variations
    FROM by_var GROUP BY family, week_start
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('family', f.family, 'weeks', f.weeks)), '[]'::jsonb)
  FROM (
    SELECT family,
           jsonb_agg(jsonb_build_object(
             'week_start', week_start,
             'reps', reps,
             'best', best,
             'variations', variations
           ) ORDER BY week_start) AS weeks
    FROM by_week GROUP BY family
  ) f;
$function$;

REVOKE EXECUTE ON FUNCTION public._movement_reps_for(uuid) FROM PUBLIC, anon, authenticated;
