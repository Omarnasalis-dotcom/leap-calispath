-- Keep the money, drop the person (owner-approved 2026-11-14). Deleting an
-- account used to delete that person's coaching packages and reviews with
-- it (ON DELETE CASCADE from profiles), so past revenue vanished from the
-- coaching business report. Now:
--   client deletes their account  packages and reviews stay, unlinked
--     (warrior_id NULL, shown as "Deleted account"); the package note and
--     the review comment are cleared (free text can hold personal details);
--     amounts, dates, stars and scores stay as anonymous numbers.
--   coach deletes their account   their packages and reviews stay, unlinked
--     (coach_id NULL, "Deleted coach" in the admin report).
-- Nothing personal is kept: no name, email or id.

ALTER TABLE public.coaching_packages ALTER COLUMN warrior_id DROP NOT NULL, ALTER COLUMN coach_id DROP NOT NULL;
ALTER TABLE public.coaching_packages
  DROP CONSTRAINT coaching_packages_warrior_id_fkey,
  ADD CONSTRAINT coaching_packages_warrior_id_fkey FOREIGN KEY (warrior_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  DROP CONSTRAINT coaching_packages_coach_id_fkey,
  ADD CONSTRAINT coaching_packages_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.coaching_reviews ALTER COLUMN warrior_id DROP NOT NULL, ALTER COLUMN coach_id DROP NOT NULL;
ALTER TABLE public.coaching_reviews
  DROP CONSTRAINT coaching_reviews_warrior_id_fkey,
  ADD CONSTRAINT coaching_reviews_warrior_id_fkey FOREIGN KEY (warrior_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  DROP CONSTRAINT coaching_reviews_coach_id_fkey,
  ADD CONSTRAINT coaching_reviews_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- A random reference shared by one coach + client's packages, so renewals
-- still match after the client's account is gone. Means nothing on its own.
ALTER TABLE public.coaching_packages ADD COLUMN IF NOT EXISTS client_ref uuid;
UPDATE public.coaching_packages cp
SET client_ref = pairs.ref
FROM (SELECT coach_id, warrior_id, gen_random_uuid() AS ref
      FROM public.coaching_packages GROUP BY coach_id, warrior_id) pairs
WHERE cp.client_ref IS NULL AND pairs.coach_id = cp.coach_id AND pairs.warrior_id = cp.warrior_id;

CREATE OR REPLACE FUNCTION public.coaching_packages_set_client_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_ref IS NULL THEN
    SELECT cp.client_ref INTO NEW.client_ref
    FROM coaching_packages cp
    WHERE cp.coach_id = NEW.coach_id AND cp.warrior_id = NEW.warrior_id AND cp.client_ref IS NOT NULL
    LIMIT 1;
    NEW.client_ref := COALESCE(NEW.client_ref, gen_random_uuid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coaching_packages_client_ref ON public.coaching_packages;
CREATE TRIGGER coaching_packages_client_ref
  BEFORE INSERT ON public.coaching_packages
  FOR EACH ROW EXECUTE FUNCTION public.coaching_packages_set_client_ref();

-- When the client is unlinked (their account deleted), clear the free text.
CREATE OR REPLACE FUNCTION public.coaching_clear_text_on_unlink()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.warrior_id IS NULL AND OLD.warrior_id IS NOT NULL THEN
    IF TG_TABLE_NAME = 'coaching_packages' THEN
      NEW.note := NULL;
    ELSE
      NEW.comment := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coaching_packages_clear_text ON public.coaching_packages;
CREATE TRIGGER coaching_packages_clear_text
  BEFORE UPDATE OF warrior_id ON public.coaching_packages
  FOR EACH ROW EXECUTE FUNCTION public.coaching_clear_text_on_unlink();

DROP TRIGGER IF EXISTS coaching_reviews_clear_text ON public.coaching_reviews;
CREATE TRIGGER coaching_reviews_clear_text
  BEFORE UPDATE OF warrior_id ON public.coaching_reviews
  FOR EACH ROW EXECUTE FUNCTION public.coaching_clear_text_on_unlink();

-- The report's per-coach table also lists packages whose coach was deleted.
CREATE OR REPLACE FUNCTION public.get_coaching_business(p_coach_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v_coach uuid;
  v_from date;
  v_to date := COALESCE(p_to, current_date);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  -- Admin: everyone or the coach asked for. Anyone else: themselves only.
  v_coach := CASE WHEN v_admin THEN p_coach_id ELSE v_uid END;
  -- No start date: from the first package in scope ("all time"), else this month.
  v_from := COALESCE(p_from, (
    SELECT min(starts_on) FROM coaching_packages
    WHERE cancelled_at IS NULL AND (v_coach IS NULL OR coach_id = v_coach)), date_trunc('month', current_date)::date);
  IF v_to < v_from THEN
    RAISE EXCEPTION 'BAD_RANGE' USING ERRCODE = '22023';
  END IF;
  IF v_to - v_from > 3660 THEN
    v_from := v_to - 3660;
  END IF;

  RETURN (
    WITH pk AS (
      SELECT cp.* FROM coaching_packages cp
      WHERE cp.cancelled_at IS NULL AND (v_coach IS NULL OR cp.coach_id = v_coach)
    ),
    months AS (
      SELECT generate_series(date_trunc('month', v_from)::date, date_trunc('month', v_to)::date, interval '1 month')::date AS m
    ),
    currencies AS (
      SELECT DISTINCT currency FROM pk WHERE amount IS NOT NULL AND starts_on BETWEEN v_from AND v_to
    ),
    rev AS (
      SELECT date_trunc('month', starts_on)::date AS m, currency, sum(amount) AS revenue, count(*) AS packages
      FROM pk WHERE amount IS NOT NULL AND starts_on BETWEEN v_from AND v_to
      GROUP BY 1, 2
    ),
    ended AS (
      SELECT p.id,
        EXISTS (
          SELECT 1 FROM pk n
          WHERE n.client_ref = p.client_ref AND n.id <> p.id
            AND n.starts_on BETWEEN p.ends_on - 14 AND p.ends_on + 30
        ) AS renewed
      FROM pk p
      WHERE p.ends_on < current_date AND p.ends_on BETWEEN v_from AND v_to
    ),
    rv AS (
      SELECT cr.* FROM coaching_reviews cr
      WHERE (v_coach IS NULL OR cr.coach_id = v_coach) AND cr.sent_at::date BETWEEN v_from AND v_to
    ),
    fin AS (SELECT * FROM rv WHERE kind = 'final' AND answered_at IS NOT NULL),
    chk AS (SELECT * FROM rv WHERE kind = 'checkin' AND answered_at IS NOT NULL)
    SELECT jsonb_build_object(
      'coach_id', v_coach,
      'from', v_from,
      'to', v_to,
      'totals', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('currency', currency, 'revenue', total, 'packages', n) ORDER BY currency = 'EGP' DESC, currency)
        FROM (SELECT currency, sum(amount) AS total, count(*) AS n FROM pk
              WHERE amount IS NOT NULL AND starts_on BETWEEN v_from AND v_to GROUP BY currency) t), '[]'::jsonb),
      'currencies', COALESCE((SELECT jsonb_agg(currency ORDER BY currency = 'EGP' DESC, currency) FROM currencies), '[]'::jsonb),
      'revenue', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'month', months.m, 'currency', c.currency,
          'revenue', COALESCE(rev.revenue, 0), 'packages', COALESCE(rev.packages, 0)) ORDER BY c.currency, months.m)
        FROM months CROSS JOIN currencies c
        LEFT JOIN rev ON rev.m = months.m AND rev.currency = c.currency), '[]'::jsonb),
      'packages', jsonb_build_object(
        'active', (SELECT count(*) FROM pk WHERE starts_on <= current_date AND ends_on >= current_date),
        'sold', (SELECT count(*) FROM pk WHERE starts_on BETWEEN v_from AND v_to),
        'without_amount', (SELECT count(*) FROM pk WHERE starts_on BETWEEN v_from AND v_to AND amount IS NULL),
        'average', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('currency', currency, 'average', avg_amount) ORDER BY currency)
          FROM (SELECT currency, round(avg(amount), 2) AS avg_amount FROM pk
                WHERE amount IS NOT NULL AND starts_on BETWEEN v_from AND v_to GROUP BY currency) a), '[]'::jsonb)),
      'renewals', jsonb_build_object(
        'ended', (SELECT count(*) FROM ended),
        'renewed', (SELECT count(*) FROM ended WHERE renewed)),
      'reviews', jsonb_build_object(
        'sent', (SELECT count(*) FROM rv),
        'answered', (SELECT count(*) FROM rv WHERE answered_at IS NOT NULL),
        'final_answered', (SELECT count(*) FROM fin),
        'promoters', (SELECT count(*) FROM fin WHERE recommend >= 9),
        'passives', (SELECT count(*) FROM fin WHERE recommend BETWEEN 7 AND 8),
        'detractors', (SELECT count(*) FROM fin WHERE recommend <= 6),
        'avg_rating', (SELECT round(avg(rating), 1) FROM fin),
        'continue_yes', (SELECT count(*) FROM fin WHERE continue_choice = 'yes'),
        'continue_break', (SELECT count(*) FROM fin WHERE continue_choice = 'break'),
        'continue_no', (SELECT count(*) FROM fin WHERE continue_choice = 'no'),
        'checkin_answered', (SELECT count(*) FROM chk),
        'avg_mood', (SELECT round(avg(mood), 1) FROM chk),
        'workload_easy', (SELECT count(*) FROM chk WHERE workload = 'easy'),
        'workload_right', (SELECT count(*) FROM chk WHERE workload = 'right'),
        'workload_hard', (SELECT count(*) FROM chk WHERE workload = 'hard')),
      'by_coach', CASE WHEN v_admin AND v_coach IS NULL THEN COALESCE((
        SELECT jsonb_agg(x ORDER BY x->>'coach_name')
        FROM (
          SELECT jsonb_build_object(
            'coach_id', ids.coach_id,
            'coach_name', CASE WHEN ids.coach_id IS NULL THEN 'Deleted coach'
                               ELSE COALESCE(NULLIF(btrim(c.display_name), ''), 'Coach') END,
            'active', (SELECT count(*) FROM pk WHERE pk.coach_id IS NOT DISTINCT FROM ids.coach_id AND starts_on <= current_date AND ends_on >= current_date),
            'sold', (SELECT count(*) FROM pk WHERE pk.coach_id IS NOT DISTINCT FROM ids.coach_id AND starts_on BETWEEN v_from AND v_to),
            'revenue_total', COALESCE((
              SELECT jsonb_agg(jsonb_build_object('currency', currency, 'revenue', total) ORDER BY currency)
              FROM (SELECT currency, sum(amount) AS total FROM pk
                    WHERE pk.coach_id IS NOT DISTINCT FROM ids.coach_id AND amount IS NOT NULL AND starts_on BETWEEN v_from AND v_to
                    GROUP BY currency) t), '[]'::jsonb),
            'final_answered', (SELECT count(*) FROM fin WHERE fin.coach_id IS NOT DISTINCT FROM ids.coach_id),
            'promoters', (SELECT count(*) FROM fin WHERE fin.coach_id IS NOT DISTINCT FROM ids.coach_id AND recommend >= 9),
            'detractors', (SELECT count(*) FROM fin WHERE fin.coach_id IS NOT DISTINCT FROM ids.coach_id AND recommend <= 6),
            'avg_rating', (SELECT round(avg(rating), 1) FROM fin WHERE fin.coach_id IS NOT DISTINCT FROM ids.coach_id)
          ) AS x
          FROM (SELECT coach_id FROM pk UNION SELECT coach_id FROM rv) ids
          LEFT JOIN profiles c ON c.id = ids.coach_id
        ) s), '[]'::jsonb) ELSE '[]'::jsonb END
    )
  );
END;
$$;
