-- Every new signup now gets a 14-day full-access trial automatically,
-- regardless of whether they enter an invite code (INVITE_CODE_REQUIRED is
-- false at AuthScreen.tsx:273 — most users never touch that flow).
-- handle_new_user() already fires on every signup path (email/password,
-- Google, Apple) via the on_auth_user_created trigger, so this needs zero
-- new client round-trips and can't fail independently of account creation
-- itself. redeem_invite_code remains the top-up path (comp codes,
-- member_30/member_90/lifetime, master for QA) on top of this base trial.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Insert the new user into the profiles table, mapping all metadata correctly
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    last_name,
    display_name,
    gender,
    country,
    timezone,
    updated_at,
    access_granted_at,
    access_expires_at,
    entitlement_source
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC'),
    NOW(),
    NOW(),
    NOW() + interval '14 days',
    'trial'
  );

  RETURN NEW;
END;
$function$
;

-- redeem_invite_code didn't set entitlement_source (the column didn't exist
-- when it was last touched in 20260816090000) — label code-driven grants
-- distinctly from the automatic signup trial, for support traceability.
-- Everything else (master-code fix, additive stacking) is unchanged from
-- 20260816090000.
CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_code_id uuid;
  v_type text;
  v_duration interval;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE invite_codes
  SET used_by = p_user_id, used_at = now()
  WHERE code ILIKE p_code
    AND used_by IS NULL
  RETURNING id, type INTO v_code_id, v_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code not found or already used');
  END IF;

  CASE v_type
    WHEN 'trial_14' THEN v_duration := interval '14 days';
    WHEN 'member_30' THEN v_duration := interval '30 days';
    WHEN 'member_90' THEN v_duration := interval '90 days';
    WHEN 'lifetime' THEN v_duration := interval '100 years';
    WHEN 'master' THEN v_duration := interval '100 years';
    ELSE v_duration := interval '7 days';
  END CASE;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now()) + v_duration,
    invite_code_used = p_code,
    entitlement_source = 'invite_code'
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$
;
