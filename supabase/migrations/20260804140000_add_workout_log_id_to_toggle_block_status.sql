-- toggle_block_status previously returned only {success: true}, unlike its
-- sibling log_block_with_sets which returns the inserted workout_log_id.
-- The client now needs that id after a 'completed' toggle to trigger a
-- coach notification (notify-coach-workout-logged Edge Function) — same
-- signature and trust model as the original, just capturing and returning
-- the row id.
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
DECLARE
  v_workout_log_id uuid;
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
    )
    RETURNING id INTO v_workout_log_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'workout_log_id', v_workout_log_id);
END;
$function$;
