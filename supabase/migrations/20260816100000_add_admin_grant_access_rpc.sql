-- Lets an admin directly gift a user one of the three real subscription
-- durations (1/3/6 month) without going through the invite-code
-- generate-then-redeem flow — a single action from the admin side rather
-- than a two-step "generate a code, hand it out, they redeem it."
--
-- entitlement_source didn't exist before this migration; adding it here
-- (pulled forward from the later trial-grant work, since this RPC needs it
-- for support traceability) and protecting it in the same trigger pass as
-- the other entitlement fields locked down in 20260816090000.
ALTER TABLE public.profiles ADD COLUMN entitlement_source text;

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
       NEW.tournament_gp IS DISTINCT FROM OLD.tournament_gp OR
       NEW.access_granted_at IS DISTINCT FROM OLD.access_granted_at OR
       NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at OR
       NEW.invite_code_used IS DISTINCT FROM OLD.invite_code_used OR
       NEW.coach_beta_access IS DISTINCT FROM OLD.coach_beta_access OR
       NEW.entitlement_source IS DISTINCT FROM OLD.entitlement_source
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;
    IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
        RAISE EXCEPTION 'Gender can only be set once and cannot be changed.';
    END IF;
    IF OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
        RAISE EXCEPTION 'Country can only be set once and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$function$;

-- admin_grant_access(p_user_id, p_duration_type): admin-only, gifts one of
-- the three real subscription durations directly. Additive (matches
-- redeem_invite_code's behavior from 20260816090000) — stacks on top of any
-- existing trial/subscription/gift rather than overwriting it, so gifting a
-- user who already has active access always leaves them better off, never
-- shortens what they already had. Audit-logged the same way as
-- admin_grant_role (20260719120400/20260725140000) so gifted access is
-- traceable to the admin who granted it.
CREATE OR REPLACE FUNCTION public.admin_grant_access(p_user_id uuid, p_duration_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_duration interval;
  v_new_expires_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  CASE p_duration_type
    WHEN '1month' THEN v_duration := interval '1 month';
    WHEN '3month' THEN v_duration := interval '3 months';
    WHEN '6month' THEN v_duration := interval '6 months';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_DURATION_TYPE');
  END CASE;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now()) + v_duration,
    entitlement_source = 'admin_grant'
  WHERE id = p_user_id
  RETURNING access_expires_at INTO v_new_expires_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (
    auth.uid(),
    'grant_access',
    p_user_id::text,
    jsonb_build_object('duration_type', p_duration_type, 'new_expires_at', v_new_expires_at)
  );

  RETURN jsonb_build_object('success', true, 'access_expires_at', v_new_expires_at);
END;
$function$;
