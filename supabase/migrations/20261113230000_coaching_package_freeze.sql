-- Coaching packages: freeze (owner request 2026-11-13). A freeze of 1-4
-- weeks moves the package end later by that many weeks; it starts today by
-- default or on a chosen date. Training reminders are unchanged (owner
-- choice: only the date moves). Each freeze is kept for the history, and
-- the package reminders are keyed by the end date so they follow it.

CREATE TABLE IF NOT EXISTS public.coaching_package_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.coaching_packages(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  weeks integer NOT NULL CHECK (weeks BETWEEN 1 AND 4),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coaching_package_freezes_package_idx ON public.coaching_package_freezes (package_id, starts_on);
ALTER TABLE public.coaching_package_freezes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coaching_package_freezes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.freeze_coaching_package(p_package_id uuid, p_starts_on date, p_weeks integer)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg coaching_packages%ROWTYPE;
  v_new_end date;
BEGIN
  SELECT * INTO v_pkg FROM coaching_packages WHERE id = p_package_id AND cancelled_at IS NULL FOR UPDATE;
  IF v_pkg.id IS NULL THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_coach_packages(v_pkg.coach_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() AND public.is_coaching_paused(v_pkg.coach_id) THEN
    RAISE EXCEPTION 'Coaching access is paused' USING ERRCODE = '42501';
  END IF;
  IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 4 THEN
    RAISE EXCEPTION 'BAD_WEEKS' USING ERRCODE = '22023';
  END IF;
  -- Within the package: from its start until its (current) end.
  IF p_starts_on IS NULL OR p_starts_on < v_pkg.starts_on OR p_starts_on > v_pkg.ends_on THEN
    RAISE EXCEPTION 'FREEZE_OUTSIDE_PACKAGE' USING ERRCODE = '22023';
  END IF;

  v_new_end := v_pkg.ends_on + 7 * p_weeks;
  IF v_new_end > v_pkg.starts_on + 731 THEN
    RAISE EXCEPTION 'BAD_DATES' USING ERRCODE = '22023';
  END IF;

  INSERT INTO coaching_package_freezes (package_id, starts_on, weeks) VALUES (p_package_id, p_starts_on, p_weeks);
  UPDATE coaching_packages SET ends_on = v_new_end, updated_at = now() WHERE id = p_package_id;
  RETURN v_new_end;
END;
$$;
REVOKE ALL ON FUNCTION public.freeze_coaching_package(uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.freeze_coaching_package(uuid, date, integer) TO authenticated;

-- History now lists each package's freezes.
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
      'amount', cp.amount, 'currency', cp.currency, 'created_at', cp.created_at,
      'freezes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('starts_on', f.starts_on, 'weeks', f.weeks) ORDER BY f.starts_on)
        FROM coaching_package_freezes f WHERE f.package_id = cp.id), '[]'::jsonb))
      ORDER BY cp.ends_on DESC, cp.created_at DESC)
    FROM coaching_packages cp
    WHERE cp.coach_id = p_coach_id AND cp.warrior_id = p_warrior_id AND cp.cancelled_at IS NULL), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_coach_reminders_due()
