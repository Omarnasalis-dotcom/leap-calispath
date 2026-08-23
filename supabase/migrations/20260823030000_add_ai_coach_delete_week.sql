-- Delete a specific written week from an AI-owned program, gated behind
-- the same explicit tap-confirmation pattern as create/end program (see
-- propose_delete_week, supabase/functions/ai-coach/tools/) — never fires
-- from the AI's own judgment mid-conversation. Same ownership boundary as
-- every other AI Coach write RPC.
--
-- workout_logs.block_id -> program_blocks.id has NO cascade (unlike
-- block_exercises, which does) — confirmed by checking the schema, not
-- assumed. Deleting a week with real logged history against it would
-- otherwise either hard-fail with a raw FK violation or, if that
-- protection were bypassed, orphan logged data. This checks explicitly
-- and refuses with a clear message instead.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.ai_coach_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%kind%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_coach_requests DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.ai_coach_requests ADD CONSTRAINT ai_coach_requests_kind_check
    CHECK (kind IN ('chat', 'create_program', 'append_week', 'adjust_program', 'end_program', 'delete_week'));
END $$;

CREATE OR REPLACE FUNCTION public.ai_coach_delete_week(
  p_warrior_program_id uuid,
  p_week_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_template_id uuid;
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
  v_block_count integer;
  v_total_blocks integer;
  v_has_logs boolean;
  v_new_current_week integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_block_count
  FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;
  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'Week % not found', p_week_number;
  END IF;

  SELECT count(*) INTO v_total_blocks FROM public.program_blocks WHERE template_id = v_template_id;
  IF v_block_count = v_total_blocks THEN
    RAISE EXCEPTION 'Cannot delete the only week in this program — end the program instead if you want to stop it entirely.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workout_logs wl
    JOIN public.program_blocks pb ON pb.id = wl.block_id
    WHERE pb.template_id = v_template_id AND pb.week_number = p_week_number
  ) INTO v_has_logs;
  IF v_has_logs THEN
    RAISE EXCEPTION 'Cannot delete week %: it already has logged workout history.', p_week_number;
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'delete_week' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT: delete_week daily limit reached';
  END IF;

  DELETE FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;

  SELECT COALESCE(MAX(week_number), 1) INTO v_new_current_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = LEAST(current_week, v_new_current_week)
  WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'delete_week');

  RETURN jsonb_build_object('success', true, 'deleted_week', p_week_number);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_delete_week(uuid, integer) TO authenticated;
