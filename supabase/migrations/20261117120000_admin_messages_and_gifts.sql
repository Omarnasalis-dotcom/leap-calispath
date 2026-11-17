-- Admin messages and gifts (owner request 2026-11-17).
--
-- An admin writes a message in admin-web and sends it to a chosen audience:
--   news     : plain announcement (new feature, new update).
--   discount : carries a discount code; iOS and Android use different codes
--              (Apple offer code vs Leap promo code), each person gets theirs.
--   gift     : free access the person must tap to claim (owner decision). The
--              gifted time starts at the claim; unclaimed gifts lapse.
--
-- Everything is written through the existing notifications table, so pushes,
-- the app inbox and the opt-out all share one path. Delivery is the
-- send-admin-message Edge Function.
--
-- Owner rules:
--   * admin only.
--   * a person with an active store subscription is skipped for gifts and
--     discounts, and a gift never lowers a tier.
--   * gifts only go to app versions that can claim them (>= 1.2.20).
--   * opt-out: notification_preferences.prefs->>'admin_message' = 'false'.
--
-- Fan-out guardrail (2026-08-05 incident): the send only goes through when
-- the caller passes the exact recipient count the preview showed.

-- ── helpers ───────────────────────────────────────────────────────────────

-- '1.2.19' -> {1,2,19}, so versions compare as numbers, not text.
CREATE OR REPLACE FUNCTION public.app_version_key(p_version text)
RETURNS integer[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY(
    SELECT COALESCE(NULLIF(regexp_replace(s.part, '\D', '', 'g'), '')::integer, 0)
    FROM unnest(string_to_array(COALESCE(p_version, ''), '.')) WITH ORDINALITY AS s(part, n)
    ORDER BY s.n
  );
$$;

CREATE OR REPLACE FUNCTION public.subscription_tier_rank(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_tier WHEN 'first' THEN 1 WHEN 'pro' THEN 2 WHEN 'max' THEN 3 ELSE 0 END;
$$;

-- ── tables ────────────────────────────────────────────────────────────────

CREATE TABLE public.admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('news', 'gift', 'discount')),
  title_en text NOT NULL,
  body_en text NOT NULL,
  title_ar text,
  body_ar text,
  screen text,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  gift_tier text CHECK (gift_tier IN ('first', 'pro', 'max')),
  gift_days integer CHECK (gift_days BETWEEN 1 AND 366),
  gift_claim_by timestamptz,
  code_ios text,
  code_android text,
  is_test boolean NOT NULL DEFAULT false,
  target_count integer NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admins read through admin_get_messages; no direct client access.
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_messages FROM PUBLIC, anon, authenticated;

CREATE TABLE public.gift_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.admin_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('first', 'pro', 'max')),
  days integer NOT NULL CHECK (days BETWEEN 1 AND 366),
  claim_by timestamptz NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX gift_claims_user_id_idx ON public.gift_claims (user_id);

-- A person sees their own gifts; claiming is claim_gift only.
ALTER TABLE public.gift_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gift_claims TO authenticated;
CREATE POLICY "Users can read own gifts"
  ON public.gift_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.admin_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS push_ticket_id text,
  ADD COLUMN IF NOT EXISTS push_receipt text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_message_id_idx
  ON public.notifications (message_id) WHERE message_id IS NOT NULL;

-- ── gifts: one safe way to give access ────────────────────────────────────

-- Gives p_user_id access for p_duration. Returns the new end date, or NULL
-- when the person has an active store subscription (left untouched: the next
-- store renewal would overwrite the gift, and a lower gift tier would
-- downgrade them). While access is active the tier never goes down.
CREATE OR REPLACE FUNCTION public.apply_gift_access(p_user_id uuid, p_tier text, p_duration interval)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_profile RECORD;
  v_active boolean;
  v_tier text := p_tier;
  v_expires timestamptz;
BEGIN
  IF public.subscription_tier_rank(p_tier) = 0 THEN
    RAISE EXCEPTION 'INVALID_TIER';
  END IF;

  SELECT access_expires_at, subscription_tier, entitlement_source
  INTO v_profile
  FROM profiles WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  v_active := COALESCE(v_profile.access_expires_at > now(), false) AND v_profile.subscription_tier IS NOT NULL;

  IF v_active AND v_profile.entitlement_source = 'rc_subscription' THEN
    RETURN NULL;
  END IF;

  IF v_active AND public.subscription_tier_rank(v_profile.subscription_tier) > public.subscription_tier_rank(p_tier) THEN
    v_tier := v_profile.subscription_tier;
  END IF;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now()) + p_duration,
    entitlement_source = 'admin_grant',
    subscription_tier = v_tier,
    ai_coach_budget_usd = CASE v_tier WHEN 'first' THEN 1.00 WHEN 'pro' THEN 4.00 ELSE 10.00 END,
    entitlement_period_start = now()
  WHERE id = p_user_id
  RETURNING access_expires_at INTO v_expires;

  RETURN v_expires;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_gift_access(uuid, text, interval) FROM PUBLIC, anon, authenticated;

