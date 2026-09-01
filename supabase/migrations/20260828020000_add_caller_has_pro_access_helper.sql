-- The "mirrors canAccessPro() server-side" Pro-check block (bool_or(paywall_enabled)
-- + admin/coach bypass + access_expires_at > now()) is copy-pasted identically
-- across select_library_template, create_custom_program_from_workouts, and
-- ai_coach_create_program_from_workouts. This plan (freemium gating redesign,
-- 2026-08-28) has to touch all three of those plus add the same check to three
-- more RPCs that currently have none at all — extracting it now costs nothing
-- extra and stops a fourth/fifth/sixth copy-paste from happening.
CREATE OR REPLACE FUNCTION public.caller_has_pro_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_paywall_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT bool_or(paywall_enabled) INTO v_paywall_enabled FROM app_config;

  RETURN NOT COALESCE(v_paywall_enabled, false)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND (is_admin OR is_coach))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND access_expires_at > now());
END;
$function$;

GRANT EXECUTE ON FUNCTION public.caller_has_pro_access() TO authenticated;
