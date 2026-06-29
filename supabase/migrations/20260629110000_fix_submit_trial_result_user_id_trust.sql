-- submit_trial_result took p_user_id as a trusted client-supplied parameter
-- with no check that it matched the caller. It's SECURITY DEFINER, so this
-- let any authenticated caller forge another user's id and corrupt their
-- best_times/strength_tier — verified exploitable locally (an authenticated
-- attacker called the RPC directly with a victim's id and a 1-second time,
-- bypassing the hard-floor/cooldown checks that only exist in the edge
-- function, not here).
--
-- The fix is to drop p_user_id entirely and use auth.uid() internally, the
-- standard safe pattern for a SECURITY DEFINER function meant to act on the
-- caller's own row. This also sidesteps a nasty discovery made while fixing
-- this: revoking EXECUTE from anon/authenticated (the other obvious fix)
-- segfaults this Postgres build's backend on every call from a role lacking
-- privilege, when invoked through PostgREST's named-parameter RPC calling
-- convention — reproduced with a trivial unrelated function too, so it's an
-- engine-level issue with this Postgres/PostgREST combination, not something
-- specific to this function. Not relying on REVOKE avoids that path entirely:
-- default EXECUTE grants stay untouched, and authorization is enforced by
-- auth.uid() inside the function body instead, the same pattern already used
-- safely by assign_program_template/delete_coach_week_data/
-- delete_coach_client_data elsewhere in this schema.
DROP FUNCTION IF EXISTS public.submit_trial_result(uuid, integer, numeric, text);

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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- Lock the profile row for the duration of this transaction to avoid
  -- racing concurrent submissions from the same user.
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
