-- Promo codes for Android (Settings → Redeem a Code).
--
-- Google Play promo codes can only give a free trial, so a "38% off" code is
-- a Leap code instead: an admin creates it here, the app sends it to
-- claim_promo_code, and the server answers with the Play offer to buy. The
-- offers exist in Play with eligibility "Developer determined" and the tag
-- rc-ignore-offer, so nobody gets them without a code. iOS keeps Apple's own
-- offer codes (App Store Connect), so codes here are Android only.
-- Plan: docs/features/PRICING_AND_FIRST_TIME_OFFER_PLAN.md.
--
-- Tables have no client grants at all; everything goes through the RPCs.

CREATE TABLE public.promo_codes (
  -- Stored uppercase; the app uppercases what people type.
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{3,32}$'),
  platform text NOT NULL DEFAULT 'android' CHECK (platform = 'android'),
  -- RevenueCat's Play product id "<subscription>:<base plan>" and the Play
  -- offer id on that base plan.
  product_id text NOT NULL CHECK (product_id ~ '^[a-z0-9_.]+:[a-z0-9-]+$'),
  offer_id text NOT NULL CHECK (offer_id ~ '^[a-z0-9-]{1,63}$'),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  -- How many different people can claim it; null = no limit.
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  -- Only people who never had a paid plan (access_expires_at never set).
  new_customers_only boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- One claim per person per code; claiming again is free (same answer).
-- purchased_at is reported by the app after Google confirms the purchase:
-- for stats only, never for access (access comes from the RevenueCat webhook).
CREATE TABLE public.promo_code_redemptions (
  code text NOT NULL REFERENCES public.promo_codes(code) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  purchased_at timestamptz,
  PRIMARY KEY (code, user_id)
);

-- Every attempt, right or wrong, to stop guessing (10 per hour per person).
CREATE TABLE public.promo_code_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  ok boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_code_attempts_user_time_idx ON public.promo_code_attempts (user_id, created_at);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.promo_codes, public.promo_code_redemptions, public.promo_code_attempts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.promo_codes, public.promo_code_redemptions, public.promo_code_attempts
  TO service_role;

-- ── claim_promo_code ──────────────────────────────────────────────────────
-- Returns {ok: true, product_id, offer_id} or {ok: false, error}. It returns
-- instead of raising so the attempt row survives (a RAISE would roll it back).
-- Errors: NOT_SIGNED_IN, TOO_MANY_ATTEMPTS, INVALID_CODE, CODE_EXPIRED,
-- CODE_USED_UP, ALREADY_SUBSCRIBED, NEW_CUSTOMERS_ONLY.
CREATE FUNCTION public.claim_promo_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v_row promo_codes%ROWTYPE;
  v_expires timestamptz;
  v_error text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_SIGNED_IN');
  END IF;

  IF (SELECT count(*) FROM promo_code_attempts
      WHERE user_id = v_uid AND created_at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_ATTEMPTS');
  END IF;

  -- Lock the code row so two last-slot claims can't both pass the limit.
  SELECT * INTO v_row FROM promo_codes WHERE code = v_code FOR UPDATE;
  SELECT access_expires_at INTO v_expires FROM profiles WHERE id = v_uid;

  IF v_row.code IS NULL OR NOT v_row.is_active OR v_row.starts_at > now() THEN
    v_error := 'INVALID_CODE';
  ELSIF v_row.ends_at IS NOT NULL AND v_row.ends_at <= now() THEN
    v_error := 'CODE_EXPIRED';
  ELSIF v_expires IS NOT NULL AND v_expires > now() THEN
    v_error := 'ALREADY_SUBSCRIBED';
  ELSIF v_row.new_customers_only AND v_expires IS NOT NULL THEN
    v_error := 'NEW_CUSTOMERS_ONLY';
  ELSIF v_row.max_redemptions IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM promo_code_redemptions WHERE code = v_code AND user_id = v_uid)
    AND (SELECT count(*) FROM promo_code_redemptions WHERE code = v_code) >= v_row.max_redemptions THEN
    v_error := 'CODE_USED_UP';
  END IF;

  INSERT INTO promo_code_attempts (user_id, code, ok)
  VALUES (v_uid, left(v_code, 64), v_error IS NULL);

  IF v_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_error);
  END IF;

  INSERT INTO promo_code_redemptions (code, user_id) VALUES (v_code, v_uid)
  ON CONFLICT (code, user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'code', v_code,
    'product_id', v_row.product_id, 'offer_id', v_row.offer_id);
