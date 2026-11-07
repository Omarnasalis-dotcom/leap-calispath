-- save_program_template ran about three statements per block and exercise
-- (UPDATE block, SELECT match, UPDATE/INSERT exercise). It is SECURITY
-- INVOKER, so every one of those statements set up the RLS policies of
-- program_blocks / block_exercises again. Cost grew with program size, not
-- with what changed: a 12-week program (336 blocks, 757 exercises, prod
-- 2026-11-07, Khalid) passed the 8s authenticated statement_timeout and the
-- admin panel showed "canceling statement due to statement timeout" when a
-- week was duplicated.
--
-- Same rules, done as a handful of set-based statements:
--  * Removed blocks: unchanged per-block loop (only removed blocks), so a
--    block with workout logs is still kept and reported in
--    undeletable_block_ids.
--  * Blocks with db_id: one UPDATE (unconditional, as before). A db_id that
--    matches no updatable row still leaves its exercises with a NULL block
--    (insert fails on NOT NULL), exactly like the old RETURNING INTO NULL.
--    A db_id sent twice keeps the values of its last copy, as before.
--  * New blocks: one INSERT with ids picked up front.
--  * Exercises: the k-th payload occurrence (payload order) of an exercise_id
--    in a saved block reuses the k-th existing row of that exercise_id in the
--    block, by (order_index, id) — the same pairing the old greedy
--    "first unused row" loop produced. Matched rows are updated only when a
--    value changed; unmatched ones are inserted; rows of saved blocks left
--    unmatched are deleted. Ids of kept rows never change.
--  * Template update/insert, NOT_FOUND, current_week sync and the return
--    value are unchanged. Still SECURITY INVOKER: RLS decides who can save.
CREATE OR REPLACE FUNCTION public.save_program_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_template_id uuid;
  v_current_block_ids uuid[];
  v_previous_block_ids uuid[];
  v_blocks_to_delete uuid[];
  v_undeletable_block_ids uuid[] := '{}';
  v_block_id uuid;
  v_new_block_ids uuid[];
  v_updated_block_ids uuid[];
  v_saved_block_ids uuid[];
  v_match_ids uuid[];
  v_new_exercise_ids uuid[];
  v_kept_exercise_ids uuid[];
  v_new_max_week integer;
  v_affected_warrior_program_id uuid;
  v_previous_week integer;
  v_week_increased boolean := false;
