-- Gives the AI Coach genuine delete/overwrite capability, but only ever
-- fired from an explicit human tap in the chat UI, never from the AI's own
-- judgment mid-conversation — see the new propose_new_program/
-- propose_end_program tools (supabase/functions/ai-coach/tools/) which only
-- signal a proposed action back to the client; CoachScreen.tsx calls this
-- RPC (and the existing ai_coach_create_program) directly on confirm.
--
-- Same ownership boundary as append_week/adjust_program: only ever ends a
-- program the AI itself created for this warrior — a program a real human
-- coach assigned is never reachable through this RPC, by design (an
-- athlete who wants to end a coach-assigned program is directed elsewhere
-- by the system prompt instead).

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
    CHECK (kind IN ('chat', 'create_program', 'append_week', 'adjust_program', 'end_program'));
END $$;

CREATE OR REPLACE FUNCTION public.ai_coach_end_program(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT coach_id, warrior_id INTO v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'end_program'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT: end_program daily limit reached';
  END IF;

  UPDATE public.warrior_programs SET status = 'completed' WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'end_program');

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_end_program(uuid) TO authenticated;
