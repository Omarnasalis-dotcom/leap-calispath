-- Data fix (owner-approved 2026-11-12): published library templates had
-- blocks whose exercise was lost (the note still describes it), so every
-- athlete who picked them got an empty block:
--   Advanced B Program · PUSH DAY 1 | Skills - 1  → Free Handstand
--       (Tabata 3 × 30 s on / 90 s off: "hold the top position… freestanding")
--   Advanced B Program · LEGS DAY 3 | Skills      → Asisted Pistol Squat 3 × 5 per leg
--       ("fourth step of the pistol progression — full assisted range")
--   Athletic Program   · PUSH DAY 1 | Strength - 1 → Strict Handstand Push Up 4 × 5
--       ("shoulder-driven pressing strength — full range, controlled tempo")
--
-- Fills the library templates (future picks) and the same blocks in active
-- athletes' copies of them (program_templates.source_library_template_id),
-- only where the block is still empty AND has no workout log, so logged
-- history is never rewritten. Safe to run again: filled blocks are skipped.
-- Likely cause (not provable from history): the library JSON import dropped
-- exercises whose exercise_id was stale even when the name matched; fixed in
-- the importers in the same change.

DO $$
DECLARE
  v_handstand uuid;
  v_pistol uuid;
  v_hspu uuid;
  v_filled integer;
BEGIN
  -- Exact names, each must exist exactly once.
  SELECT id INTO STRICT v_handstand FROM exercise_library WHERE name = 'Free Handstand';
  SELECT id INTO STRICT v_pistol FROM exercise_library WHERE name = 'Asisted Pistol Squat';
  SELECT id INTO STRICT v_hspu FROM exercise_library WHERE name = 'Strict Handstand Push Up';

  WITH fixes(lib_name, block_name, exercise_id, sets, reps, hold_seconds, rest_seconds, notes) AS (
    VALUES
      ('Advanced B Program', 'PUSH DAY 1 | Skills - 1', v_handstand, 3, NULL::int, 30, NULL::int, NULL::text),
      ('Advanced B Program', 'LEGS DAY 3 | Skills', v_pistol, 3, 5, NULL::int, 60, 'per leg'),
      ('Athletic Program', 'PUSH DAY 1 | Strength - 1', v_hspu, 4, 5, NULL::int, 90, NULL::text)
  ),
  libs AS (
    SELECT f.*, pt.id AS lib_id
    FROM fixes f
    JOIN program_templates pt ON pt.name = f.lib_name AND pt.is_library_template
  ),
  targets AS (
    -- the library templates themselves
    SELECT l.*, pb.id AS block_id
    FROM libs l
    JOIN program_blocks pb ON pb.template_id = l.lib_id AND pb.name = l.block_name
    UNION ALL
    -- active athletes' copies of them
    SELECT l.*, pb.id
    FROM libs l
    JOIN program_templates c ON c.source_library_template_id = l.lib_id
    JOIN warrior_programs wp ON wp.template_id = c.id AND wp.status = 'active'
    JOIN program_blocks pb ON pb.template_id = c.id AND pb.name = l.block_name
  )
  INSERT INTO block_exercises (block_id, exercise_id, sets, reps, hold_seconds, rest_seconds, is_weighted, notes, order_index)
  SELECT DISTINCT ON (t.block_id) t.block_id, t.exercise_id, t.sets, t.reps, t.hold_seconds, t.rest_seconds, false, t.notes, 0
  FROM targets t
  WHERE NOT EXISTS (SELECT 1 FROM block_exercises be WHERE be.block_id = t.block_id)
    AND NOT EXISTS (SELECT 1 FROM workout_logs wl WHERE wl.block_id = t.block_id);

  GET DIAGNOSTICS v_filled = ROW_COUNT;
  RAISE NOTICE 'filled % empty blocks', v_filled;
END;
$$;
