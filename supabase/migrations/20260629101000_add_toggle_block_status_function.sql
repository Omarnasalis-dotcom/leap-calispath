-- handleToggleBlockStatus previously ran the delete-then-insert as two
-- separate client calls with no transaction, and the checkbox that triggers
-- it has no in-flight guard, so a double-tap could race two delete+insert
-- sequences against each other. Wrapping both statements in one RPC closes
-- the visibility window between them.
--
-- SECURITY INVOKER (default): WarriorProgramScreen is only ever opened by
-- warriors viewing their own program (app/warrior-program.tsx always passes
-- warriorId={user.id}), so the existing "Warriors manage own logs" RLS
-- policy on workout_logs already enforces warrior_id = auth.uid() without
-- any extra checks needed here.
--
-- p_start_of_today is passed in (rather than computed with now() server-side)
-- to preserve the client's existing local-midnight boundary — the warrior's
-- device timezone, not the server's.
CREATE OR REPLACE FUNCTION public.toggle_block_status(
  p_warrior_id uuid,
  p_warrior_program_id uuid,
  p_block_id uuid,
  p_next_status text,
  p_start_of_today timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM workout_logs
  WHERE warrior_id = p_warrior_id
    AND block_id = p_block_id
    AND completed_at >= p_start_of_today;

  IF p_next_status <> 'none' THEN
    INSERT INTO workout_logs (warrior_program_id, warrior_id, block_id, notes, rating)
    VALUES (
      p_warrior_program_id,
      p_warrior_id,
      p_block_id,
      CASE WHEN p_next_status = 'missed' THEN '[STATUS:MISSED]' ELSE '' END,
      5
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;
