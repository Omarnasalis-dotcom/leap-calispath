-- Called by the revenuecat-webhook and confirm-entitlement Edge Functions
-- (service-role callers, never a regular authenticated client) to actually
-- grant/extend access after a real purchase/renewal/restore. Not meaningfully
-- callable as a normal user RPC — guarded the same way admin_grant_role
-- guards its privileged path, rather than relying only on it not being
-- exposed client-side.
--
-- IMPORTANT: the guard checks current_setting('request.jwt.claim.role'),
-- not current_user. Verified empirically against a scratch function: inside
-- a SECURITY DEFINER function, current_user always resolves to the function
-- OWNER (postgres) regardless of who actually called it — a current_user
-- check here would silently never block anyone. Session GUCs like the JWT
-- role claim are unaffected by SECURITY DEFINER's role-switching (confirmed
-- the same GUC read returns 'authenticated' vs 'service_role' correctly
-- depending on the calling context), so that's the only reliable way to
-- identify the actual caller from inside this function.
--
-- Idempotent by construction: sets access_expires_at to an absolute
-- timestamp rather than incrementing it, so RevenueCat's at-least-once
-- webhook delivery can safely call this multiple times with the same event
-- without double-extending access. access_granted_at is only set the first
-- time (COALESCE), matching the "first time this user ever got access"
-- semantics established by redeem_invite_code and the signup trial grant.
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
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
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
