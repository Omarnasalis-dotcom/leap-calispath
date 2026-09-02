-- Closes a real gap found in a full training-center/subscription audit:
-- min_access_tier (added 20260831040000) was only ever enforced client-side
-- (WarriorProgramScreen.tsx's isLockedByTier swaps the whole screen for an
-- "upgrade to keep this program" card) — the actual mutating RPC that logs
-- workout progress had no server-side awareness of it at all. Two real,
-- non-hypothetical ways that mattered: (1) a subscription lapsing mid-
-- session, before the client's next profile refresh re-evaluates the lock,
-- and (2) anyone calling this RPC directly instead of through the app.
--
-- Only "completed" is gated — matches this function's own pre-existing
-- design for isBlockLocked (day/order locks), documented in
-- WarriorProgramScreen.tsx's own comment: "missed" (skip) stays allowed
-- even while locked, so a warrior can record/skip past it rather than
-- being stuck; only gaining a genuine "completed" credit requires meeting
-- the program's min_access_tier. Clearing a log ('none') is unaffected
-- either way — that's undoing a record, not gaining one.
--
-- caller_effective_tier() (existing helper, already the single source of
-- truth for every other gate in the app) is reused rather than
-- reimplementing tier resolution here, so this can never drift from
-- getSubscriptionTier()/every other server-side check.
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
  v_min_access_tier text;
  v_caller_tier text;
  v_tier_rank jsonb := '{"free":0,"first":1,"pro":2,"max":3}'::jsonb;
BEGIN
  IF p_next_status = 'completed' THEN
    SELECT pt.min_access_tier INTO v_min_access_tier
    FROM warrior_programs wp
    JOIN program_templates pt ON pt.id = wp.template_id
    WHERE wp.id = p_warrior_program_id;

    IF v_min_access_tier IS NOT NULL THEN
      v_caller_tier := public.caller_effective_tier();
      IF COALESCE((v_tier_rank ->> v_caller_tier)::int, 0) < COALESCE((v_tier_rank ->> v_min_access_tier)::int, 0) THEN
        RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

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
