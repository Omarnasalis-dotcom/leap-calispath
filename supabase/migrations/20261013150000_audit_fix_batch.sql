-- Audit 2026-10-13 fix batch (bugs found by the delta audit).

-- 1. Abandoned trials ------------------------------------------------------
-- trial_history lost its client INSERT policy on 2026-06-18 (results moved to
-- the submit-trial-result Edge Function, so nobody can insert a fake
-- completed trial into the Strength leaderboard's source). The app's abandon
-- logger still inserted directly and has been silently rejected since. This
-- function can only write a NOT completed row for the caller. Leaderboard and
-- Journey points count completed rows only, so these rows can't move ranks.
CREATE OR REPLACE FUNCTION public.log_abandoned_trial(p_tier integer, p_time_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
  END IF;
  IF p_tier IS NULL OR p_tier < 0 OR p_tier > 9 THEN
    RAISE EXCEPTION 'INVALID_TIER' USING ERRCODE = '22023';
  END IF;
  -- Light spam guard: one abandoned attempt per user per 5 seconds.
  IF EXISTS (
    SELECT 1 FROM public.trial_history
    WHERE user_id = v_user_id AND completed IS NOT TRUE
      AND attempted_at > now() - interval '5 seconds'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.trial_history (user_id, tier_attempted, completed, time_seconds)
  VALUES (v_user_id, p_tier, false, LEAST(GREATEST(COALESCE(p_time_seconds, 0), 0), 21600));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_abandoned_trial(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_abandoned_trial(integer, integer) TO authenticated, service_role;

-- 2. Paid check on block logging -------------------------------------------
-- log_block_with_sets had none, while toggle_block_status refuses to complete
-- a block of a program above the caller's plan. Prod definition + that check.
-- (Direct writes to workout_logs are still allowed by RLS for the caller's
-- own rows; locking those down is a separate change.)
CREATE OR REPLACE FUNCTION public.log_block_with_sets(p_warrior_id uuid, p_warrior_program_id uuid, p_block_id uuid, p_status text, p_feel text, p_rpe integer, p_missed_reason text, p_missed_detail text, p_notes text, p_session_seconds integer, p_start_of_today timestamp with time zone, p_sets jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_workout_log_id uuid;
  v_set jsonb;
  v_min_access_tier text;
  v_caller_tier text;
  v_tier_rank jsonb := '{"free":0,"first":1,"pro":2,"max":3}'::jsonb;
BEGIN
  -- Same paid check as toggle_block_status: completing a block of a program
  -- above the caller's plan is refused. Missed / cleared stay allowed.
  IF p_status = 'completed' THEN
    SELECT pt.min_access_tier INTO v_min_access_tier
    FROM warrior_programs wp
    JOIN program_templates pt ON pt.id = wp.template_id
    WHERE wp.id = p_warrior_program_id;

    IF v_min_access_tier IS NOT NULL THEN
      v_caller_tier := public.caller_effective_tier();
      IF COALESCE((v_tier_rank ->> v_caller_tier)::int, 0) < COALESCE((v_tier_rank ->> v_min_access_tier)::int, 0) THEN
        RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  DELETE FROM workout_logs
  WHERE warrior_id = p_warrior_id
    AND block_id = p_block_id
    AND completed_at >= p_start_of_today;

  IF p_status = 'none' THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO workout_logs (
    warrior_program_id, warrior_id, block_id, notes, rating,
    feel, rpe, missed_reason, missed_detail, session_seconds
  )
  VALUES (
    p_warrior_program_id,
    p_warrior_id,
    p_block_id,
    CASE WHEN p_status = 'missed' THEN '[STATUS:MISSED]' ELSE COALESCE(p_notes, '') END,
    COALESCE(round(p_rpe / 2.0), 5),
    p_feel,
    p_rpe,
    p_missed_reason,
    p_missed_detail,
    p_session_seconds
  )
  RETURNING id INTO v_workout_log_id;

  IF p_sets IS NOT NULL THEN
    FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
    LOOP
      INSERT INTO workout_set_logs (
        workout_log_id, block_exercise_id, set_index,
        reps_completed, weight_used, hold_seconds
      )
      VALUES (
        v_workout_log_id,
        (v_set->>'block_exercise_id')::uuid,
        (v_set->>'set_index')::integer,
        (v_set->>'reps_completed')::integer,
        (v_set->>'weight_used')::numeric,
        (v_set->>'hold_seconds')::numeric
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'workout_log_id', v_workout_log_id);
END;
$function$
;

-- 3. Quick Workout content is paid-only on the server -----------------------
-- Quick Workout's lock lived only in the app: any signed-in user could read a
-- paid quick workout's blocks and exercises. Program workouts ("workout"
-- kind) stay readable for everyone: free users preview them in Customize
-- Program before paying (build free, pay to commit). Workout cards
-- (standalone_workouts) stay readable so locked tiles still show.
DROP POLICY IF EXISTS "Authenticated users can view published workout blocks" ON public.standalone_workout_blocks;
CREATE POLICY "Authenticated users can view published workout blocks"
  ON public.standalone_workout_blocks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.standalone_workouts sw
    WHERE sw.id = standalone_workout_blocks.workout_id
      AND sw.status = 'published'
      AND (sw.is_free OR sw.kind <> 'quick_workout' OR (SELECT public.caller_has_pro_access()))
  ));

DROP POLICY IF EXISTS "Authenticated users can view standalone workout exercises" ON public.standalone_workout_exercises;
CREATE POLICY "Authenticated users can view standalone workout exercises"
  ON public.standalone_workout_exercises FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.standalone_workout_blocks swb
    JOIN public.standalone_workouts sw ON sw.id = swb.workout_id
    WHERE swb.id = standalone_workout_exercises.block_id
      AND sw.status = 'published'
      AND (sw.is_free OR sw.kind <> 'quick_workout' OR (SELECT public.caller_has_pro_access()))
  ));

-- 4. One active program per athlete ------------------------------------------
-- assign_program_template / select_library_template / end_active_program all
-- complete the athlete's active program first, but a coach (or admin) setting
-- an old assignment back to 'active' left two active programs. Whenever a
-- program becomes active, any other active program of that athlete is
-- completed, the same way those RPCs do it.
CREATE OR REPLACE FUNCTION public.complete_other_active_programs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    UPDATE public.warrior_programs
    SET status = 'completed'
    WHERE warrior_id = NEW.warrior_id AND status = 'active' AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_other_active_programs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS complete_other_active_programs ON public.warrior_programs;
CREATE TRIGGER complete_other_active_programs
  BEFORE INSERT OR UPDATE OF status ON public.warrior_programs
  FOR EACH ROW EXECUTE FUNCTION public.complete_other_active_programs();
