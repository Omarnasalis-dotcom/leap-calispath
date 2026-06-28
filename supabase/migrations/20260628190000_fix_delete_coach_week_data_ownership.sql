-- delete_coach_week_data had no check that the caller owns the template being
-- modified. Verified exploitable: an unrelated coach account could delete any
-- other coach's program week via a plain authenticated RPC call. Add an
-- owner-or-admin check, mirroring the "Admin views all logs" override pattern
-- already used elsewhere in this schema (MyClientsScreen's isAdmin mode relies
-- on admins being able to manage any coach's data).
CREATE OR REPLACE FUNCTION public.delete_coach_week_data(p_template_id uuid, p_week_number integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_coach_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  SELECT coach_id INTO v_owner_coach_id
  FROM public.program_templates
  WHERE id = p_template_id;

  IF v_owner_coach_id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

  IF auth.uid() != v_owner_coach_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Not authorized to modify this template';
  END IF;

  -- A. Delete workout logs mapped to the blocks of this week
  DELETE FROM public.workout_logs
  WHERE block_id IN (
    SELECT id FROM public.program_blocks
    WHERE template_id = p_template_id AND week_number = p_week_number
  );

  -- B. Delete block exercises mapped to the blocks of this week
  DELETE FROM public.block_exercises
  WHERE block_id IN (
    SELECT id FROM public.program_blocks
    WHERE template_id = p_template_id AND week_number = p_week_number
  );

  -- C. Delete the program blocks themselves
  DELETE FROM public.program_blocks
  WHERE template_id = p_template_id AND week_number = p_week_number;
END;
$function$;
