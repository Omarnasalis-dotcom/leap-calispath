-- Main movements: tag library exercises with the movement they train, and
-- chart weekly reps per movement ("Main movements" in the admin panel and
-- the app's My progress).
--
-- exercise_library.movement_family — one of the main movements below;
--   NULL = not part of these charts.
-- exercise_library.movement_variation — the version done (e.g. "Tuck",
--   "Chin-up"), shown in the chart's legend and tooltip.
--
-- Reps movements:  pull_up · dip · squat · pistol_squat · muscle_up ·
--                  handstand_push_up · front_lever_press
-- Hold movements:  front_lever · handstand · planche · back_lever
--   (tagged now; their chart needs hold seconds, logged from a later app
--   build)
--
-- Owner decisions (2026-10-02): assisted versions (banded, negative, jump,
-- assisted pistol, box/triceps dips) and skill negatives are left out;
-- muscle-up = strict Muscle Up only; squat and pistol squat are separate;
-- Side Plank Dips, Triceps Dips, "1 Pull Up 1 Muscle Up" and front lever
-- pull ups are left out. The backfill matches exact names; anything else is
-- tagged by hand in the admin Exercise library page.

ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS movement_family text,
  ADD COLUMN IF NOT EXISTS movement_variation text;

ALTER TABLE public.exercise_library
  DROP CONSTRAINT IF EXISTS exercise_library_movement_family_check;
ALTER TABLE public.exercise_library
  ADD CONSTRAINT exercise_library_movement_family_check CHECK (
    movement_family IS NULL OR movement_family IN (
      'pull_up', 'dip', 'squat', 'pistol_squat', 'muscle_up', 'handstand_push_up',
      'front_lever_press', 'front_lever', 'handstand', 'planche', 'back_lever'
    )
  );

UPDATE public.exercise_library el
SET movement_family = m.family,
    movement_variation = m.variation
FROM (VALUES
  -- Pull-up
  ('pull ups (normal grip)', 'pull_up', 'Normal grip'),
  ('pull ups (normal grip ) #bodyweightexercises', 'pull_up', 'Normal grip'),
  ('high pull ups', 'pull_up', 'High'),
  ('high pull up', 'pull_up', 'High'),
  ('chin ups', 'pull_up', 'Chin-up'),
  ('pull ups (wide grip)', 'pull_up', 'Wide grip'),
  ('pull ups ( narrow grip)', 'pull_up', 'Narrow grip'),
  ('pull ups (single arm)', 'pull_up', 'Single arm'),
  ('archer pull ups', 'pull_up', 'Archer'),
  ('commando pull ups', 'pull_up', 'Commando'),
  ('chest to bar pull up', 'pull_up', 'Chest to bar'),
  ('plyometrics pull ups', 'pull_up', 'Plyometric'),
  ('pull up ( half rep)', 'pull_up', 'Half rep'),
  ('chin up half rep', 'pull_up', 'Half rep'),
  -- Dip
  ('dips', 'dip', 'Parallel bar'),
  ('ring dips', 'dip', 'Ring'),
  ('single bar dips', 'dip', 'Single bar'),
  ('single bar dips sup grip', 'dip', 'Single bar, supinated'),
  -- Squat
  ('air squat', 'squat', 'Air'),
  ('goblet squat', 'squat', 'Goblet'),
  ('back squat', 'squat', 'Back'),
  ('deck squats', 'squat', 'Deck'),
  -- Pistol squat
  ('elevated heel pistol', 'pistol_squat', 'Elevated heel'),
  -- Muscle-up
  ('muscle up', 'muscle_up', 'Strict'),
  -- Handstand push-up
  ('handstand push ups', 'handstand_push_up', 'Standard'),
  ('strict handstand push up', 'handstand_push_up', 'Strict'),
  ('strict box handstand push up kneeling', 'handstand_push_up', 'Box, kneeling'),
  -- Front lever press
  ('tuck front lever press', 'front_lever_press', 'Tuck'),
  ('advanced tuck front lever press', 'front_lever_press', 'Advanced tuck'),
  ('half tuck press front lever', 'front_lever_press', 'Half tuck'),
  ('front lever half press', 'front_lever_press', 'Half press'),
  ('half lay front lever press', 'front_lever_press', 'Half lay'),
  ('single leg front lever press', 'front_lever_press', 'Single leg'),
  ('straddle front lever press', 'front_lever_press', 'Straddle'),
  ('front lever press', 'front_lever_press', 'Full'),
  -- Front lever (hold)
  ('tuck front lever hold', 'front_lever', 'Tuck'),
  ('adance tuck front lever hold', 'front_lever', 'Advanced tuck'),
  ('single leg front lever hold', 'front_lever', 'Single leg'),
  ('half lay front lever hold', 'front_lever', 'Half lay'),
  ('straddle front lever hold', 'front_lever', 'Straddle'),
  ('front lever hold', 'front_lever', 'Full'),
  -- Handstand (hold)
  ('belly to wall handstand hold', 'handstand', 'Belly to wall'),
  ('wall handstand hold', 'handstand', 'Wall'),
  ('free handstand', 'handstand', 'Free'),
  -- Planche (hold)
  ('planche lean', 'planche', 'Lean'),
  ('planche lean hold', 'planche', 'Lean'),
  ('planche lean parallet', 'planche', 'Lean, parallettes'),
  ('supinated planche lean', 'planche', 'Lean, supinated'),
  ('advanced tuck planche lean', 'planche', 'Advanced tuck lean'),
  ('advanced tuck planche lean hold', 'planche', 'Advanced tuck lean'),
  ('straddle planche lean', 'planche', 'Straddle lean'),
  ('straddle planche lean hold', 'planche', 'Straddle lean'),
  ('full planche lean', 'planche', 'Full lean'),
  ('full planche lean hold', 'planche', 'Full lean'),
  ('tuck planche', 'planche', 'Tuck'),
  ('full planche', 'planche', 'Full'),
  -- Back lever (hold)
  ('tuck back lever hold', 'back_lever', 'Tuck'),
  ('low bar tuck back lever', 'back_lever', 'Tuck, low bar'),
  ('advanced tuck back lever', 'back_lever', 'Advanced tuck'),
  ('single leg back lever hold', 'back_lever', 'Single leg'),
  ('straddle back lever hold', 'back_lever', 'Straddle'),
  ('back lever hold', 'back_lever', 'Full')
) AS m(name, family, variation)
WHERE lower(btrim(el.name)) = m.name
  AND el.movement_family IS NULL;

-- Weekly reps per main movement for one athlete: calendar weeks (Monday),
-- last 26, from workout set logs whose exercise is tagged with a reps
-- movement. Per week: total reps, best single set, reps by variation.
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
      AND el.movement_family IN ('pull_up', 'dip', 'squat', 'pistol_squat', 'muscle_up',
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

-- Both readers return the same data, now with 'movements'.
CREATE OR REPLACE FUNCTION public.admin_get_user_performance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  RETURN public._performance_for(p_user_id)
      || jsonb_build_object('movements', public._movement_reps_for(p_user_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_performance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN public._performance_for(v_uid)
      || jsonb_build_object('movements', public._movement_reps_for(v_uid));
END;
$function$;
