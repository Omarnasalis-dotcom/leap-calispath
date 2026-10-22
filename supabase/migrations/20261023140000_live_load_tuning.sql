-- Live Tournament: load tuning before live events (2026-10-22).
--
-- Production runs a small compute (max_connections 60), so the per-phone
-- cost of a room matters:
-- 1. live_touch wrote last_seen_at on every call (each phone polls every
--    few seconds). It now writes only when the stored time is 5+ s old;
--    the online window is 15 s, so dots stay accurate with ~60% fewer writes.
-- 2. submit_live_reps touched live_rooms.last_activity_at on every log.
--    That column only feeds the lobby idle timer, and each touch is a
--    realtime event that makes every phone in the room reload (24 logs in
--    a 24-player room = ~576 reloads). The touch is gone; closing the half
--    still updates the room, so phones move on immediately.
-- 3. send-live-room-push filters notifications by type + data->>'room_id';
--    a partial index keeps that off a full scan (26k rows and growing).
-- Functions are copied from 20261022120000 with only these changes.

CREATE OR REPLACE FUNCTION public.live_touch(p_room_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO live_room_presence (room_id, user_id, last_seen_at)
  SELECT p_room_id, auth.uid(), now()
  WHERE auth.uid() IS NOT NULL
  ON CONFLICT (room_id, user_id) DO UPDATE SET last_seen_at = now()
  WHERE live_room_presence.last_seen_at < now() - interval '5 seconds';
$function$;

CREATE OR REPLACE FUNCTION public.submit_live_reps(p_room_id uuid, p_half integer, p_user_id uuid, p_reps integer[])
RETURNS TABLE (points numeric, half_closed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid := COALESCE(p_user_id, auth.uid());
  v_room live_rooms%ROWTYPE;
  v_challenge live_challenges%ROWTYPE;
  v_movements jsonb;
  v_side smallint;
  v_points numeric;
  v_closed boolean;
BEGIN
  v_room := public.live_lock_room(p_room_id);
  SELECT * INTO v_challenge FROM live_challenges WHERE id = v_room.challenge_id;

  IF v_target <> v_uid AND v_uid IS DISTINCT FROM public.live_room_host(p_room_id) THEN
    RAISE EXCEPTION 'NOT_HOST';
  END IF;
  SELECT side INTO v_side FROM live_room_players WHERE room_id = p_room_id AND user_id = v_target;
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'NOT_IN_ROOM';
  END IF;
  IF v_room.status NOT IN ('playing', 'finished') OR p_half IS DISTINCT FROM v_room.current_half::integer THEN
    RAISE EXCEPTION 'WRONG_HALF';
  END IF;
  IF v_room.half_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'LOGGING_CLOSED';
  END IF;
  IF now() < v_room.half_ends_at - interval '2 seconds' THEN
    RAISE EXCEPTION 'TIME_NOT_UP';
  END IF;

  v_movements := public.live_half_movements(v_challenge.halves, p_half);
  IF p_reps IS NULL OR array_ndims(p_reps) IS DISTINCT FROM 1
     OR array_length(p_reps, 1) <> jsonb_array_length(v_movements)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_movements) WITH ORDINALITY AS m(value, ord)
       WHERE p_reps[m.ord::integer] IS NULL
          OR p_reps[m.ord::integer] < 0
          OR p_reps[m.ord::integer] > (m.value->>'reps')::integer
     ) THEN
    RAISE EXCEPTION 'INVALID_REPS';
  END IF;

  v_points := public.live_reps_points(v_movements, p_reps);

  INSERT INTO live_half_results (room_id, half, user_id, side, reps, points, entered_by)
  VALUES (p_room_id, p_half, v_target, v_side, p_reps, v_points, v_uid)
  ON CONFLICT (room_id, half, user_id) DO UPDATE
    SET reps = EXCLUDED.reps, points = EXCLUDED.points, entered_by = EXCLUDED.entered_by,
        updated_at = now();

  -- (No live_rooms touch here: it only feeds the lobby idle timer, and every
  -- touch sends a realtime event that makes every phone in the room reload.)

  v_closed := NOT EXISTS (
    SELECT 1 FROM live_room_players p
    WHERE p.room_id = p_room_id AND p.user_id IS NOT NULL AND p.side IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM live_half_results r
                      WHERE r.room_id = p_room_id AND r.half = p_half AND r.user_id = p.user_id)
  );
  IF v_closed THEN
    PERFORM public.live_close_half(p_room_id, now());
  END IF;

  RETURN QUERY SELECT v_points, v_closed;
END;
$function$;

CREATE INDEX IF NOT EXISTS notifications_live_half_started_room_idx
  ON public.notifications ((data->>'room_id'), created_at)
  WHERE type = 'live_half_started';
