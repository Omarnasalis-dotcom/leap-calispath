-- Follow-up to 20261113180000_split_elhaddad_program.sql (owner-approved
-- 2026-11-13): keep his Journey points exactly as they were.
--
-- journey_points_award pays program days and trials once per key,
-- "<program id>:w<week>:<DAY>" and "<program id>:<slot>", recomputed across
-- all of the athlete's programs on every sync. The split moved his week 7
-- into the new program as week 1, so the next sync would have paid those 4
-- days (and the trial) again under the new keys. Re-key the 5 awards he
-- already has for week 7 to the new program instead: same points, same
-- dates, total unchanged (1325), nothing paid twice. Checked: no award
-- exists yet under the new program.

DO $$
DECLARE
  c_user CONSTANT uuid := '8054f7a6-7692-4c43-a0c9-0455ebd5003e';
  c_old CONSTANT text := 'a5d53a6f-b520-4af4-8a8b-fd98d07ffe9f';
  c_new CONSTANT text := '16b44ed4-363b-497d-b2af-255b4adbdb7b';
  v_n integer;
  v_total_before integer;
  v_total_after integer;
BEGIN
  PERFORM 1 FROM warrior_programs
  WHERE id = c_new::uuid AND warrior_id = c_user AND status = 'active' AND current_week = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'rekey: new program not in the expected state'; END IF;

  SELECT count(*) INTO v_n FROM journey_points WHERE user_id = c_user AND source_key LIKE c_new || ':%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'rekey: % awards already under the new program', v_n; END IF;

  SELECT count(*) INTO v_n FROM journey_points
  WHERE user_id = c_user
    AND ((source = 'program_day' AND source_key LIKE c_old || ':w7:%')
      OR (source IN ('trial', 'side_quest') AND source_key LIKE c_old || ':w7\_%'));
  IF v_n <> 5 THEN RAISE EXCEPTION 'rekey: expected 5 week-7 awards, found %', v_n; END IF;

  SELECT sum(points) INTO v_total_before FROM journey_points WHERE user_id = c_user;

  UPDATE journey_points
  SET source_key = c_new || ':w1:' || substring(source_key FROM length(c_old || ':w7:') + 1)
  WHERE user_id = c_user AND source = 'program_day' AND source_key LIKE c_old || ':w7:%';

  UPDATE journey_points
  SET source_key = c_new || ':w1_' || substring(source_key FROM length(c_old || ':w7_') + 1)
  WHERE user_id = c_user AND source IN ('trial', 'side_quest') AND source_key LIKE c_old || ':w7\_%';

  SELECT sum(points) INTO v_total_after FROM journey_points WHERE user_id = c_user;
  IF v_total_after IS DISTINCT FROM v_total_before THEN
    RAISE EXCEPTION 'rekey: total changed % -> %', v_total_before, v_total_after;
  END IF;
  SELECT count(*) INTO v_n FROM journey_points WHERE user_id = c_user AND source_key LIKE c_new || ':%';
  IF v_n <> 5 THEN RAISE EXCEPTION 'rekey: % awards under the new program after re-keying', v_n; END IF;

  RAISE NOTICE 'rekey done: 5 awards moved, total % unchanged', v_total_after;
END;
$$;