END;
$function$;

-- Stats only: the app calls this after Google confirms the purchase.
CREATE FUNCTION public.mark_promo_code_purchased(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE promo_code_redemptions
  SET purchased_at = COALESCE(purchased_at, now())
  WHERE code = upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g')) AND user_id = auth.uid();
END;
$function$;

-- ── Admin ─────────────────────────────────────────────────────────────────
CREATE FUNCTION public.admin_get_promo_codes()
RETURNS TABLE (code text, product_id text, offer_id text, label text, max_redemptions integer,
  new_customers_only boolean, starts_at timestamptz, ends_at timestamptz, is_active boolean,
  created_at timestamptz, claimed_count bigint, purchased_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN QUERY
  SELECT c.code, c.product_id, c.offer_id, c.label, c.max_redemptions, c.new_customers_only,
    c.starts_at, c.ends_at, c.is_active, c.created_at,
    (SELECT count(*) FROM promo_code_redemptions r WHERE r.code = c.code),
    (SELECT count(*) FROM promo_code_redemptions r WHERE r.code = c.code AND r.purchased_at IS NOT NULL)
  FROM promo_codes c
  ORDER BY c.created_at DESC;
END;
$function$;

-- Create (p_create = true) or edit a code. The code itself and its offer
-- can't change once someone claimed it; switch is_active off instead.
CREATE FUNCTION public.admin_upsert_promo_code(
  p_create boolean,
  p_code text,
  p_product_id text,
  p_offer_id text,
  p_label text,
  p_max_redemptions integer,
  p_new_customers_only boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v_existing promo_codes%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_code !~ '^[A-Z0-9]{3,32}$' THEN
    RAISE EXCEPTION 'INVALID_CODE_FORMAT';
  END IF;
  IF COALESCE(p_product_id, '') !~ '^[a-z0-9_.]+:[a-z0-9-]+$' OR COALESCE(p_offer_id, '') !~ '^[a-z0-9-]{1,63}$' THEN
    RAISE EXCEPTION 'INVALID_OFFER';
  END IF;
  IF p_max_redemptions IS NOT NULL AND p_max_redemptions < 1 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= COALESCE(p_starts_at, now()) THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF p_create THEN
    IF EXISTS (SELECT 1 FROM promo_codes WHERE code = v_code) THEN
      RAISE EXCEPTION 'CODE_EXISTS';
    END IF;
    INSERT INTO promo_codes (code, product_id, offer_id, label, max_redemptions,
      new_customers_only, starts_at, ends_at, is_active, created_by)
    VALUES (v_code, p_product_id, p_offer_id, left(COALESCE(btrim(p_label), ''), 80), p_max_redemptions,
      COALESCE(p_new_customers_only, true), COALESCE(p_starts_at, now()), p_ends_at,
      COALESCE(p_is_active, true), auth.uid());
  ELSE
    SELECT * INTO v_existing FROM promo_codes WHERE code = v_code FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    IF EXISTS (SELECT 1 FROM promo_code_redemptions WHERE code = v_code)
      AND (v_existing.product_id IS DISTINCT FROM p_product_id OR v_existing.offer_id IS DISTINCT FROM p_offer_id) THEN
      RAISE EXCEPTION 'CODE_LOCKED';
    END IF;
    UPDATE promo_codes
    SET product_id = p_product_id, offer_id = p_offer_id, label = left(COALESCE(btrim(p_label), ''), 80),
        max_redemptions = p_max_redemptions, new_customers_only = COALESCE(p_new_customers_only, true),
        starts_at = COALESCE(p_starts_at, starts_at), ends_at = p_ends_at,
        is_active = COALESCE(p_is_active, is_active), updated_at = now()
    WHERE code = v_code;
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), CASE WHEN p_create THEN 'promo_code_create' ELSE 'promo_code_update' END, v_code,
          jsonb_build_object('product_id', p_product_id, 'offer_id', p_offer_id,
            'max_redemptions', p_max_redemptions, 'is_active', p_is_active));
  RETURN v_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION
  public.claim_promo_code(text),
  public.mark_promo_code_purchased(text),
  public.admin_get_promo_codes(),
  public.admin_upsert_promo_code(boolean, text, text, text, text, integer, boolean, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.claim_promo_code(text),
  public.mark_promo_code_purchased(text),
  public.admin_get_promo_codes(),
  public.admin_upsert_promo_code(boolean, text, text, text, text, integer, boolean, timestamptz, timestamptz, boolean)
  TO authenticated, service_role;
