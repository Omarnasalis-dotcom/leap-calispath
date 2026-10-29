-- Offers report: the intro offer now also shows inside the upgrade pop-up
-- (UpgradeToSaveModal: Customize, Templates, Quick Workout, AI Coach, the
-- workout lock, ADD NEW WEEK), logged with trigger 'upgrade_popup'. Adds it
-- as a fourth moment. Same function as 20261030100000 otherwise; the event
-- rows now carry created_at so a paywall view or purchase only counts after
-- a claim in the pop-up.

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
    SELECT e.user_id, e.event, e.properties, e.platform, e.created_at
    FROM app_events e
    WHERE e.created_at >= v_since
      AND e.user_id NOT IN (SELECT id FROM profiles WHERE is_admin)
      AND NOT (e.event IN ('purchase_completed', 'store_purchase', 'store_renewal', 'redeem_code_unlocked')
               AND e.user_id IN (SELECT user_id FROM analytics_store_test_users))
  ),
  moments AS (
    SELECT m.moment, m.ord,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_screen_viewed' AND properties->>'trigger' = m.moment) AS shown,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_claim_tapped' AND properties->>'trigger' = m.moment) AS claimed,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_code_tapped' AND properties->>'trigger' = m.moment) AS code_tapped,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'offer_dismissed' AND properties->>'trigger' = m.moment) AS dismissed,
      CASE WHEN m.moment = 'upgrade_popup' THEN
        -- The pop-up opens the paywall with the feature's own source
        -- (add_week_journey, ...): count people who claimed in it first.
        (SELECT count(DISTINCT p.user_id) FROM ev p WHERE p.event = 'paywall_viewed'
           AND EXISTS (SELECT 1 FROM ev c WHERE c.user_id = p.user_id AND c.event = 'offer_claim_tapped'
                         AND c.properties->>'trigger' = 'upgrade_popup' AND c.created_at <= p.created_at))
      ELSE
        (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'paywall_viewed' AND properties->>'source' = 'welcome_offer_' || m.moment)
      END AS paywall,
      CASE WHEN m.moment = 'upgrade_popup' THEN
        (SELECT count(DISTINCT p.user_id) FROM ev p WHERE p.event = 'purchase_completed'
           AND EXISTS (SELECT 1 FROM ev c WHERE c.user_id = p.user_id AND c.event = 'offer_claim_tapped'
                         AND c.properties->>'trigger' = 'upgrade_popup' AND c.created_at <= p.created_at))
      ELSE
        (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'purchase_completed' AND properties->>'source' = 'welcome_offer_' || m.moment)
      END AS bought
    FROM (VALUES ('assessment', 1), ('program_complete', 2), ('banner', 3), ('upgrade_popup', 4)) AS m(moment, ord)
  ),
  add_week AS (
    SELECT
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'add_week_locked_tapped') AS tapped,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'paywall_viewed' AND properties->>'source' LIKE 'add_week_%') AS paywall,
      (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'purchase_completed' AND properties->>'source' LIKE 'add_week_%') AS bought
  ),
  -- How it was paid. Google reports a code purchase as INTRO with the Play
  -- offer id in offer_code (ours end in "-code"); Apple reports offer codes
  -- as PROMOTIONAL with the code's name. The intro itself has no code on
  -- iOS and a "-intro" offer id on Android.
  store AS (
    SELECT event,
           CASE
             WHEN properties->>'period_type' = 'PROMOTIONAL'
               OR properties->>'offer_code' LIKE '%-code'
               OR (platform = 'ios' AND COALESCE(properties->>'offer_code', '') <> '') THEN 'CODE'
             WHEN properties->>'period_type' IN ('INTRO', 'TRIAL') THEN properties->>'period_type'
             WHEN properties->>'period_type' = 'NORMAL' THEN 'NORMAL'
             ELSE 'UNKNOWN'
           END AS period_type,
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
