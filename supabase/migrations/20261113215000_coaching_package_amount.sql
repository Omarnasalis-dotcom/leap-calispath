-- Coaching packages: what the client paid (owner request 2026-11-13), for an
-- online-coaching revenue chart later. Optional amount + currency per package
-- (a renewal is its own row, so each payment is counted once).

ALTER TABLE public.coaching_packages
  ADD COLUMN IF NOT EXISTS amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EGP';

ALTER TABLE public.coaching_packages
  DROP CONSTRAINT IF EXISTS coaching_packages_amount_check,
  ADD CONSTRAINT coaching_packages_amount_check CHECK (amount IS NULL OR (amount >= 0 AND amount <= 10000000)),
  DROP CONSTRAINT IF EXISTS coaching_packages_currency_check,
  ADD CONSTRAINT coaching_packages_currency_check CHECK (currency ~ '^[A-Z]{3}$');

-- New parameters: drop the old signature so there's one function, not two.
DROP FUNCTION IF EXISTS public.set_coaching_package(uuid, uuid, date, date, text, uuid);

CREATE FUNCTION public.set_coaching_package(
  p_coach_id uuid,
  p_warrior_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_note text DEFAULT NULL,
  p_package_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT 'EGP'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_currency text := upper(btrim(COALESCE(p_currency, 'EGP')));
BEGIN
  IF NOT public.can_manage_coach_packages(p_coach_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() AND public.is_coaching_paused(p_coach_id) THEN
    RAISE EXCEPTION 'Coaching access is paused' USING ERRCODE = '42501';
  END IF;
  IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on OR p_ends_on > p_starts_on + 731 THEN
    RAISE EXCEPTION 'BAD_DATES' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) > 300 THEN
    RAISE EXCEPTION 'NOTE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount > 10000000) THEN
    RAISE EXCEPTION 'BAD_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'BAD_CURRENCY' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM warrior_programs
    WHERE warrior_id = p_warrior_id AND coach_id = p_coach_id AND status IS DISTINCT FROM 'deleted'
  ) THEN
    RAISE EXCEPTION 'NOT_YOUR_CLIENT' USING ERRCODE = '42501';
  END IF;

  IF p_package_id IS NOT NULL THEN
    UPDATE coaching_packages
    SET starts_on = p_starts_on, ends_on = p_ends_on, note = v_note,
        amount = p_amount, currency = v_currency, updated_at = now()
    WHERE id = p_package_id AND coach_id = p_coach_id AND warrior_id = p_warrior_id AND cancelled_at IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO coaching_packages (coach_id, warrior_id, starts_on, ends_on, note, amount, currency)
    VALUES (p_coach_id, p_warrior_id, p_starts_on, p_ends_on, v_note, p_amount, v_currency)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_coaching_package(uuid, uuid, date, date, text, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_coaching_package(uuid, uuid, date, date, text, uuid, numeric, text) TO authenticated;

-- History now includes what was paid.
CREATE OR REPLACE FUNCTION public.get_coaching_packages(p_coach_id uuid, p_warrior_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_coach_packages(p_coach_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cp.id, 'starts_on', cp.starts_on, 'ends_on', cp.ends_on, 'note', cp.note,
      'amount', cp.amount, 'currency', cp.currency, 'created_at', cp.created_at)
      ORDER BY cp.ends_on DESC, cp.created_at DESC)
    FROM coaching_packages cp
    WHERE cp.coach_id = p_coach_id AND cp.warrior_id = p_warrior_id AND cp.cancelled_at IS NULL), '[]'::jsonb);
END;
$$;