BEGIN
  IF p_template_id IS NOT NULL THEN
    UPDATE program_templates
    SET name = p_name, description = p_description
    WHERE id = p_template_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
    END IF;

    v_template_id := p_template_id;
  ELSE
    INSERT INTO program_templates (name, description, coach_id)
    VALUES (p_name, p_description, auth.uid())
    RETURNING id INTO v_template_id;
  END IF;

  SELECT array_agg((b->>'db_id')::uuid)
  INTO v_current_block_ids
  FROM jsonb_array_elements(p_blocks) AS b
  WHERE b->>'db_id' IS NOT NULL;

  IF p_template_id IS NOT NULL THEN
    SELECT array_agg(id) INTO v_previous_block_ids
    FROM program_blocks
    WHERE template_id = v_template_id;

    IF v_previous_block_ids IS NOT NULL THEN
      v_blocks_to_delete := ARRAY(
        SELECT unnest(v_previous_block_ids)
        EXCEPT
        SELECT unnest(COALESCE(v_current_block_ids, ARRAY[]::uuid[]))
      );

      FOREACH v_block_id IN ARRAY v_blocks_to_delete LOOP
        BEGIN
          DELETE FROM block_exercises WHERE block_id = v_block_id;
          DELETE FROM program_blocks WHERE id = v_block_id;
        EXCEPTION WHEN foreign_key_violation THEN
          v_undeletable_block_ids := array_append(v_undeletable_block_ids, v_block_id);
        END;
      END LOOP;
    END IF;
  END IF;

  -- Ids for new blocks, one slot per payload block (NULL for db_id blocks).
  SELECT array_agg(CASE WHEN b->>'db_id' IS NULL THEN gen_random_uuid() END ORDER BY o)
  INTO v_new_block_ids
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(b, o);

  -- Existing blocks. A db_id sent twice takes its last copy.
  WITH upd AS (
    UPDATE program_blocks pb SET
      name = s.b->>'name',
      notes = s.b->>'notes',
      order_index = (s.b->>'order_index')::int,
      week_number = (s.b->>'week_number')::int
    FROM (
      SELECT DISTINCT ON ((b->>'db_id')::uuid) (b->>'db_id')::uuid AS db_id, b
      FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(b, o)
      WHERE b->>'db_id' IS NOT NULL
      ORDER BY (b->>'db_id')::uuid, o DESC
    ) s
    WHERE pb.id = s.db_id
    RETURNING pb.id
  )
  SELECT array_agg(id) INTO v_updated_block_ids FROM upd;

  INSERT INTO program_blocks (id, template_id, name, notes, order_index, week_number)
  SELECT
    v_new_block_ids[o],
    v_template_id,
    b->>'name',
    b->>'notes',
    (b->>'order_index')::int,
    (b->>'week_number')::int
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(b, o)
  WHERE b->>'db_id' IS NULL
  ORDER BY o;

  -- The block each payload block's exercises go to: the new id, the db_id
  -- when its UPDATE found the row, else NULL.
  SELECT array_agg(
    CASE
      WHEN b->>'db_id' IS NULL THEN v_new_block_ids[o]
      WHEN (b->>'db_id')::uuid = ANY(COALESCE(v_updated_block_ids, ARRAY[]::uuid[])) THEN (b->>'db_id')::uuid
    END
    ORDER BY o)
  INTO v_saved_block_ids
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(b, o);

  -- Pair payload exercises with existing rows, one slot per payload exercise
  -- in payload order (NULL = insert).
  WITH ex AS (
    SELECT
      row_number() OVER (ORDER BY t.o, e.eo) AS n,
      (t.b->>'db_id' IS NOT NULL) AS has_db_id,
      v_saved_block_ids[t.o] AS block_id,
      (e.x->>'exercise_id')::uuid AS exercise_id,
      t.o, e.eo
    FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(b, o)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.b->'exercises', '[]'::jsonb)) WITH ORDINALITY AS e(x, eo)
  ),
  ex_ranked AS (
    SELECT n, block_id, exercise_id,
      row_number() OVER (PARTITION BY block_id, exercise_id ORDER BY o, eo) AS k
    FROM ex
    WHERE has_db_id AND block_id IS NOT NULL
  ),
  existing AS (
    SELECT id, block_id, exercise_id,
      row_number() OVER (PARTITION BY block_id, exercise_id ORDER BY order_index, id) AS k
    FROM block_exercises
    WHERE block_id = ANY(COALESCE(v_updated_block_ids, ARRAY[]::uuid[]))
  )
  SELECT array_agg(m.id ORDER BY ex.n)
  INTO v_match_ids
  FROM ex
  LEFT JOIN ex_ranked r ON r.n = ex.n
  LEFT JOIN existing m
    ON m.block_id = r.block_id AND m.exercise_id = r.exercise_id AND m.k = r.k;

  -- Ids for exercises that found no row, same slots.
  SELECT array_agg(CASE WHEN v_match_ids[n] IS NULL THEN gen_random_uuid() END ORDER BY n)
  INTO v_new_exercise_ids
  FROM generate_series(1, COALESCE(cardinality(v_match_ids), 0)) AS n;

  UPDATE block_exercises be SET
    sets = (s.x->>'sets')::int,
    reps = (s.x->>'reps')::int,
    rest_seconds = (s.x->>'rest_seconds')::int,
    hold_seconds = (s.x->>'hold_seconds')::int,
    is_weighted = COALESCE((s.x->>'is_weighted')::boolean, false),
    notes = s.x->>'notes',
    order_index = (s.x->>'order_index')::int
  FROM (
    SELECT
      row_number() OVER (ORDER BY t.o, e.eo) AS n,
      v_saved_block_ids[t.o] AS block_id,
      e.x
    FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(b, o)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.b->'exercises', '[]'::jsonb)) WITH ORDINALITY AS e(x, eo)
  ) s
  WHERE be.id = ANY(v_match_ids)
    AND be.id = v_match_ids[s.n]
    AND (be.sets, be.reps, be.rest_seconds, be.hold_seconds, be.is_weighted, be.notes, be.order_index)
      IS DISTINCT FROM (
        (s.x->>'sets')::int,
        (s.x->>'reps')::int,
        (s.x->>'rest_seconds')::int,
        (s.x->>'hold_seconds')::int,
        COALESCE((s.x->>'is_weighted')::boolean, false),
        s.x->>'notes',
        (s.x->>'order_index')::int
      );

  INSERT INTO block_exercises (id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
  SELECT
    v_new_exercise_ids[s.n],
    s.block_id,
    (s.x->>'exercise_id')::uuid,
    (s.x->>'sets')::int,
    (s.x->>'reps')::int,
    (s.x->>'rest_seconds')::int,
    (s.x->>'hold_seconds')::int,
    COALESCE((s.x->>'is_weighted')::boolean, false),
    s.x->>'notes',
    (s.x->>'order_index')::int
  FROM (
    SELECT
      row_number() OVER (ORDER BY t.o, e.eo) AS n,
      v_saved_block_ids[t.o] AS block_id,
      e.x
    FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(b, o)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.b->'exercises', '[]'::jsonb)) WITH ORDINALITY AS e(x, eo)
  ) s
  WHERE v_match_ids[s.n] IS NULL
  ORDER BY s.n;

  SELECT COALESCE(array_agg(COALESCE(v_match_ids[n], v_new_exercise_ids[n])), ARRAY[]::uuid[])
  INTO v_kept_exercise_ids
  FROM generate_series(1, COALESCE(cardinality(v_match_ids), 0)) AS n;

  -- Rows of saved blocks that no saved exercise matched were removed (or
  -- swapped for another exercise) in the Builder.
  IF v_current_block_ids IS NOT NULL THEN
    DELETE FROM block_exercises
    WHERE block_id = ANY(v_current_block_ids)
      AND id <> ALL(v_kept_exercise_ids);
  END IF;

  SELECT MAX(week_number) INTO v_new_max_week
  FROM program_blocks WHERE template_id = v_template_id;

  -- Capture the pre-update state of the (at most one, in practice — each
  -- client assignment clones its own template_id) active assignment on this
  -- template before overwriting current_week, so we can tell the caller
  -- whether this save actually pushed a new week forward.
  SELECT id, current_week INTO v_affected_warrior_program_id, v_previous_week
  FROM warrior_programs
  WHERE template_id = v_template_id AND status = 'active'
  LIMIT 1;

  UPDATE warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE template_id = v_template_id AND status = 'active';

  IF v_affected_warrior_program_id IS NOT NULL
     AND COALESCE(v_new_max_week, 1) > COALESCE(v_previous_week, 1) THEN
    v_week_increased := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'undeletable_block_ids', to_jsonb(v_undeletable_block_ids),
    'week_increased', v_week_increased,
    'warrior_program_id', v_affected_warrior_program_id
  );
END;
$function$;
