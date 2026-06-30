-- prevent_power_tier_spoofing() used auth.role() = 'authenticated' to detect
-- client writes. auth.role() reads the JWT role, which stays 'authenticated'
-- even when called from inside a SECURITY DEFINER function (it reflects the
-- caller's JWT, not the PostgreSQL session role). By contrast, current_user
-- DOES change to 'postgres' (the function owner) for SECURITY DEFINER RPCs,
-- which is why prevent_tier_modification() on profiles uses current_user
-- and works correctly. The net result: the old trigger either silently never
-- fired (if auth.role() returned something other than 'authenticated' in this
-- trigger context) or incorrectly blocked submit_power_assessment's ON CONFLICT
-- DO UPDATE SET power_tier = ... (if it correctly returned 'authenticated').
-- Since power tier promotions work in production, the former is most likely —
-- making the trigger effectively useless. Aligning with the proven pattern.
CREATE OR REPLACE FUNCTION public.prevent_power_tier_spoofing()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- current_user changes to 'postgres' for SECURITY DEFINER RPCs, bypassing
  -- this check safely — same pattern as prevent_tier_modification() on profiles.
  IF current_user IN ('authenticated', 'anon') AND
     (NEW.power_tier IS DISTINCT FROM OLD.power_tier)
  THEN
    RAISE EXCEPTION 'Cannot modify power_tier directly.';
  END IF;
  RETURN NEW;
END;
$function$
;
