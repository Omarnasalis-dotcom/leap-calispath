-- append/archive get an assistant branch (non-destructive ways to combine a
-- new template with an existing one). overwrite_client_program deliberately
-- does NOT — it deletes logged workouts, notes, and existing weeks, so it
-- stays coach/admin only, matching the permission matrix. All three also
-- gain a pause check that didn't exist before (an oversight from the
-- earlier pause-enforcement pass, caught while adding assistant support
-- here) — pause blocks the coach's own calls too now, not just assistants'.
CREATE OR REPLACE FUNCTION public.append_weeks_to_client_program(p_warrior_program_id uuid, p_blocks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_coach_id uuid;
  v_is_admin boolean;
  v_week_offset integer;
  v_new_max_week integer;
BEGIN
  SELECT template_id, coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to modify this client''s program';
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    IF auth.uid() = v_coach_id THEN
      IF public.is_coaching_paused(v_coach_id) THEN
        RAISE EXCEPTION 'Coaching access is paused';
      END IF;
    ELSIF public.is_assistant_for(v_coach_id) THEN
      IF public.is_coaching_paused(v_coach_id) THEN
        RAISE EXCEPTION 'Coaching access is paused';
      END IF;
    ELSE
      RAISE EXCEPTION 'Not authorized to modify this client''s program';
    END IF;
  END IF;

  SELECT COALESCE(MAX(week_number), 0) INTO v_week_offset
  FROM public.program_blocks WHERE template_id = v_template_id;

  PERFORM public._insert_client_program_blocks(v_template_id, v_week_offset, p_blocks);

  SELECT MAX(week_number) INTO v_new_max_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE id = p_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'week_offset', v_week_offset);
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_and_append_client_program(p_warrior_program_id uuid, p_blocks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_coach_id uuid;
  v_is_admin boolean;
  v_week_offset integer;
  v_new_max_week integer;
BEGIN
  SELECT template_id, coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to modify this client''s program';
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    IF auth.uid() = v_coach_id THEN
      IF public.is_coaching_paused(v_coach_id) THEN
        RAISE EXCEPTION 'Coaching access is paused';
      END IF;
    ELSIF public.is_assistant_for(v_coach_id) THEN
      IF public.is_coaching_paused(v_coach_id) THEN
        RAISE EXCEPTION 'Coaching access is paused';
      END IF;
    ELSE
      RAISE EXCEPTION 'Not authorized to modify this client''s program';
    END IF;
  END IF;

  INSERT INTO public.program_week_archive (template_id, week_number)
  SELECT DISTINCT v_template_id, week_number
  FROM public.program_blocks
  WHERE template_id = v_template_id
  ON CONFLICT (template_id, week_number) DO NOTHING;

  SELECT COALESCE(MAX(week_number), 0) INTO v_week_offset
  FROM public.program_blocks WHERE template_id = v_template_id;

  PERFORM public._insert_client_program_blocks(v_template_id, v_week_offset, p_blocks);

  SELECT MAX(week_number) INTO v_new_max_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE id = p_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id, 'week_offset', v_week_offset);
END;
$function$;

CREATE OR REPLACE FUNCTION public.overwrite_client_program(p_warrior_program_id uuid, p_blocks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_coach_id uuid;
  v_is_admin boolean;
BEGIN
  SELECT template_id, coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() IS NULL OR (auth.uid() != v_coach_id AND NOT COALESCE(v_is_admin, false)) THEN
    RAISE EXCEPTION 'Not authorized to modify this client''s program';
  END IF;

  IF NOT COALESCE(v_is_admin, false) AND public.is_coaching_paused(v_coach_id) THEN
    RAISE EXCEPTION 'Coaching access is paused';
  END IF;

  DELETE FROM public.workout_logs WHERE warrior_program_id = p_warrior_program_id;
  DELETE FROM public.coach_week_notes WHERE warrior_program_id = p_warrior_program_id;
  DELETE FROM public.block_exercises
    WHERE block_id IN (SELECT id FROM public.program_blocks WHERE template_id = v_template_id);
  DELETE FROM public.program_blocks WHERE template_id = v_template_id;
  DELETE FROM public.program_week_archive WHERE template_id = v_template_id;

  PERFORM public._insert_client_program_blocks(v_template_id, 0, p_blocks);

  UPDATE public.warrior_programs
  SET current_week = 1
  WHERE id = p_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$function$;
