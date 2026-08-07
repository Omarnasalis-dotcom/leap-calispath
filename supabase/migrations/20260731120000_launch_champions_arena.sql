-- Champions Arena is being un-locked. Before now, ArenaService.saveAttempt()
-- did a raw client insert into arena_attempts with a client-computed time —
-- no floor check, no cooldown, unlike every other trial type in the app
-- (submit_trial_result, submit_power_assessment). Fix: add a DB-authoritative
-- floor table (mirrors tier_hard_floors) and a SECURITY DEFINER RPC that
-- validates time bounds, the tier-9 (Eternity) gate, and a submission
-- cooldown before writing, then lock arena_attempts down so all writes go
-- through the RPC and the raw table is no longer world-readable/writable.

create table "public"."arena_phase_hard_floors" (
  "phase_id" text not null,
  "floor_seconds" integer not null,
  "max_seconds" integer not null default 3600,
  constraint "arena_phase_hard_floors_pkey" primary key ("phase_id"),
  constraint "arena_phase_hard_floors_floor_seconds_check" check (floor_seconds > 0),
  constraint "arena_phase_hard_floors_max_seconds_check" check (max_seconds > floor_seconds)
);

alter table "public"."arena_phase_hard_floors" enable row level security;

create policy "Anyone can read arena phase hard floors"
  on "public"."arena_phase_hard_floors" as permissive for select to public using (true);

grant select on table "public"."arena_phase_hard_floors" to "anon";
grant select on table "public"."arena_phase_hard_floors" to "authenticated";
grant select, insert, update, delete on table "public"."arena_phase_hard_floors" to "service_role";

-- Floors set at ~85% of the current pro benchmark time for each phase — fast
-- enough to allow a genuine near-world-class attempt through, but well above
-- what's physically possible to fake by submitting garbage.
insert into "public"."arena_phase_hard_floors" (phase_id, floor_seconds, max_seconds) values
  ('phase-q', 262, 3600), -- 85% of 309s (Jamie's Quarter Finals benchmark)
  ('phase-s', 440, 3600), -- 85% of 518s (Sergio's Semi-Finals benchmark)
  ('phase-f', 625, 3600); -- 85% of 735s (Sergio's Final benchmark)

CREATE OR REPLACE FUNCTION public.submit_arena_attempt(
  p_phase_id text,
  p_time_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_strength_tier integer;
  v_floor integer;
  v_max integer;
  v_last_attempt_at timestamptz;
  v_cooldown_seconds CONSTANT numeric := 30;
  v_seconds_since_last numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  SELECT floor_seconds, max_seconds INTO v_floor, v_max
  FROM public.arena_phase_hard_floors
  WHERE phase_id = p_phase_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHASE');
  END IF;

  IF p_time_seconds IS NULL OR p_time_seconds <= 0 OR p_time_seconds > v_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIME');
  END IF;

  IF p_time_seconds < v_floor THEN
    RETURN jsonb_build_object('success', false, 'error', 'DISHONOR',
      'message', format('Time %ss is below the minimum for this phase (%ss).', p_time_seconds, v_floor));
  END IF;

  SELECT strength_tier INTO v_strength_tier
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_strength_tier < 9 THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN',
      'message', 'Champions Arena requires Eternity tier.');
  END IF;

  -- Per-user cooldown: check this user's most recent attempt directly,
  -- mirroring submit_power_assessment's cooldown pattern (no separate
  -- rate-limit table needed).
  SELECT created_at INTO v_last_attempt_at
  FROM public.arena_attempts
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_attempt_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (now() - v_last_attempt_at));
    IF v_seconds_since_last < v_cooldown_seconds THEN
      RETURN jsonb_build_object('success', false, 'error', 'TOO_FAST',
        'message', format('Please wait %ss before submitting again.', CEIL(v_cooldown_seconds - v_seconds_since_last)));
    END IF;
  END IF;

  INSERT INTO public.arena_attempts (user_id, phase_id, time_in_seconds)
  VALUES (v_user_id, p_phase_id, p_time_seconds);

  RETURN jsonb_build_object('success', true, 'time_in_seconds', p_time_seconds);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_arena_attempt(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_arena_attempt(text, integer) TO authenticated;

-- Lock down arena_attempts: writes now go exclusively through
-- submit_arena_attempt (SECURITY DEFINER, inserts as the function owner),
-- and reads are scoped to the caller's own rows — the worldwide leaderboard
-- already goes through get_arena_worldwide_rankings (SECURITY DEFINER,
-- bypasses RLS), so broad table access was never needed for it to work.
drop policy if exists "Users can insert own arena attempts" on "public"."arena_attempts";
drop policy if exists "Users can update own arena attempts" on "public"."arena_attempts";
drop policy if exists "Users can read all arena attempts" on "public"."arena_attempts";

create policy "Users can read own arena attempts"
  on "public"."arena_attempts" as permissive for select to authenticated
  using (auth.uid() = user_id);

revoke all on table "public"."arena_attempts" from "anon";
revoke insert, update, delete on table "public"."arena_attempts" from "authenticated";
