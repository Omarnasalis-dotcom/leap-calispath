-- Data fix (owner-approved 2026-11-13): split Elhaddad's program in two.
--
-- After a month away, his coach archived weeks 1–6 and added a new program
-- as week 7 of the same program. The owner wants week 7 to be its own
-- program (active) and the old weeks to sit in his past programs (restorable
-- in the app, Activate in admin Clients), as "Start as a new program" does
-- now.
--
--   new program  "Intermediate - 4 Days"          week 7 → week 1, its 28
--                blocks and 28 logged workouts (same rows, so sets, PRs and
--                points stay linked), the w7 Journey trial slot (→ w1), the
--                bodyweight entry logged since the restart; starts 2026-11-07
--                (when weeks 1–6 were archived).
--   old program  "Intermediate - 4 Days (Aug–Oct)" weeks 1–6 un-archived,
--                current week 6, completed (moved by complete_other_active_programs
--                when the new one is inserted active).
--
-- Every count is checked first; any surprise aborts the whole thing.

DO $$
DECLARE
  c_old_program CONSTANT uuid := 'a5d53a6f-b520-4af4-8a8b-fd98d07ffe9f';
  c_old_template CONSTANT uuid := '4e253d33-99b6-4515-a5b5-47be5ca65b58';
  c_warrior CONSTANT uuid := '8054f7a6-7692-4c43-a0c9-0455ebd5003e';
  v_restart timestamptz;
  v_first_w7_log timestamptz;
  v_new_template uuid;
  v_new_program uuid;
  v_n integer;
