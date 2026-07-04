-- redeem_invite_code(p_code, p_user_id) never checked auth.uid() = p_user_id.
-- Only self-redemption happens client-side today (AuthScreen.tsx), but the
-- RPC is directly callable — a user with a valid code and another user's
-- UUID could redeem it against that victim's profile, overwriting
-- access_expires_at unconditionally.
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

  -- Finalize the claim. We only need to check if used_by IS NULL
  -- because the frontend has already acquired the timestamp lock for this flow.
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
    ELSE v_duration := interval '7 days';
  END CASE;

  UPDATE profiles
  SET
    access_granted_at = now(),
    access_expires_at = now() + v_duration,
    invite_code_used = p_code
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$
;
