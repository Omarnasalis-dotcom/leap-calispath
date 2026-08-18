-- Fixes a real bug found during the first real-device sandbox purchase
-- test: apply_revenuecat_entitlement's guard checked
-- current_setting('request.jwt.claim.role', true), which is always NULL in
-- this project. Verified empirically via a debug RPC called from a real
-- deployed Edge Function using the actual service-role key: this project's
-- Supabase setup uses the newer API-key-based JWT issuer
-- (api-keys-jwt-issuer), which only populates the full JSON
-- request.jwt.claims blob, not the classic flat per-claim GUCs
-- (request.jwt.claim.<key>) that older Supabase/PostgREST setups expose.
-- The role WAS correctly present, just nested inside the JSON blob:
-- request.jwt.claims::jsonb ->> 'role' = 'service_role'.
--
-- Net effect of the bug: every real call from revenuecat-webhook and
-- confirm-entitlement was being rejected with FORBIDDEN — a real sandbox
-- purchase completed successfully on Apple's side, but access was never
-- actually granted because this check silently blocked the legitimate
-- service-role caller too, not just unauthorized ones.
CREATE OR REPLACE FUNCTION public.apply_revenuecat_entitlement(
  p_user_id uuid,
  p_expires_at timestamptz,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = p_expires_at,
    entitlement_source = p_source
  WHERE id = p_user_id;
END;
$function$;