BEGIN
  -- ---- checks ----
  PERFORM 1 FROM warrior_programs
  WHERE id = c_old_program AND template_id = c_old_template AND warrior_id = c_warrior
    AND status = 'active' AND current_week = 7;
  IF NOT FOUND THEN RAISE EXCEPTION 'split: program not in the expected state'; END IF;

  SELECT count(*) INTO v_n FROM program_blocks WHERE template_id = c_old_template AND week_number = 7;
  IF v_n <> 28 THEN RAISE EXCEPTION 'split: expected 28 week-7 blocks, found %', v_n; END IF;

  SELECT count(*) INTO v_n FROM program_blocks WHERE template_id = c_old_template AND week_number > 7;
  IF v_n <> 0 THEN RAISE EXCEPTION 'split: found % blocks after week 7', v_n; END IF;

  SELECT count(*) INTO v_n FROM workout_logs wl JOIN program_blocks pb ON pb.id = wl.block_id
  WHERE wl.warrior_program_id = c_old_program AND pb.week_number = 7;
  IF v_n <> 28 THEN RAISE EXCEPTION 'split: expected 28 week-7 logs, found %', v_n; END IF;

  SELECT count(*) INTO v_n FROM workout_logs wl JOIN program_blocks pb ON pb.id = wl.block_id
  WHERE pb.template_id = c_old_template AND pb.week_number = 7 AND wl.warrior_program_id <> c_old_program;
  IF v_n <> 0 THEN RAISE EXCEPTION 'split: % week-7 logs belong to another program', v_n; END IF;

  SELECT count(*) INTO v_n FROM program_week_archive WHERE template_id = c_old_template;
  IF v_n <> 6 THEN RAISE EXCEPTION 'split: expected 6 archived weeks, found %', v_n; END IF;

  SELECT min(archived_at) INTO v_restart FROM program_week_archive WHERE template_id = c_old_template;

  SELECT count(*) INTO v_n FROM journey_quest_slots WHERE warrior_program_id = c_old_program AND slot_key LIKE 'w7\_%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'split: expected 1 week-7 journey slot, found %', v_n; END IF;

  SELECT count(*) INTO v_n FROM bodyweight_logs WHERE warrior_program_id = c_old_program AND logged_at >= v_restart;
  IF v_n <> 1 THEN RAISE EXCEPTION 'split: expected 1 bodyweight entry since the restart, found %', v_n; END IF;

  SELECT count(*) INTO v_n FROM coach_week_notes WHERE warrior_program_id = c_old_program;
  IF v_n <> 0 THEN RAISE EXCEPTION 'split: found % coach week notes', v_n; END IF;
  SELECT count(*) INTO v_n FROM journey_day_choices WHERE warrior_program_id = c_old_program;
  IF v_n <> 0 THEN RAISE EXCEPTION 'split: found % journey day choices', v_n; END IF;
  SELECT count(*) INTO v_n FROM program_reviews WHERE warrior_program_id = c_old_program;
  IF v_n <> 0 THEN RAISE EXCEPTION 'split: found % program reviews', v_n; END IF;

  SELECT min(wl.completed_at) INTO v_first_w7_log
  FROM workout_logs wl JOIN program_blocks pb ON pb.id = wl.block_id
  WHERE wl.warrior_program_id = c_old_program AND pb.week_number = 7;

  -- ---- the new program ----
  INSERT INTO program_templates (coach_id, name, description, status, is_library_template)
  SELECT coach_id, name, description, status, false
  FROM program_templates WHERE id = c_old_template
  RETURNING id INTO v_new_template;

  -- Inserted active: complete_other_active_programs completes the old one.
  INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status, assigned_at, current_week, community_left_at)
  SELECT coach_id, warrior_id, v_new_template, 'active', v_restart, 1, community_left_at
  FROM warrior_programs WHERE id = c_old_program
  RETURNING id INTO v_new_program;

  -- Its week started with his first workout of it (server-set; the trigger allows it).
  UPDATE warrior_programs SET current_week_started_at = v_first_w7_log WHERE id = v_new_program;

  -- Week 7 moves over as week 1: same block rows, so their exercises and logs follow.
  UPDATE workout_logs SET warrior_program_id = v_new_program
  WHERE warrior_program_id = c_old_program
    AND block_id IN (SELECT id FROM program_blocks WHERE template_id = c_old_template AND week_number = 7);
  UPDATE program_blocks SET template_id = v_new_template, week_number = 1
  WHERE template_id = c_old_template AND week_number = 7;

  UPDATE journey_quest_slots
  SET warrior_program_id = v_new_program, slot_key = 'w1_' || substring(slot_key FROM 4)
  WHERE warrior_program_id = c_old_program AND slot_key LIKE 'w7\_%';

  UPDATE bodyweight_logs SET warrior_program_id = v_new_program
  WHERE warrior_program_id = c_old_program AND logged_at >= v_restart;

  -- ---- the old program: weeks 1–6 visible again, renamed, completed ----
  DELETE FROM program_week_archive WHERE template_id = c_old_template;
  UPDATE program_templates SET name = 'Intermediate - 4 Days (Aug–Oct)' WHERE id = c_old_template;
  UPDATE warrior_programs SET current_week = 6 WHERE id = c_old_program;

  -- ---- verify ----
  PERFORM 1 FROM warrior_programs WHERE id = c_old_program AND status = 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'split: old program was not completed'; END IF;
  SELECT count(*) INTO v_n FROM warrior_programs WHERE warrior_id = c_warrior AND status = 'active';
  IF v_n <> 1 THEN RAISE EXCEPTION 'split: % active programs after the split', v_n; END IF;
  SELECT count(*) INTO v_n FROM workout_logs WHERE warrior_program_id = v_new_program;
  IF v_n <> 28 THEN RAISE EXCEPTION 'split: new program has % logs', v_n; END IF;
  SELECT count(*) INTO v_n FROM workout_logs WHERE warrior_program_id = c_old_program;
  IF v_n <> 150 THEN RAISE EXCEPTION 'split: old program has % logs', v_n; END IF;

  RAISE NOTICE 'split done: new program %, template %', v_new_program, v_new_template;
END;
$$;
