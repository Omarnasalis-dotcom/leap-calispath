-- TIER_HARD_FLOORS was duplicated between the Edge Function
-- (supabase/functions/submit-trial-result/index.ts) and the client
-- (src/constants/Progression.ts), with no enforcement in the DB itself.
-- A user calling submit_trial_result directly (bypassing the Edge Function)
-- could submit any time > 0 without hitting the floor check.
--
-- Fix: add a tier_hard_floors reference table and enforce both the floor
-- AND a 3600s upper cap inside submit_trial_result, making the DB the
-- authoritative validator regardless of which call path is used.
-- The Edge Function's hardcoded copy and client's Progression.ts copy
-- become fast-fail caches (reduce unnecessary DB/network round-trips) —
-- clearly noted as such in each file. They must remain in sync with this
-- table if thresholds ever change.
create table "public"."tier_hard_floors" (
  "tier" integer not null,
  "floor_seconds" integer not null,
  constraint "tier_hard_floors_pkey" primary key ("tier"),
  constraint "tier_hard_floors_tier_check" check (tier >= 0 and tier <= 9),
  constraint "tier_hard_floors_floor_seconds_check" check (floor_seconds > 0)
);

alter table "public"."tier_hard_floors" enable row level security;

create policy "Anyone can read tier hard floors"
  on "public"."tier_hard_floors" as permissive for select to public using (true);

grant select on table "public"."tier_hard_floors" to "anon";
grant select on table "public"."tier_hard_floors" to "authenticated";
grant select, insert, update, delete on table "public"."tier_hard_floors" to "service_role";

insert into "public"."tier_hard_floors" (tier, floor_seconds) values
  (0, 25),
  (1, 90),
  (2, 150),
  (3, 180),
  (4, 200),
  (5, 220),
  (6, 250),
  (7, 360),
  (8, 480),
  (9, 600);

-- Rewrite submit_trial_result to validate time_seconds against the DB table
-- (floor check) and enforce the 3600s upper cap server-side. All other logic
-- is unchanged from 20260629110000_fix_submit_trial_result_user_id_trust.sql.
DROP FUNCTION IF EXISTS public.submit_trial_result(integer, numeric, text);
CREATE OR REPLACE FUNCTION public.submit_trial_result(
  p_tier integer,
  p_time_seconds numeric,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_best_times jsonb;
  v_current_best numeric;
  v_new_tier integer;
  v_prev_best_time numeric;
  v_prev_completed_count integer;
  v_is_first_completion boolean;
  v_is_new_best boolean;
  v_tier_advanced boolean;
  v_floor integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Validate time bounds against the DB-authoritative floor table
  SELECT floor_seconds INTO v_floor
  FROM public.tier_hard_floors
  WHERE tier = p_tier;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIER');
  END IF;

  IF p_time_seconds <= 0 OR p_time_seconds > 3600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIME');
  END IF;

  IF p_time_seconds < v_floor THEN
    RETURN jsonb_build_object('success', false, 'error', 'DISHONOR',
      'message', format('Time %ss is below the minimum for Tier %s (%ss).', p_time_seconds, p_tier, v_floor));
  END IF;

  -- Lock the profile row to avoid racing concurrent submissions
  SELECT strength_tier, best_times INTO v_profile
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF p_tier > v_profile.strength_tier THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT MIN(time_seconds)::numeric, COUNT(*)
  INTO v_prev_best_time, v_prev_completed_count
  FROM trial_history
  WHERE user_id = v_user_id AND tier_attempted = p_tier AND completed = true;

  v_is_first_completion := (v_prev_completed_count = 0);
  v_is_new_best := (NOT v_is_first_completion) AND (p_time_seconds < v_prev_best_time);

  INSERT INTO trial_history (user_id, tier_attempted, time_seconds, completed)
  VALUES (v_user_id, p_tier, p_time_seconds, true);

  v_tier_advanced := false;

  IF p_mode = 'progression' THEN
    v_best_times := COALESCE(v_profile.best_times, '{}'::jsonb);
    v_current_best := (v_best_times ->> p_tier::text)::numeric;

    IF v_current_best IS NULL OR p_time_seconds < v_current_best THEN
      v_best_times := jsonb_set(v_best_times, ARRAY[p_tier::text], to_jsonb(p_time_seconds));
    END IF;

    v_new_tier := CASE WHEN p_tier = v_profile.strength_tier
      THEN LEAST(p_tier + 1, 9)
      ELSE v_profile.strength_tier
    END;
    v_tier_advanced := (v_new_tier > v_profile.strength_tier);

    UPDATE profiles
    SET best_times = v_best_times,
        strength_tier = GREATEST(v_new_tier, v_profile.strength_tier)
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_first_completion', v_is_first_completion,
    'is_new_best', v_is_new_best,
    'tier_advanced', v_tier_advanced,
    'previous_best_time_seconds', v_prev_best_time
  );
END;
$function$;

-- Also add a comment to submit_power_assessment's tier-threshold logic
-- cross-referencing src/lib/powerLogic.ts's POWER_LEVELS (Ampere=100,
-- Tesla=250). This acknowledges the 2-place duplication and directs
-- future maintainers to update both if thresholds ever change.
COMMENT ON FUNCTION public.submit_power_assessment(numeric, numeric, numeric, numeric) IS
  'Tier thresholds (Ampere>=100, Tesla>=250) must match POWER_LEVELS in src/lib/powerLogic.ts.';
