-- Gate 2 finish: self-service path for a warrior stuck behind the new
-- min_access_tier lock (WarriorProgramScreen.tsx) to leave a program they no
-- longer have the tier to keep using. Self-service only for system-owned
-- programs (AI Coach / LEAP system profiles) — a real human coach's
-- assignment is never touchable here, matching every other ai_coach_* RPC's
-- ownership boundary.
CREATE OR REPLACE FUNCTION public.end_active_program()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warrior_id CONSTANT uuid := auth.uid();
  v_coach_id uuid;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT coach_id INTO v_coach_id FROM warrior_programs
  WHERE warrior_id = v_warrior_id AND status = 'active';

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'No active program to end';
  END IF;

  IF v_coach_id NOT IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'This program is managed by a coach — contact them to change it';
  END IF;

  UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.end_active_program() TO authenticated;