RETURNS TABLE (
  warrior_program_id uuid,
  warrior_id uuid,
  coach_id uuid,
  reminder_key text,
  kind text,
  title text,
  body text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT st.*, COALESCE(NULLIF(st.warrior_name, ''), 'Your client') AS who
    FROM public.coach_client_state(COALESCE((
      SELECT array_agg(wp.id) FROM warrior_programs wp
      WHERE wp.status = 'active'
        AND wp.coach_id NOT IN ('00000000-0000-0000-0000-000000000001'::uuid,
                                '00000000-0000-0000-0000-000000000002'::uuid)
        AND wp.coach_id <> wp.warrior_id), '{}'::uuid[])) st
  ),
  cand AS (
    -- Week finished and the next week isn't built: right away.
    SELECT s.*, s.assignment_id || ':w' || s.current_week AS k, s.finished_at AS ev,
      'week_finished' AS kind, 'Week finished: add a new week' AS t,
      s.who || ' finished week ' || s.current_week || '. Week ' || (s.current_week + 1) || ' isn''t built yet.' AS b
    FROM s WHERE s.reason = 'week_finished'
    UNION ALL
    -- …and still not built a day later.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':waiting', s.finished_at + interval '24 hours',
      'still_waiting', 'Still waiting on a new week',
      s.who || ' finished week ' || s.current_week || ' a day ago. Week ' || (s.current_week + 1) || ' isn''t built yet.'
    FROM s WHERE s.reason = 'week_finished'
    UNION ALL
    -- On a week that has no workouts.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':missing', s.week_started_at,
      'week_missing', 'Client has no workouts',
      s.who || ' is on week ' || s.current_week || ', which isn''t built yet.'
    FROM s WHERE s.reason = 'week_missing'
    UNION ALL
    -- Missed a pace checkpoint: one per checkpoint.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':due' || s.due, s.due_at,
      CASE WHEN s.reason = 'not_started' THEN 'not_started' ELSE 'behind' END,
      CASE WHEN s.reason = 'not_started' THEN 'Client hasn''t started' ELSE 'Client is behind' END,
      CASE WHEN s.reason = 'not_started'
        THEN s.who || ' hasn''t logged a workout yet (' || s.days_per_week || ' days a week, day ' || s.day_no || ').'
        ELSE s.who || ' is behind: ' || s.days_logged || ' of ' || s.days_per_week || ' workouts done, day '
             || LEAST(s.day_no, 7) || ' of week ' || s.current_week || '.' END
    FROM s WHERE s.reason IN ('behind', 'overdue', 'not_started') AND s.due > 0 AND s.days_logged < s.due
    UNION ALL
    -- Past the week's 7 days and still not done: every 3 days after that.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':over' || ((s.day_no - 8) / 3),
      ((s.week_started_at AT TIME ZONE public.journey_points_tz(NULLIF(w.timezone, '')))::date
        + 7 + 3 * ((s.day_no - 8) / 3))::timestamp AT TIME ZONE public.journey_points_tz(NULLIF(w.timezone, '')),
      'overdue', 'Week running late',
      s.who || ' is ' || (s.day_no - 7) || ' days past week ' || s.current_week || ': '
        || CASE WHEN s.days_logged >= s.days_per_week
             THEN 'all ' || s.days_per_week || ' days trained, ' || (s.blocks_total - s.blocks_logged)
                  || CASE WHEN s.blocks_total - s.blocks_logged = 1 THEN ' block' ELSE ' blocks' END || ' not logged.'
             ELSE s.days_logged || ' of ' || s.days_per_week || ' workouts done.' END
    FROM s JOIN profiles w ON w.id = s.warrior_id
    WHERE s.reason IN ('overdue', 'not_started') AND s.day_no >= 11
    UNION ALL
    -- Finished, the next week is ready, but not started 3 days later.
    SELECT s.*, s.assignment_id || ':w' || s.current_week || ':nomove', s.finished_at + interval '3 days',
      'not_moved_on', 'Client hasn''t moved on',
      s.who || ' finished week ' || s.current_week || ' 3 days ago and hasn''t started week ' || s.next_week || '.'
    FROM s WHERE s.reason = 'not_moved_on'
    UNION ALL
    -- 14 days without training: once per quiet spell.
    SELECT s.*, s.assignment_id || ':quiet:' || to_char(s.last_activity_at, 'YYYYMMDD'),
      s.last_activity_at + interval '14 days',
      'quiet', 'Client gone quiet',
      s.who || ' hasn''t trained for 14 days.'
    FROM s WHERE s.reason = 'quiet'
    UNION ALL
    -- Coaching package (set by the coach): 2 weeks left, 1 week left, and
    -- the day it expires. Only the current package; a renewal replaces it,
    -- so the old one's reminders stop. Keyed by the end date too, so a
    -- freeze (or an edit) that moves the end re-arms them for the new date. Moments start at midnight in the
    -- coach's timezone and go out from 09:00.
    SELECT s.*, 'pkg:' || s.package_id || ':' || s.package_ends_on || ':d14',
      (s.package_ends_on - 14)::timestamp AT TIME ZONE s.coach_tz,
      'package_14', 'Package ends in 2 weeks',
      s.who || '''s coaching package ends in 2 weeks (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL AND s.package_ends_on - 14 >= s.package_starts_on
    UNION ALL
    SELECT s.*, 'pkg:' || s.package_id || ':' || s.package_ends_on || ':d7',
      (s.package_ends_on - 7)::timestamp AT TIME ZONE s.coach_tz,
      'package_7', 'Package ends in 1 week',
      s.who || '''s coaching package ends in 1 week (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL AND s.package_ends_on - 7 >= s.package_starts_on
    UNION ALL
    SELECT s.*, 'pkg:' || s.package_id || ':' || s.package_ends_on || ':expired',
      s.package_ends_on::timestamp AT TIME ZONE s.coach_tz,
      'package_expired', 'Package expired',
      s.who || '''s coaching package expired today (' || to_char(s.package_ends_on, 'FMDD Mon') || ').'
    FROM s WHERE s.package_id IS NOT NULL
  )
  SELECT c.assignment_id, c.warrior_id, c.coach_id, c.k, c.kind, c.t, c.b
  FROM cand c
  JOIN profiles coach ON coach.id = c.coach_id
  WHERE c.ev IS NOT NULL
    AND c.ev <= now()
    AND c.ev > now() - interval '2 days'
    AND EXTRACT(hour FROM now() AT TIME ZONE public.journey_points_tz(NULLIF(coach.timezone, ''))) BETWEEN 9 AND 20
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = c.coach_id
        AND n.type IN ('client_needs_attention', 'client_week_complete')
        AND n.data->>'key' = c.k);
$$;

REVOKE ALL ON FUNCTION public.get_coach_reminders_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_reminders_due() TO service_role;
