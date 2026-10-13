-- Audit 2026-10-13 (C2): any signed-in user could INSERT a warrior_programs row
-- naming themselves coach of any other user (enabling push spam via
-- notify-client-program-update, reading the victim's workout/bodyweight logs,
-- and deleting a library program), and an athlete could repoint coach_id /
-- template_id / warrior_id on their own assignment row.
--
-- Assignments are only ever created by SECURITY DEFINER RPCs
-- (assign_program_template, select_library_template,
-- create_custom_program_from_workouts, overwrite_client_program, the ai_coach_*
-- builders, add_week_to_own_program, restore_program), which run as postgres and
-- bypass RLS. The app/admin never INSERT a warrior_programs row directly.

REVOKE INSERT ON public.warrior_programs FROM authenticated, anon;

-- The only legitimate direct (non-RPC) client UPDATEs are: a warrior advancing
-- current_week on their own program (MilestoneLane / WarriorProgram), and a
-- coach/admin changing status (MyClients / admin-web). Block changes to the
-- identity/ownership columns from direct callers. SECURITY DEFINER RPCs and the
-- SECURITY DEFINER community trigger run as postgres and are exempt.
CREATE OR REPLACE FUNCTION public.guard_warrior_program_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.warrior_id IS DISTINCT FROM OLD.warrior_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.community_left_at IS DISTINCT FROM OLD.community_left_at THEN
    RAISE EXCEPTION 'warrior_programs ownership columns cannot be changed directly.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_warrior_program_ownership ON public.warrior_programs;
CREATE TRIGGER guard_warrior_program_ownership
  BEFORE UPDATE ON public.warrior_programs
  FOR EACH ROW EXECUTE FUNCTION public.guard_warrior_program_ownership();
