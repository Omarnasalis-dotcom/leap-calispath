-- Pause = read-only: a paused coach can still see their roster, but every
-- write — including removing a client relationship — is blocked. Admins are
-- exempt (they can still act on a paused coach's data via this same RPC).
CREATE OR REPLACE FUNCTION public.delete_coach_client_data(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id UUID;
  v_warrior_id UUID;
  v_owner_coach_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Get assignment details
  SELECT template_id, warrior_id, coach_id INTO v_template_id, v_warrior_id, v_owner_coach_id
  FROM public.warrior_programs
  WHERE id = p_assignment_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

  IF auth.uid() != v_owner_coach_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Not authorized to modify this assignment';
  END IF;

  IF NOT COALESCE(v_is_admin, false) AND public.is_coaching_paused(auth.uid()) THEN
    RAISE EXCEPTION 'Coaching access is paused';
  END IF;

  -- A. Delete all workout logs associated with this program
  DELETE FROM public.workout_logs
  WHERE warrior_program_id = p_assignment_id;

  -- B. Delete the assignment connecting the client to the template
  DELETE FROM public.warrior_programs
  WHERE id = p_assignment_id;

  -- C. If no other assignment still references this template, it's an
  -- orphaned clone (not a reusable master) — wipe it entirely.
  IF NOT EXISTS (
    SELECT 1 FROM public.warrior_programs WHERE template_id = v_template_id
  ) THEN
    DELETE FROM public.block_exercises
    WHERE block_id IN (
      SELECT id FROM public.program_blocks WHERE template_id = v_template_id
    );

    DELETE FROM public.program_blocks
    WHERE template_id = v_template_id;

    DELETE FROM public.program_templates
    WHERE id = v_template_id;
  END IF;
END;
$function$;
