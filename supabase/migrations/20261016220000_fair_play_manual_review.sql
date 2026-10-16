-- Fair Play, part 3 (owner request 2026-10-16): the admin can review any
-- result, not only the flagged ones. admin_fair_play_results lists an
-- athlete's results; admin_fair_play_flag_results puts the chosen ones in the
-- queue as 'manual' flags, and from there the usual actions apply (hide,
-- strike, note -> the athlete can accept a reset or appeal).
--
-- A manual flag has no known previous value, so an accepted reset removes
-- the result: the trial / weekly entry is deleted, the endurance attempt
-- stops counting, a static best is deleted, a power lift goes to 0.
-- (All of it is backed up and can be restored.)

ALTER TABLE public.fair_play_flags DROP CONSTRAINT IF EXISTS fair_play_flags_rule_check;
ALTER TABLE public.fair_play_flags ADD CONSTRAINT fair_play_flags_rule_check
  CHECK (rule IN ('absolute', 'jump', 'burst', 'floor_margin', 'weekly_outlier', 'manual'));

-- Every result of one athlete, newest first, with the latest flag on it.
-- removed: an endurance attempt that already doesn't count (after a reset).
CREATE OR REPLACE FUNCTION public.admin_fair_play_results(p_user uuid)
RETURNS TABLE(source_table text, source_id text, area text, movement_id text, value numeric, label text, at timestamptz, removed boolean, flag_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fair_play_require_admin();
  RETURN QUERY
  WITH results AS (
    SELECT 'trial_history'::text AS st, th.id::text AS sid, 'strength'::text AS ar, th.tier_attempted::text AS mv,
           th.time_seconds::numeric AS val, NULL::text AS lbl, th.attempted_at AS ts, false AS rm
    FROM public.trial_history th WHERE th.user_id = p_user AND th.completed AND th.time_seconds IS NOT NULL
    UNION ALL
    SELECT 'static_holds', sh.id::text, 'static', sh.movement_id, sh.hold_seconds, NULL, COALESCE(sh.logged_at, sh.created_at), false
    FROM public.static_holds sh WHERE sh.user_id = p_user
    UNION ALL
    SELECT 'one_min_max_logs', l.id::text, 'endurance', l.movement_id, l.reps::numeric, NULL, l.created_at, l.excluded_from_pb
    FROM public.one_min_max_logs l WHERE l.user_id = p_user
    UNION ALL
    SELECT 'power_assessments', pa.id::text, 'power', lift.k, lift.v, NULL, pa.assessed_at, false
    FROM public.power_assessments pa
    CROSS JOIN LATERAL (VALUES ('pullup_1rm', pa.pullup_1rm), ('dip_1rm', pa.dip_1rm), ('squat_1rm', pa.squat_1rm), ('muscleup_1rm', pa.muscleup_1rm)) AS lift(k, v)
    WHERE pa.user_id = p_user AND lift.v > 0
    UNION ALL
    SELECT 'weekly_entries', we.id::text, 'weekly', we.challenge_id::text, we.score, wc.title, we.created_at, false
    FROM public.weekly_entries we LEFT JOIN public.weekly_challenges wc ON wc.id = we.challenge_id
    WHERE we.user_id = p_user
  )
  SELECT r.st, r.sid, r.ar, r.mv, r.val, r.lbl, r.ts, r.rm,
         (SELECT f.status FROM public.fair_play_flags f
          WHERE f.source_table = r.st AND f.source_id = r.sid AND f.movement_id IS NOT DISTINCT FROM r.mv
          ORDER BY f.id DESC LIMIT 1)
  FROM results r
  ORDER BY r.ts DESC NULLS LAST
  LIMIT 1000;
END;
$function$;

-- Put chosen results in the queue. p_items: [{source_table, source_id, movement_id}].
-- The value is read here, from the athlete's own row; a result that isn't
-- theirs or no longer exists is skipped. A dismissed manual flag on the same
-- value is reopened. Returns how many flags are now open from this call.
CREATE OR REPLACE FUNCTION public.admin_fair_play_flag_results(p_user uuid, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  it jsonb;
  v_table text;
  v_source text;
  v_mv text;
  v_area text;
  v_val numeric;
  v_n integer;
  v_total integer := 0;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_table := it ->> 'source_table';
    v_source := it ->> 'source_id';
    v_mv := it ->> 'movement_id';
    v_val := NULL;
    IF v_table = 'trial_history' THEN
      v_area := 'strength';
      SELECT th.time_seconds, th.tier_attempted::text INTO v_val, v_mv FROM public.trial_history th
      WHERE th.id::text = v_source AND th.user_id = p_user AND th.completed;
    ELSIF v_table = 'static_holds' THEN
      v_area := 'static';
      SELECT sh.hold_seconds, sh.movement_id INTO v_val, v_mv FROM public.static_holds sh WHERE sh.id::text = v_source AND sh.user_id = p_user;
    ELSIF v_table = 'one_min_max_logs' THEN
      v_area := 'endurance';
      SELECT l.reps, l.movement_id INTO v_val, v_mv FROM public.one_min_max_logs l
      WHERE l.id::text = v_source AND l.user_id = p_user AND NOT l.excluded_from_pb;
    ELSIF v_table = 'power_assessments' THEN
      v_area := 'power';
      IF v_mv IN ('pullup_1rm', 'dip_1rm', 'squat_1rm', 'muscleup_1rm') THEN
        SELECT (to_jsonb(pa) ->> v_mv)::numeric INTO v_val FROM public.power_assessments pa WHERE pa.id::text = v_source AND pa.user_id = p_user;
      END IF;
    ELSIF v_table = 'weekly_entries' THEN
      v_area := 'weekly';
      SELECT we.score, we.challenge_id::text INTO v_val, v_mv FROM public.weekly_entries we WHERE we.id::text = v_source AND we.user_id = p_user;
    END IF;
    CONTINUE WHEN v_val IS NULL OR v_val <= 0;
    -- Already waiting in the queue (an automatic flag): nothing to add.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.fair_play_flags f WHERE f.source_table = v_table AND f.source_id = v_source
                          AND f.movement_id IS NOT DISTINCT FROM v_mv AND f.status = 'open');

    INSERT INTO public.fair_play_flags (user_id, area, source_table, source_id, movement_id, value, rule, severity, detail)
    VALUES (p_user, v_area, v_table, v_source, v_mv, v_val, 'manual', 'flag', jsonb_build_object('manual', true, 'by', v_admin))
    ON CONFLICT (source_table, source_id, movement_id, rule, value) DO UPDATE
      SET status = 'open', reviewed_by = NULL, reviewed_at = NULL, created_at = now()
      WHERE fair_play_flags.status = 'dismissed';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, 'fair_play_flag_manual', p_user::text, jsonb_build_object('items', p_items, 'flagged', v_total));
  RETURN v_total;
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.admin_fair_play_results(uuid)', 'public.admin_fair_play_flag_results(uuid, jsonb)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
