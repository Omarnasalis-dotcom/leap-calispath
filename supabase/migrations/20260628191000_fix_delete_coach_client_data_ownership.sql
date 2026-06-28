-- delete_coach_client_data had no check that the caller owns the warrior_programs
-- assignment being deleted. Same missing-ownership-check pattern just fixed in
-- delete_coach_week_data. Add an owner-or-admin check, preserving MyClientsScreen's
-- isAdmin mode where admins manage any coach's clients.
CREATE OR REPLACE FUNCTION public.delete_coach_client_data(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id UUID;
  v_template_name TEXT;
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

  -- A. Delete all workout logs associated with this program
  DELETE FROM public.workout_logs
  WHERE warrior_program_id = p_assignment_id;

  -- B. Delete the assignment connecting the client to the template
  DELETE FROM public.warrior_programs
  WHERE id = p_assignment_id;

  -- C. Check if template is custom
  SELECT name INTO v_template_name
  FROM public.program_templates
  WHERE id = v_template_id;

  -- D. If it's a custom template, completely wipe it
  IF v_template_name LIKE '[CUSTOM]%' THEN
    -- Delete block exercises
    DELETE FROM public.block_exercises
    WHERE block_id IN (
      SELECT id FROM public.program_blocks WHERE template_id = v_template_id
    );

    -- Delete blocks
    DELETE FROM public.program_blocks
    WHERE template_id = v_template_id;

    -- Delete template
    DELETE FROM public.program_templates
    WHERE id = v_template_id;
  END IF;
END;
$function$;
