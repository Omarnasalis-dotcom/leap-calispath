-- Audit item (2026-10-13 full audit, "admin direct-table deletes not
-- audit-logged"): the admin panel deletes rows straight from these tables
-- (no RPC), so admin_audit_log never saw them. Every delete made by an admin
-- is now logged here: who, when, which row, and a snapshot of it.
--
-- Statement-level triggers (one INSERT per statement, however many rows a
-- bulk delete removes). Only admins are logged: a coach deleting their own
-- template, cascades from account deletion (no caller) and service-role jobs
-- aren't admin actions. Program blocks/exercises aren't listed: they go with
-- their template, which is logged.

CREATE OR REPLACE FUNCTION public.audit_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  SELECT v_actor, 'delete_' || TG_TABLE_NAME, TG_TABLE_NAME || ':' || (to_jsonb(o) ->> 'id'), to_jsonb(o)
  FROM old_rows o;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.audit_admin_delete() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['weekly_challenges', 'challenge_templates', 'exercise_library', 'program_templates', 'standalone_workouts', 'coach_assistants'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_admin_delete ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_admin_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.audit_admin_delete()',
      t);
  END LOOP;
END $$;
