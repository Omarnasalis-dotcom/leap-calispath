-- Coaching business (owner request 2026-11-14): online-coaching revenue from
-- coaching_packages.amount and a coach scorecard from coaching_reviews.
-- One read-only function. A coach sees their own numbers; an admin sees
-- every coach's (or one coach's, p_coach_id). Assistants see nothing here:
-- revenue is the coach's own business.
--
--   revenue     per month (by package start) and currency, last 12 months
--   packages    active now, average value, sold in the last 12 months
--   renewals    of the packages that ended in the last 12 months, how many
--               were followed by a new one (same coach + client) starting
--               within 30 days of the end
--   reviews     last 12 months: recommend score (NPS: % 9-10 minus % 0-6),
--               average stars, continue answers, check-in mood, response rate
--   by_coach    the same headline numbers per coach (admin, all coaches)

CREATE OR REPLACE FUNCTION public.get_coaching_business(p_coach_id uuid DEFAULT NULL)
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
  v_from date := (date_trunc('month', current_date) - interval '11 months')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  -- Admin: everyone or the coach asked for. Anyone else: themselves only.
  v_coach := CASE WHEN v_admin THEN p_coach_id ELSE v_uid END;

  RETURN (
    WITH pk AS (
      SELECT cp.* FROM coaching_packages cp
      WHERE cp.cancelled_at IS NULL AND (v_coach IS NULL OR cp.coach_id = v_coach)
    ),
    months AS (
      SELECT generate_series(v_from, date_trunc('month', current_date)::date, interval '1 month')::date AS m
    ),
    currencies AS (
      SELECT DISTINCT currency FROM pk WHERE amount IS NOT NULL AND starts_on >= v_from
    ),
    rev AS (
      SELECT date_trunc('month', starts_on)::date AS m, currency, sum(amount) AS revenue, count(*) AS packages
      FROM pk WHERE amount IS NOT NULL AND starts_on >= v_from
      GROUP BY 1, 2
    ),
    ended AS (
      SELECT p.id,
        EXISTS (
          SELECT 1 FROM pk n
          WHERE n.coach_id = p.coach_id AND n.warrior_id = p.warrior_id AND n.id <> p.id
            AND n.starts_on BETWEEN p.ends_on - 14 AND p.ends_on + 30
        ) AS renewed
      FROM pk p
      WHERE p.ends_on < current_date AND p.ends_on >= current_date - 365
    ),
    rv AS (
      SELECT cr.* FROM coaching_reviews cr
      WHERE (v_coach IS NULL OR cr.coach_id = v_coach) AND cr.sent_at >= current_date - 365
    ),
    fin AS (SELECT * FROM rv WHERE kind = 'final' AND answered_at IS NOT NULL),
    chk AS (SELECT * FROM rv WHERE kind = 'checkin' AND answered_at IS NOT NULL)
    SELECT jsonb_build_object(
      'coach_id', v_coach,
      'from', v_from,
      'currencies', COALESCE((SELECT jsonb_agg(currency ORDER BY currency = 'EGP' DESC, currency) FROM currencies), '[]'::jsonb),
      'revenue', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'month', months.m, 'currency', c.currency,
          'revenue', COALESCE(rev.revenue, 0), 'packages', COALESCE(rev.packages, 0)) ORDER BY c.currency, months.m)
        FROM months CROSS JOIN currencies c
        LEFT JOIN rev ON rev.m = months.m AND rev.currency = c.currency), '[]'::jsonb),
      'packages', jsonb_build_object(
        'active', (SELECT count(*) FROM pk WHERE starts_on <= current_date AND ends_on >= current_date),
        'sold_12m', (SELECT count(*) FROM pk WHERE starts_on >= v_from),
        'without_amount_12m', (SELECT count(*) FROM pk WHERE starts_on >= v_from AND amount IS NULL),
        'average', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('currency', currency, 'average', avg_amount) ORDER BY currency)
          FROM (SELECT currency, round(avg(amount), 2) AS avg_amount FROM pk
                WHERE amount IS NOT NULL AND starts_on >= v_from GROUP BY currency) a), '[]'::jsonb)),
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
            'coach_id', c.id,
            'coach_name', COALESCE(NULLIF(btrim(c.display_name), ''), 'Coach'),
            'active', (SELECT count(*) FROM pk WHERE pk.coach_id = c.id AND starts_on <= current_date AND ends_on >= current_date),
            'sold_12m', (SELECT count(*) FROM pk WHERE pk.coach_id = c.id AND starts_on >= v_from),
            'revenue_12m', COALESCE((
              SELECT jsonb_agg(jsonb_build_object('currency', currency, 'revenue', total) ORDER BY currency)
              FROM (SELECT currency, sum(amount) AS total FROM pk
                    WHERE pk.coach_id = c.id AND amount IS NOT NULL AND starts_on >= v_from GROUP BY currency) t), '[]'::jsonb),
            'final_answered', (SELECT count(*) FROM fin WHERE fin.coach_id = c.id),
            'promoters', (SELECT count(*) FROM fin WHERE fin.coach_id = c.id AND recommend >= 9),
            'detractors', (SELECT count(*) FROM fin WHERE fin.coach_id = c.id AND recommend <= 6),
            'avg_rating', (SELECT round(avg(rating), 1) FROM fin WHERE fin.coach_id = c.id)
          ) AS x
          FROM profiles c
          WHERE c.id IN (SELECT DISTINCT coach_id FROM pk UNION SELECT DISTINCT coach_id FROM rv)
        ) s), '[]'::jsonb) ELSE '[]'::jsonb END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_coaching_business(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coaching_business(uuid) TO authenticated;
