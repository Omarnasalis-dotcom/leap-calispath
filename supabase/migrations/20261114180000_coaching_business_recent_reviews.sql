-- Coaching business: a "Recent reviews" list (owner request 2026-11-14) —
-- each answered review in the range with the client's name, answers and
-- comment, newest first. Same scope as the rest of the report (a coach sees
-- their own clients' reviews, an admin everyone's).

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
            AND n.starts_on > p.starts_on AND n.starts_on <= p.ends_on + 30
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
        'progress_not_yet', (SELECT count(*) FROM chk WHERE progress = 'not_yet'),
        'progress_little', (SELECT count(*) FROM chk WHERE progress = 'little'),
        'progress_clear', (SELECT count(*) FROM chk WHERE progress = 'clear')),
      -- Every answered review in the range, newest first (up to 100), with
      -- the client's name ("Deleted account" when gone) and their active
      -- program with that coach, to open them on the coaching dashboard.
      'recent_reviews', COALESCE((
        SELECT jsonb_agg(x ORDER BY x->>'answered_at' DESC)
        FROM (
          SELECT jsonb_build_object(
            'id', r.id, 'kind', r.kind, 'answered_at', r.answered_at,
            'warrior_name', CASE WHEN r.warrior_id IS NULL THEN NULL ELSE COALESCE(NULLIF(btrim(w.display_name), ''), 'Athlete') END,
            'coach_name', CASE WHEN r.coach_id IS NULL THEN 'Deleted coach' ELSE COALESCE(NULLIF(btrim(c.display_name), ''), 'Coach') END,
            'assignment_id', (SELECT wp.id FROM warrior_programs wp
                              WHERE wp.warrior_id = r.warrior_id AND wp.coach_id = r.coach_id AND wp.status = 'active' LIMIT 1),
            'mood', r.mood, 'progress', r.progress, 'rating', r.rating,
            'continue', r.continue_choice, 'recommend', r.recommend, 'comment', r.comment) AS x
          FROM rv r
          LEFT JOIN profiles w ON w.id = r.warrior_id
          LEFT JOIN profiles c ON c.id = r.coach_id
          WHERE r.answered_at IS NOT NULL
          ORDER BY r.answered_at DESC
          LIMIT 100
        ) s), '[]'::jsonb),
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
