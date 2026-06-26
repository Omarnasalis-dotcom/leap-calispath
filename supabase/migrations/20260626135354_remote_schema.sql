set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;

    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR
       NEW.is_coach IS DISTINCT FROM OLD.is_coach OR
       NEW.strength_tier IS DISTINCT FROM OLD.strength_tier OR
       NEW.power_tier IS DISTINCT FROM OLD.power_tier OR
       NEW.statics_tier IS DISTINCT FROM OLD.statics_tier OR
       NEW.glory_score IS DISTINCT FROM OLD.glory_score OR
       NEW.streak IS DISTINCT FROM OLD.streak OR
       NEW.trials_passed IS DISTINCT FROM OLD.trials_passed OR
       NEW.power_points IS DISTINCT FROM OLD.power_points OR
       NEW.one_mm_points IS DISTINCT FROM OLD.one_mm_points OR
       NEW.clash_win_streak IS DISTINCT FROM OLD.clash_win_streak OR
       NEW.tournament_gp IS DISTINCT FROM OLD.tournament_gp
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;

    RETURN NEW;
END;
$function$
;


