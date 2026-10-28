-- Offer funnel for the admin Growth page (the Nov 2026 prices and offers).
-- Counts people (distinct users) from app_events, admins excluded:
--  - each welcome-offer moment: screen shown, claim / code / dismiss taps,
--    then the paywall opened from it and purchases made from it
--  - the locked ADD NEW WEEK button: taps, paywall, purchases
--  - store purchases and renewals by period type (INTRO = intro offer,
--    PROMOTIONAL = offer code, NORMAL = full price), logged by the
--    RevenueCat webhook
--  - Redeem a Code: opened and unlocked, per platform

CREATE OR REPLACE FUNCTION public.admin_get_offer_analytics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH ev AS (
    SELECT e.user_id, e.event, e.properties, e.platform
    FROM app_events e
    WHERE e.created_at >= v_since
      AND e.user_id NOT IN (SELECT id FROM profiles WHERE is_admin)
  ),
  moments AS (
    SELECT m.moment, m.ord,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_screen_viewed' AND properties->>'trigger' = m.moment) AS shown,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_claim_tapped' AND properties->>'trigger' = m.moment) AS claimed,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_code_tapped' AND properties->>'trigger' = m.moment) AS code_tapped,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_dismissed' AND properties->>'trigger' = m.moment) AS dismissed,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'paywall_viewed' AND properties->>'source' = 'welcome_offer_' || m.moment) AS paywall,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'purchase_completed' AND properties->>'source' = 'welcome_offer_' || m.moment) AS bought
    FROM (VALUES ('assessment', 1), ('program_complete', 2), ('banner', 3)) AS m(moment, ord)
  ),
  add_week AS (
    SELECT
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'add_week_locked_tapped') AS tapped,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'paywall_viewed' AND properties->>'source' LIKE 'add_week_%') AS paywall,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'purchase_completed' AND properties->>'source' LIKE 'add_week_%') AS bought
  ),
  store AS (
    SELECT event, COALESCE(properties->>'period_type', 'UNKNOWN') AS period_type,
           COALESCE(properties->>'tier', '?') AS tier, platform,
           count(*) AS events, count(DISTINCT user_id) AS users
    FROM ev
    WHERE event IN ('store_purchase', 'store_renewal')
    GROUP BY 1, 2, 3, 4
  ),
  codes AS (
    SELECT COALESCE(properties->>'platform', platform, '?') AS platform,
      count(DISTINCT user_id) FILTER (WHERE event = 'redeem_code_submitted') AS submitted,
      count(DISTINCT user_id) FILTER (WHERE event = 'redeem_code_unlocked') AS unlocked
    FROM ev
    WHERE event IN ('redeem_code_submitted', 'redeem_code_unlocked')
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'moments', (SELECT coalesce(jsonb_agg(to_jsonb(m) - 'ord' ORDER BY m.ord), '[]'::jsonb) FROM moments m),
    'add_week', (SELECT to_jsonb(a) FROM add_week a),
    'store', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.event, s.period_type, s.tier), '[]'::jsonb) FROM store s),
    'codes', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.platform), '[]'::jsonb) FROM codes c)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_offer_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_offer_analytics(integer) TO authenticated, service_role;
