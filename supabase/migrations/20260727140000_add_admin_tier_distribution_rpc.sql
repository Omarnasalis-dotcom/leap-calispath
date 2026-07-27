-- Tier distribution: how many warriors sit at each strength tier
-- (0=Helot .. 9=Eternity). Only counts assessed_at IS NOT NULL — every
-- profile defaults to strength_tier 0, so including unassessed users would
-- massively inflate "Helot" with people who simply haven't onboarded yet,
-- not warriors who are actually stuck at the bottom. Returns all 10 tiers
-- always (generate_series LEFT JOIN), including zero-count ones, so the
-- frontend can render a fixed 10-bar histogram without guessing which
-- tiers are missing from the result.
CREATE OR REPLACE FUNCTION public.admin_get_tier_distribution()
RETURNS TABLE(tier integer, warrior_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT t.tier, coalesce(count(p.id), 0) AS warrior_count
  FROM generate_series(0, 9) AS t(tier)
  LEFT JOIN profiles p ON p.strength_tier = t.tier AND p.assessed_at IS NOT NULL
  GROUP BY t.tier
  ORDER BY t.tier;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_tier_distribution() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_tier_distribution() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_tier_distribution() TO authenticated;
