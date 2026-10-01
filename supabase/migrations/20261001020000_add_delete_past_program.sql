-- Delete from Training Center's previous-programs sheet. A soft delete:
-- the warrior_programs row moves to status 'deleted', which drops it out of
-- get_past_programs() (status = 'completed' only) and makes it
-- unrestorable (restore_program() only accepts 'completed'). The row and
-- its workout_logs stay, so the warrior's history, streak and weekly stats
-- don't change, and nothing that counts past assignments can be reset by
-- deleting one.
--
-- Same ownership boundary as get_past_programs/restore_program
-- (20261001010000): own, system-owned (LEAP ...0001 / AI Coach ...0002)
-- programs only, and never the active one.

CREATE OR REPLACE FUNCTION public.delete_past_program(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warrior_id CONSTANT uuid := auth.uid();
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  UPDATE warrior_programs SET status = 'deleted'
  WHERE id = p_warrior_program_id
    AND warrior_id = v_warrior_id
    AND status = 'completed'
    AND coach_id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_past_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_past_program(uuid) TO authenticated, service_role;
