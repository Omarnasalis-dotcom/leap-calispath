-- Gifts review fixes (owner, 2026-11-18).
--
-- 1. apply_revenuecat_entitlement: a store event saying an old subscription
--    is over no longer ends a gift that is still running (outcome
--    'kept_gift'). Live prod definition with only that guard added.
-- 2. admin_message_audience: discount messages skip anyone with a plan
--    running (gift or grant), not only store subscribers ('has_access').
--    Live prod definition with that one case added.
-- 3. Admin alert when someone finishes the free program and skips the
--    intro offer (trigger on app_events).

ALTER TABLE public.rc_webhook_events DROP CONSTRAINT rc_webhook_events_outcome_check;
ALTER TABLE public.rc_webhook_events
  ADD CONSTRAINT rc_webhook_events_outcome_check CHECK (outcome = ANY (ARRAY['applied'::text, 'stale'::text, 'kept_gift'::text]));

-- 1.
CREATE OR REPLACE FUNCTION public.apply_revenuecat_entitlement(p_user_id uuid, p_expires_at timestamp with time zone, p_source text, p_original_transaction_id text DEFAULT NULL::text, p_tier text DEFAULT NULL::text, p_budget_usd numeric DEFAULT NULL::numeric, p_is_new_period boolean DEFAULT false, p_event_id text DEFAULT NULL::text, p_event_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
  v_last_event_at timestamptz;
  v_current RECORD;
  v_outcome text;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_tier IS NOT NULL AND p_tier NOT IN ('first', 'pro', 'max') THEN
    RAISE EXCEPTION 'INVALID_TIER: %', p_tier;
  END IF;

  -- Webhook dedupe + ordering (2026-09-27, audit M23). Only when the caller
  -- passes the RevenueCat event id (revenuecat-webhook); confirm-entitlement
  -- reads live state from RevenueCat's API and never passes it, so it is
  -- unaffected. Everything below runs in this function's one transaction:
  -- if applying fails, the event is not recorded and RevenueCat's retry is
  -- processed normally.
  IF p_event_id IS NOT NULL THEN
    IF p_original_transaction_id IS NOT NULL THEN
      -- Row lock serializes concurrent deliveries for the same subscription.
      INSERT INTO rc_transaction_periods (rc_original_transaction_id, period_start)
      VALUES (p_original_transaction_id, now())
      ON CONFLICT (rc_original_transaction_id) DO NOTHING;
      SELECT last_event_at INTO v_last_event_at
      FROM rc_transaction_periods
      WHERE rc_original_transaction_id = p_original_transaction_id
      FOR UPDATE;
    END IF;

    -- RevenueCat redelivers an event (same id) when a delivery looked failed.
    IF EXISTS (SELECT 1 FROM rc_webhook_events WHERE event_id = p_event_id) THEN
      RETURN 'duplicate';
    END IF;

    -- Deliveries aren't ordered: never let an older event overwrite the
    -- result of a newer one for the same subscription (e.g. a late renewal
    -- shortening access, or a stale event for a transferred subscription
    -- revoking its new owner below).
    IF v_last_event_at IS NOT NULL AND p_event_at IS NOT NULL AND p_event_at < v_last_event_at THEN
      INSERT INTO rc_webhook_events (event_id, app_user_id, original_transaction_id, event_at, outcome)
      VALUES (p_event_id, p_user_id, p_original_transaction_id, p_event_at, 'stale');
      RETURN 'stale';
    END IF;
  END IF;

  IF p_original_transaction_id IS NOT NULL THEN
    UPDATE profiles
    SET access_expires_at = now()
    WHERE id <> p_user_id
      AND rc_original_transaction_id = p_original_transaction_id
      AND entitlement_source = 'rc_subscription'
      AND access_expires_at > now();

    -- A genuinely different real transaction landing on an account that
    -- already had an active one (different rc_original_transaction_id,
    -- still-active) means two separate store subscriptions are now both
    -- billing on the same account — almost always someone paying with a
    -- different Apple ID/Google account than before, not intentional
    -- double-billing. Flag it for the app to warn about and for admin-web
    -- to see; don't touch access/tier here beyond the normal grant below.
    SELECT rc_original_transaction_id, entitlement_source, access_expires_at
    INTO v_existing
    FROM profiles WHERE id = p_user_id;

    IF v_existing.rc_original_transaction_id IS NOT NULL
       AND v_existing.rc_original_transaction_id <> p_original_transaction_id
       AND v_existing.entitlement_source = 'rc_subscription'
       AND v_existing.access_expires_at > now()
    THEN
      UPDATE profiles
      SET duplicate_subscription_flagged_at = now(),
          duplicate_subscription_previous_transaction_id = v_existing.rc_original_transaction_id
      WHERE id = p_user_id;
    END IF;

    -- Reclaim usage history orphaned by a deleted account that previously
    -- held this same real subscription — closes the "delete, recreate,
    -- restore" usage-reset loophole.
    UPDATE ai_coach_requests
    SET user_id = p_user_id
    WHERE rc_original_transaction_id = p_original_transaction_id
      AND user_id IS NULL;

    INSERT INTO rc_transaction_periods (rc_original_transaction_id, period_start)
    VALUES (p_original_transaction_id, now())
    ON CONFLICT (rc_original_transaction_id) DO UPDATE
      SET period_start = CASE WHEN p_is_new_period THEN now() ELSE rc_transaction_periods.period_start END,
          updated_at = now();
  END IF;

  -- A gift (or any non-store grant) that is still running is not ended by
  -- a store event saying an OLD subscription is over (a late EXPIRATION after
  -- billing retry, a refund of an earlier purchase). The store id is still
  -- remembered: this person has bought before. (2026-11-18 gifts review)
  SELECT entitlement_source, access_expires_at INTO v_current FROM profiles WHERE id = p_user_id;
  IF v_current.entitlement_source IS DISTINCT FROM 'rc_subscription'
     AND v_current.access_expires_at > now()
     AND p_expires_at <= now()
  THEN
    UPDATE profiles
    SET rc_original_transaction_id = COALESCE(p_original_transaction_id, rc_original_transaction_id)
    WHERE id = p_user_id;
    v_outcome := 'kept_gift';
  ELSE
    UPDATE profiles
    SET
      access_granted_at = COALESCE(access_granted_at, now()),
      access_expires_at = p_expires_at,
      entitlement_source = p_source,
      rc_original_transaction_id = COALESCE(p_original_transaction_id, rc_original_transaction_id),
      subscription_tier = COALESCE(p_tier, subscription_tier),
      ai_coach_budget_usd = COALESCE(p_budget_usd, ai_coach_budget_usd),
      entitlement_period_start = CASE
        WHEN p_original_transaction_id IS NOT NULL THEN
          (SELECT period_start FROM rc_transaction_periods WHERE rc_original_transaction_id = p_original_transaction_id)
        WHEN p_is_new_period THEN now()
        ELSE COALESCE(entitlement_period_start, now())
      END
    WHERE id = p_user_id;
    v_outcome := 'applied';
  END IF;

  IF p_event_id IS NOT NULL THEN
    IF p_original_transaction_id IS NOT NULL AND p_event_at IS NOT NULL THEN
      UPDATE rc_transaction_periods
      SET last_event_at = GREATEST(COALESCE(last_event_at, p_event_at), p_event_at)
      WHERE rc_original_transaction_id = p_original_transaction_id;
    END IF;
    INSERT INTO rc_webhook_events (event_id, app_user_id, original_transaction_id, event_at, outcome)
    VALUES (p_event_id, p_user_id, p_original_transaction_id, p_event_at, v_outcome)
    ON CONFLICT (event_id) DO NOTHING;
  END IF;

  RETURN v_outcome;
END;
$function$;

-- 2.
CREATE OR REPLACE FUNCTION public.admin_message_audience(p_payload jsonb)
 RETURNS TABLE(user_id uuid, display_name text, language text, platform text, app_version text, has_push boolean, skip_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- First app version with the gift claim screen.
  c_gift_min_version CONSTANT text := '1.2.20';
  v_kind text := p_payload->>'kind';
  a jsonb := COALESCE(p_payload->'audience', '{}'::jsonb);
  v_user_ids uuid[];
  v_code_ios text := NULLIF(btrim(COALESCE(p_payload->>'code_ios', '')), '');
  v_code_android text := NULLIF(btrim(COALESCE(p_payload->>'code_android', '')), '');
BEGIN
  IF jsonb_typeof(a->'user_ids') = 'array' THEN
    SELECT array_agg(x::uuid) INTO v_user_ids FROM jsonb_array_elements_text(a->'user_ids') AS x;
    v_user_ids := COALESCE(v_user_ids, ARRAY[]::uuid[]);
  END IF;

  RETURN QUERY
  WITH last_seen AS (
    SELECT DISTINCT ON (e.user_id) e.user_id AS uid, e.platform AS plat, e.app_version AS ver
    FROM app_events e
    WHERE e.user_id IS NOT NULL AND e.app_version IS NOT NULL AND e.platform IN ('ios', 'android')
    ORDER BY e.user_id, e.created_at DESC
  ),
  activity AS (
    SELECT e.user_id AS uid, max(e.created_at) AS seen_at
    FROM app_events e WHERE e.user_id IS NOT NULL GROUP BY e.user_id
  ),
  base AS (
    SELECT
      p.id,
      COALESCE(NULLIF(p.display_name, ''), p.email) AS name,
      p.language AS lang,
      l.plat,
      l.ver,
      p.push_token IS NOT NULL AS can_push,
      COALESCE(p.access_expires_at > now(), false) AND p.subscription_tier IS NOT NULL AS is_paid,
      p.entitlement_source,
      COALESCE(p.is_admin, false) OR COALESCE(p.is_coach, false) AS is_staff,
      GREATEST(act.seen_at, p.last_active) AS seen_at
    FROM profiles p
    LEFT JOIN last_seen l ON l.uid = p.id
    LEFT JOIN activity act ON act.uid = p.id
    WHERE p.id NOT IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
      AND (v_user_ids IS NULL OR p.id = ANY (v_user_ids))
      -- Store test and reviewer accounts only when named.
      AND (v_user_ids IS NOT NULL
           OR NOT EXISTS (SELECT 1 FROM analytics_store_test_users s WHERE s.user_id = p.id))
      AND (a->>'language' IS NULL OR p.language = a->>'language')
      AND (a->>'min_tier' IS NULL OR COALESCE(p.strength_tier, 0) >= (a->>'min_tier')::integer)
      AND (a->>'max_tier' IS NULL OR COALESCE(p.strength_tier, 0) <= (a->>'max_tier')::integer)
      AND (a->>'community_id' IS NULL OR p.community_id = (a->>'community_id')::uuid)
      AND (a->>'coach_id' IS NULL OR p.coach_id = (a->>'coach_id')::uuid)
      AND (COALESCE((a->>'push_only')::boolean, false) = false OR p.push_token IS NOT NULL)
  )
  SELECT
    b.id, b.name, b.lang, b.plat, b.ver, b.can_push,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM notification_preferences np
        WHERE np.user_id = b.id AND np.prefs->>'admin_message' = 'false'
      ) THEN 'opted_out'
      WHEN v_kind IN ('gift', 'discount') AND b.is_paid AND b.entitlement_source = 'rc_subscription'
        THEN 'has_subscription'
      -- A discount code is refused while any plan is running (claim_promo_code
      -- on Android; on iPhone buying would end the gift), so skip them too.
      WHEN v_kind = 'discount' AND b.is_paid THEN 'has_access'
      -- Coaches and admins already have full access; a named one (a test
      -- send to yourself) still gets the gift so it can be tried.
      WHEN v_kind = 'gift' AND b.is_staff AND v_user_ids IS NULL THEN 'staff'
      WHEN v_kind = 'gift' AND (b.ver IS NULL
        OR public.app_version_key(b.ver) < public.app_version_key(c_gift_min_version)) THEN 'old_app'
      WHEN v_kind = 'discount' AND b.plat IS NULL THEN 'no_platform'
      WHEN v_kind = 'discount' AND b.plat = 'ios' AND v_code_ios IS NULL THEN 'no_code'
      WHEN v_kind = 'discount' AND b.plat = 'android' AND v_code_android IS NULL THEN 'no_code'
    END
  FROM base b
  WHERE (a->>'access' IS NULL
         OR (a->>'access' = 'paid' AND b.is_paid)
         OR (a->>'access' = 'free' AND NOT b.is_paid))
    AND (a->>'platform' IS NULL OR b.plat = a->>'platform')
    AND (a->>'version_below' IS NULL
         OR (b.ver IS NOT NULL AND public.app_version_key(b.ver) < public.app_version_key(a->>'version_below')))
    AND (a->>'version_at_least' IS NULL
         OR (b.ver IS NOT NULL AND public.app_version_key(b.ver) >= public.app_version_key(a->>'version_at_least')))
    AND (a->>'active_days' IS NULL
         OR b.seen_at >= now() - make_interval(days => (a->>'active_days')::integer))
    AND (a->>'inactive_days' IS NULL
         OR b.seen_at IS NULL
         OR b.seen_at < now() - make_interval(days => (a->>'inactive_days')::integer));
END;
$function$;

-- 3. Tell the admins when someone finishes the free program and skips the
--    intro offer (closes the offer screen, or opens the plans and closes
--    them), so they can send a gift. The app already logs both moments, so
--    this works on every app version. Once per person; never fails the
--    analytics insert.
CREATE OR REPLACE FUNCTION public.notify_admins_free_program_offer_skipped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile RECORD;
  v_ready boolean;
  v_had_plan boolean;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT ((NEW.event = 'offer_dismissed' AND NEW.properties->>'trigger' = 'program_complete')
       OR (NEW.event = 'purchase_cancelled' AND NEW.properties->>'source' = 'welcome_offer_program_complete')) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE type = 'free_program_offer_skipped' AND data->>'user_id' = NEW.user_id::text
  ) THEN
    RETURN NEW;
  END IF;

  SELECT display_name, email, access_expires_at, rc_original_transaction_id, is_admin, is_coach
  INTO v_profile
  FROM profiles WHERE id = NEW.user_id;
  IF NOT FOUND OR COALESCE(v_profile.is_admin, false) OR COALESCE(v_profile.is_coach, false) THEN
    RETURN NEW;
  END IF;
  -- Bought since, or has a plan running: nothing to win back.
  IF v_profile.rc_original_transaction_id IS NOT NULL OR v_profile.access_expires_at > now() THEN
    RETURN NEW;
  END IF;

  v_ready := public.app_version_key(NEW.app_version) >= public.app_version_key('1.2.20');
  v_had_plan := v_profile.access_expires_at IS NOT NULL;

  PERFORM public.notify_admins(
    'free_program_offer_skipped',
    'Skipped the offer after the free program',
    format(
      '%s finished the free program and skipped the intro offer (app %s, %s). %s%s',
      COALESCE(NULLIF(v_profile.display_name, ''), v_profile.email, 'Someone'),
      COALESCE(NEW.app_version, '?'),
      COALESCE(NEW.platform, '?'),
      CASE WHEN v_ready
        THEN 'Send a gift from Messages, or use the 7-day button on their page.'
        ELSE 'App too old to claim a Messages gift: use the 7-day button on their page.' END,
      CASE WHEN v_had_plan THEN ' Had a gift or plan before.' ELSE '' END
    ),
    jsonb_build_object('user_id', NEW.user_id::text, 'app_version', NEW.app_version, 'platform', NEW.platform)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_free_program_offer_skipped: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_admins_free_program_offer_skipped() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_events_free_program_offer_skipped ON public.app_events;
CREATE TRIGGER app_events_free_program_offer_skipped
  AFTER INSERT ON public.app_events
  FOR EACH ROW
  WHEN (NEW.event IN ('offer_dismissed', 'purchase_cancelled'))
  EXECUTE FUNCTION public.notify_admins_free_program_offer_skipped();