-- The admin user page's gift button: same signature, now through
-- apply_gift_access, plus 7 and 14 day gifts.
CREATE OR REPLACE FUNCTION public.admin_grant_access(p_user_id uuid, p_tier text, p_duration_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_duration interval;
  v_new_expires_at timestamptz;
BEGIN
  IF NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF public.subscription_tier_rank(p_tier) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIER');
  END IF;

  CASE p_duration_type
    WHEN '7day' THEN v_duration := interval '7 days';
    WHEN '14day' THEN v_duration := interval '14 days';
    WHEN '1month' THEN v_duration := interval '1 month';
    WHEN '3month' THEN v_duration := interval '3 months';
    WHEN '6month' THEN v_duration := interval '6 months';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_DURATION_TYPE');
  END CASE;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  v_new_expires_at := public.apply_gift_access(p_user_id, p_tier, v_duration);
  IF v_new_expires_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'HAS_ACTIVE_SUBSCRIPTION');
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (
    auth.uid(),
    'grant_access',
    p_user_id::text,
    jsonb_build_object('tier', p_tier, 'duration_type', p_duration_type, 'new_expires_at', v_new_expires_at)
  );

  RETURN jsonb_build_object(
    'success', true,
    'access_expires_at', v_new_expires_at,
    'tier', (SELECT subscription_tier FROM profiles WHERE id = p_user_id)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_grant_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_access(uuid, text, text) TO authenticated, service_role;

-- The person taps "Claim gift" in the app.
CREATE OR REPLACE FUNCTION public.claim_gift(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_claim RECORD;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_claim FROM gift_claims WHERE id = p_claim_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF v_claim.claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_CLAIMED');
  END IF;
  IF v_claim.claim_by <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EXPIRED');
  END IF;

  v_expires := public.apply_gift_access(v_uid, v_claim.tier, make_interval(days => v_claim.days));
  IF v_expires IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'HAS_ACTIVE_SUBSCRIPTION');
  END IF;

  UPDATE gift_claims SET claimed_at = now() WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tier', (SELECT subscription_tier FROM profiles WHERE id = v_uid),
    'days', v_claim.days,
    'access_expires_at', v_expires
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_gift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_gift(uuid) TO authenticated, service_role;

-- ── audience ──────────────────────────────────────────────────────────────

-- Everyone a message would reach. A row with skip_reason is someone the
-- filters matched but who is left out, so the preview can say why.
--
-- p_payload.audience keys (all optional, combined with AND):
--   user_ids[]         only these people
--   access             'free' | 'paid'
--   language           'en' | 'ar'
--   platform           'ios' | 'android'
--   version_below      last seen on an app version below this
--   version_at_least   last seen on this app version or newer
--   active_days        seen in the app within N days
--   inactive_days      not seen in the app for N days
--   min_tier, max_tier strength tier range
--   community_id, coach_id
--   push_only          only people who can get a push
CREATE OR REPLACE FUNCTION public.admin_message_audience(p_payload jsonb)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  language text,
  platform text,
  app_version text,
  has_push boolean,
  skip_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.admin_message_audience(jsonb) FROM PUBLIC, anon, authenticated;

-- Checks a message before preview or send. Returns an error code or NULL.
CREATE OR REPLACE FUNCTION public.admin_message_problem(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_kind text := p_payload->>'kind';
  v_title_en text := btrim(COALESCE(p_payload->>'title_en', ''));
  v_body_en text := btrim(COALESCE(p_payload->>'body_en', ''));
  v_title_ar text := btrim(COALESCE(p_payload->>'title_ar', ''));
  v_body_ar text := btrim(COALESCE(p_payload->>'body_ar', ''));
  v_screen text := NULLIF(p_payload->>'screen', '');
BEGIN
  IF v_kind IS NULL OR v_kind NOT IN ('news', 'gift', 'discount') THEN RETURN 'INVALID_KIND'; END IF;
  IF v_title_en = '' OR v_body_en = '' THEN RETURN 'TEXT_REQUIRED'; END IF;
  IF (v_title_ar = '') <> (v_body_ar = '') THEN RETURN 'ARABIC_INCOMPLETE'; END IF;
  IF char_length(v_title_en) > 80 OR char_length(v_title_ar) > 80 THEN RETURN 'TITLE_TOO_LONG'; END IF;
  IF char_length(v_body_en) > 400 OR char_length(v_body_ar) > 400 THEN RETURN 'BODY_TOO_LONG'; END IF;

  IF v_kind = 'news' AND v_screen IS NOT NULL AND v_screen NOT IN (
    'profile', 'training-center', 'my-journey', 'weekly-challenge', 'one-min-max', 'coach', 'paywall', 'redeem-code'
  ) THEN
    RETURN 'INVALID_SCREEN';
  END IF;

  IF v_kind = 'gift' THEN
    IF COALESCE(p_payload->>'gift_tier', '') NOT IN ('first', 'pro', 'max') THEN RETURN 'INVALID_TIER'; END IF;
    IF COALESCE((p_payload->>'gift_days')::integer, 0) NOT BETWEEN 1 AND 366 THEN RETURN 'INVALID_GIFT_DAYS'; END IF;
    IF COALESCE((p_payload->>'gift_claim_days')::integer, 14) NOT BETWEEN 1 AND 60 THEN RETURN 'INVALID_CLAIM_DAYS'; END IF;
  END IF;

  IF v_kind = 'discount' THEN
    IF btrim(COALESCE(p_payload->>'code_ios', '')) = '' AND btrim(COALESCE(p_payload->>'code_android', '')) = '' THEN
      RETURN 'CODE_REQUIRED';
    END IF;
    IF position('{code}' IN v_body_en) = 0 OR (v_body_ar <> '' AND position('{code}' IN v_body_ar) = 0) THEN
      RETURN 'CODE_PLACEHOLDER_MISSING';
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_message_problem(jsonb) FROM PUBLIC, anon, authenticated;

-- Read-only: who would get this message. Nothing is written.
CREATE OR REPLACE FUNCTION public.admin_preview_message_audience(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH aud AS (
    SELECT * FROM public.admin_message_audience(p_payload)
  ),
  targets AS (
    SELECT * FROM aud WHERE skip_reason IS NULL
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM targets),
    'with_push', (SELECT count(*) FROM targets WHERE has_push),
    'english', (SELECT count(*) FROM targets WHERE language IS DISTINCT FROM 'ar'),
    'arabic', (SELECT count(*) FROM targets WHERE language = 'ar'),
    'ios', (SELECT count(*) FROM targets WHERE platform = 'ios'),
    'android', (SELECT count(*) FROM targets WHERE platform = 'android'),
    'skipped', COALESCE((
      SELECT jsonb_object_agg(s.skip_reason, s.n)
      FROM (SELECT skip_reason, count(*) AS n FROM aud WHERE skip_reason IS NOT NULL GROUP BY skip_reason) s
    ), '{}'::jsonb),
    'sample', COALESCE((
      SELECT jsonb_agg(t.display_name)
      FROM (SELECT display_name FROM targets ORDER BY display_name LIMIT 12) t
    ), '[]'::jsonb),
    'problem', public.admin_message_problem(p_payload)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_preview_message_audience(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_message_audience(jsonb) TO authenticated, service_role;

-- ── send ──────────────────────────────────────────────────────────────────

-- Writes the message, one inbox row per person in their language, and the
-- gift claims. The pushes go out when send-admin-message is called with the
-- returned message_id. p_confirm_count must equal the recipient count right
-- now, so what was previewed is what gets sent.
CREATE OR REPLACE FUNCTION public.admin_send_message(p_payload jsonb, p_confirm_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c_max_recipients CONSTANT integer := 5000;
  v_uid uuid := auth.uid();
  v_problem text;
  v_kind text := p_payload->>'kind';
  v_title_en text := btrim(COALESCE(p_payload->>'title_en', ''));
  v_body_en text := btrim(COALESCE(p_payload->>'body_en', ''));
  v_title_ar text := NULLIF(btrim(COALESCE(p_payload->>'title_ar', '')), '');
  v_body_ar text := NULLIF(btrim(COALESCE(p_payload->>'body_ar', '')), '');
  v_screen text := NULLIF(p_payload->>'screen', '');
  v_audience jsonb := COALESCE(p_payload->'audience', '{}'::jsonb);
  v_code_ios text := NULLIF(btrim(COALESCE(p_payload->>'code_ios', '')), '');
  v_code_android text := NULLIF(btrim(COALESCE(p_payload->>'code_android', '')), '');
  v_gift_tier text;
  v_gift_days integer;
  v_claim_by timestamptz;
  v_count integer;
  v_is_test boolean;
  v_message_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  v_problem := public.admin_message_problem(p_payload);
  IF v_problem IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_problem);
  END IF;

  IF v_kind = 'gift' THEN
    v_gift_tier := p_payload->>'gift_tier';
    v_gift_days := (p_payload->>'gift_days')::integer;
    v_claim_by := now() + make_interval(days => COALESCE((p_payload->>'gift_claim_days')::integer, 14));
    -- The inbox screen (app 1.2.20+), where the gift card is claimed.
    v_screen := 'notifications';
  ELSIF v_kind = 'discount' THEN
    v_screen := 'redeem-code';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.admin_message_audience(p_payload) a
  WHERE a.skip_reason IS NULL;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_RECIPIENTS');
  END IF;
  IF v_count > c_max_recipients THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_RECIPIENTS', 'count', v_count);
  END IF;
  IF p_confirm_count IS DISTINCT FROM v_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'COUNT_CHANGED', 'count', v_count);
  END IF;

  -- A double click or a retry must not send the same message twice.
  IF EXISTS (
    SELECT 1 FROM admin_messages m
    WHERE m.created_by = v_uid
      AND m.created_at > now() - interval '10 minutes'
      AND m.kind = v_kind AND m.title_en = v_title_en AND m.body_en = v_body_en
      AND m.audience = v_audience
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_SEND');
  END IF;

  -- One fixed list for the inbox rows and the gift claims. Every refusal
  -- above returns before this exists; a count that moved in between aborts.
  CREATE TEMP TABLE _admin_message_targets ON COMMIT DROP AS
    SELECT a.user_id, a.language, a.platform
    FROM public.admin_message_audience(p_payload) a
    WHERE a.skip_reason IS NULL;
  IF (SELECT count(*) FROM _admin_message_targets) <> v_count THEN
    RAISE EXCEPTION 'COUNT_CHANGED';
  END IF;

  v_is_test := COALESCE((v_audience->'user_ids') = jsonb_build_array(v_uid::text), false);

  INSERT INTO admin_messages (
    kind, title_en, body_en, title_ar, body_ar, screen, audience,
    gift_tier, gift_days, gift_claim_by, code_ios, code_android,
    is_test, target_count, created_by
  )
  VALUES (
    v_kind, v_title_en, v_body_en, v_title_ar, v_body_ar, v_screen, v_audience,
    v_gift_tier, v_gift_days, v_claim_by, v_code_ios, v_code_android,
    v_is_test, v_count, v_uid
  )
  RETURNING id INTO v_message_id;

  IF v_kind = 'gift' THEN
    INSERT INTO gift_claims (message_id, user_id, tier, days, claim_by)
    SELECT v_message_id, t.user_id, v_gift_tier, v_gift_days, v_claim_by
    FROM _admin_message_targets t;
  END IF;

  -- data: every string field is passed to the opened screen as a query
  -- param by the app's tap handler (app/_layout.tsx).
  INSERT INTO notifications (user_id, type, title, body, data, message_id)
  SELECT
    t.user_id,
    'admin_message',
    CASE WHEN t.language = 'ar' AND v_title_ar IS NOT NULL THEN v_title_ar ELSE v_title_en END,
    replace(
      CASE WHEN t.language = 'ar' AND v_body_ar IS NOT NULL THEN v_body_ar ELSE v_body_en END,
      '{code}',
      COALESCE(CASE t.platform WHEN 'ios' THEN v_code_ios WHEN 'android' THEN v_code_android END, '')
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'message_id', v_message_id::text,
      'kind', v_kind,
      'screen', v_screen,
      'code', CASE WHEN v_kind = 'discount'
        THEN CASE t.platform WHEN 'ios' THEN v_code_ios WHEN 'android' THEN v_code_android END END,
      'claim_id', (SELECT g.id::text FROM gift_claims g WHERE g.message_id = v_message_id AND g.user_id = t.user_id),
      'gift_tier', v_gift_tier,
      'gift_days', v_gift_days
    )),
    v_message_id
  FROM _admin_message_targets t;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (
    v_uid, 'send_message', v_message_id::text,
    jsonb_build_object('kind', v_kind, 'title', v_title_en, 'count', v_count, 'audience', v_audience, 'is_test', v_is_test)
  );

  DROP TABLE _admin_message_targets;

  RETURN jsonb_build_object('ok', true, 'message_id', v_message_id, 'count', v_count);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_send_message(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_send_message(jsonb, integer) TO authenticated, service_role;

-- ── delivery (send-admin-message Edge Function, service role only) ────────

-- Takes up to p_limit unsent rows of a message and marks them sent, so two
-- calls can never push the same row.
CREATE OR REPLACE FUNCTION public.admin_message_claim_pending(p_message_id uuid, p_limit integer)
RETURNS TABLE (id uuid, user_id uuid, title text, body text, data jsonb, push_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT n.id
    FROM notifications n
    WHERE n.message_id = p_message_id AND n.push_sent_at IS NULL AND n.push_error IS NULL
    ORDER BY n.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE notifications n
    SET push_sent_at = now()
    FROM picked
    WHERE n.id = picked.id
    RETURNING n.id, n.user_id, n.title, n.body, n.data
  )
  SELECT c.id, c.user_id, c.title, c.body, c.data, p.push_token
  FROM claimed c
  JOIN profiles p ON p.id = c.user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_message_claim_pending(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_message_claim_pending(uuid, integer) TO service_role;

-- Saves push results for a batch: [{id, ticket_id?, error?, receipt?}].
-- A token Expo reports as gone is cleared.
CREATE OR REPLACE FUNCTION public.admin_message_record_push(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE notifications n
  SET push_ticket_id = COALESCE(r.ticket_id, n.push_ticket_id),
      push_error = COALESCE(r.error, n.push_error),
      -- Same as the other senders: a row that failed is not "sent".
      push_sent_at = CASE WHEN r.error IS NOT NULL THEN NULL ELSE n.push_sent_at END,
      push_receipt = COALESCE(r.receipt, n.push_receipt)
  FROM jsonb_to_recordset(p_rows) AS r(id uuid, ticket_id text, error text, receipt text)
  WHERE n.id = r.id AND n.message_id IS NOT NULL;

  UPDATE profiles p
  SET push_token = NULL
  FROM jsonb_to_recordset(p_rows) AS r(id uuid, ticket_id text, error text, receipt text)
  JOIN notifications n ON n.id = r.id
  WHERE p.id = n.user_id
    AND n.message_id IS NOT NULL
    AND (r.error = 'DeviceNotRegistered' OR r.receipt = 'DeviceNotRegistered');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_message_record_push(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_message_record_push(jsonb) TO service_role;

-- ── history ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_messages(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      m.id, m.kind, m.title_en, m.body_en, m.title_ar, m.body_ar, m.screen, m.audience,
      m.gift_tier, m.gift_days, m.gift_claim_by, m.code_ios, m.code_android,
      m.is_test, m.target_count, m.created_at,
      COALESCE(NULLIF(c.display_name, ''), c.email) AS created_by_name,
      s.*,
      (SELECT count(*) FROM gift_claims g WHERE g.message_id = m.id AND g.claimed_at IS NOT NULL) AS claimed,
      (SELECT count(DISTINCT e.user_id)
         FROM app_events e
         JOIN notifications n ON n.user_id = e.user_id AND n.message_id = m.id
        WHERE e.event = 'store_purchase'
          AND e.created_at >= m.created_at
          AND e.created_at < m.created_at + interval '14 days') AS purchased
    FROM admin_messages m
    LEFT JOIN profiles c ON c.id = m.created_by
    CROSS JOIN LATERAL (
      SELECT
        count(*) AS recipients,
        count(*) FILTER (WHERE n.push_sent_at IS NULL AND n.push_error IS NULL) AS pending,
        count(*) FILTER (WHERE n.push_sent_at IS NOT NULL AND n.push_error IS NULL) AS pushed,
        count(*) FILTER (WHERE n.push_error = 'NO_TOKEN') AS no_token,
        count(*) FILTER (WHERE n.push_error IS NOT NULL AND n.push_error <> 'NO_TOKEN') AS failed,
        count(*) FILTER (WHERE n.push_receipt = 'ok') AS delivered,
        count(*) FILTER (WHERE n.push_ticket_id IS NOT NULL AND n.push_receipt IS NULL AND n.push_error IS NULL) AS receipts_pending,
        count(*) FILTER (WHERE n.opened_at IS NOT NULL OR n.read_at IS NOT NULL) AS opened
      FROM notifications n WHERE n.message_id = m.id
    ) s
    ORDER BY m.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  ) x;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_messages(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_messages(integer) TO authenticated, service_role;
