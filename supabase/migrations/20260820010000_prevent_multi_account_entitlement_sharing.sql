-- Confirmed empirically during pre-submission testing: one real sandbox
-- subscription (purchased on account acf0c860-...) ended up granting
-- simultaneous active access to a second, unrelated account
-- (0bdb76bb-...) that never purchased anything — RevenueCat's own
-- "Transfer to new App User ID" project setting did not prevent this, at
-- least via the passive Purchases.logIn() path (switching which app
-- account is signed in on a device that already purchased). This closes
-- the gap server-side: one underlying subscription can only ever grant
-- active access to one profile at a time, enforced here rather than
-- trusted to RevenueCat's own client-side transfer behavior.
--
-- rc_original_transaction_id is Apple's own transaction identifier for the
-- ORIGINAL purchase in a subscription — stable across renewals and across
-- RevenueCat app_user_id transfers/aliases, unlike transaction_id (which
-- changes every renewal) or app_user_id itself (which is exactly the
-- identity that can be switched to exploit this).
ALTER TABLE public.profiles ADD COLUMN rc_original_transaction_id text;

CREATE OR REPLACE FUNCTION public.apply_revenuecat_entitlement(
  p_user_id uuid,
  p_expires_at timestamptz,
  p_source text,
  p_original_transaction_id text DEFAULT NULL
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

  -- One real subscription must only ever grant active access to one
  -- account at a time. If this same underlying transaction was previously
  -- attached to a DIFFERENT account, revoke that account's access before
  -- granting it here.
  IF p_original_transaction_id IS NOT NULL THEN
    UPDATE profiles
    SET access_expires_at = now()
    WHERE id <> p_user_id
      AND rc_original_transaction_id = p_original_transaction_id
      AND entitlement_source = 'rc_subscription'
      AND access_expires_at > now();
  END IF;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = p_expires_at,
    entitlement_source = p_source,
    rc_original_transaction_id = COALESCE(p_original_transaction_id, rc_original_transaction_id)
  WHERE id = p_user_id;
END;
$function$;
