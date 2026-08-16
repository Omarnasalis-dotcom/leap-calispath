-- Pre-monetization security fix (Phase 0 of the IAP/subscription rollout).
--
-- access_granted_at / access_expires_at / invite_code_used / coach_beta_access
-- are not in guard_profile_protected_fields()'s protected-column list, and
-- the "Warriors can update own profile" RLS policy (auth.uid() = id) has no
-- column restriction. Right now, any authenticated user can run
-- supabase.from('profiles').update({ access_expires_at: '2099-01-01' })
-- .eq('id', myId) directly and grant themselves permanent access for free.
-- This is harmless today only because access_expires_at is write-only
-- (nothing reads it back yet) — it becomes a direct payment-bypass the
-- moment the paywall gate ships, so it's closed here, first, independently.
--
-- Layered on top of the current guard_profile_protected_fields()
-- (20260814120000_guard_profile_set_once_fields.sql), which added the
-- gender/country set-once rule — that logic is preserved unchanged below.
CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR
       NEW.is_coach IS DISTINCT FROM OLD.is_coach OR
       NEW.strength_tier IS DISTINCT FROM OLD.strength_tier OR
       NEW.power_tier IS DISTINCT FROM OLD.power_tier OR
       NEW.statics_tier IS DISTINCT FROM OLD.statics_tier OR
       NEW.glory_score IS DISTINCT FROM OLD.glory_score OR
       NEW.streak IS DISTINCT FROM OLD.streak OR
       NEW.trials_passed IS DISTINCT FROM OLD.trials_passed OR
       NEW.power_points IS DISTINCT FROM OLD.power_points OR
       NEW.one_mm_points IS DISTINCT FROM OLD.one_mm_points OR
       NEW.clash_win_streak IS DISTINCT FROM OLD.clash_win_streak OR
       NEW.tournament_gp IS DISTINCT FROM OLD.tournament_gp OR
       NEW.access_granted_at IS DISTINCT FROM OLD.access_granted_at OR
       NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at OR
       NEW.invite_code_used IS DISTINCT FROM OLD.invite_code_used OR
       NEW.coach_beta_access IS DISTINCT FROM OLD.coach_beta_access
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;
    IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
        RAISE EXCEPTION 'Gender can only be set once and cannot be changed.';
    END IF;
    IF OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
        RAISE EXCEPTION 'Country can only be set once and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$function$;

-- redeem_invite_code: two fixes.
--
-- 1. The admin UI (AdminTournamentScreen.tsx CodesTab) can mint 'master'
--    type codes, but this CASE had no 'master' branch, so master codes
--    silently fell into the 7-day ELSE clause instead of the no-expiry
--    treatment their MASTER- prefix and admin-only intent implies. Given
--    'lifetime' already same-classes as "no meaningful expiry" via a
--    100-year interval, master gets the same treatment.
--
-- 2. Redemption now extends whatever access already exists instead of
--    overwriting it. Every new signup gets an automatic trial grant
--    (see the next migration in this rollout), and paid subscriptions grant
--    access via a separate RevenueCat-driven path — redeem_invite_code's
--    real remaining job is to be a top-up on top of either of those (comp
--    codes, bonus extensions, QA master keys), not a competing source of
--    truth that can accidentally shorten someone's access by overwriting a
--    later expiry with an earlier one. access_granted_at is left untouched
--    once already set — it records the first time this user ever got
--    access, not the most recent code redemption.
CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_code_id uuid;
  v_type text;
  v_duration interval;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  -- Finalize the claim. We only need to check if used_by IS NULL
  -- because the frontend has already acquired the timestamp lock for this flow.
  UPDATE invite_codes
  SET used_by = p_user_id, used_at = now()
  WHERE code ILIKE p_code
    AND used_by IS NULL
  RETURNING id, type INTO v_code_id, v_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code not found or already used');
  END IF;

  CASE v_type
    WHEN 'trial_14' THEN v_duration := interval '14 days';
    WHEN 'member_30' THEN v_duration := interval '30 days';
    WHEN 'member_90' THEN v_duration := interval '90 days';
    WHEN 'lifetime' THEN v_duration := interval '100 years';
    WHEN 'master' THEN v_duration := interval '100 years';
    ELSE v_duration := interval '7 days';
  END CASE;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now()) + v_duration,
    invite_code_used = p_code
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

-- Close the matching READ exposure: access_granted_at/access_expires_at/
-- invite_code_used are currently in the cross-user-readable safe-column
-- grant (20260725110000_reenforce_profiles_column_select_lockdown.sql),
-- meaning any authenticated user can currently see a stranger's trial or
-- subscription expiry. Once this represents real subscription status,
-- that's an unnecessary exposure with no legitimate cross-user use case
-- (unlike display_name/tiers/scores, which leaderboards and coaching
-- screens genuinely need to read for other users).
--
-- Per the documented gotcha in 20260725110000: REVOKE SELECT ON TABLE also
-- strips existing column-level grants for that role, not just the
-- table-level one, so the revoke and the trimmed re-grant must happen in
-- the same transaction. coach_beta_access is left readable (unchanged,
-- non-sensitive boolean, not a monetization field). Own-row reads of the
-- three removed columns continue via get_my_profile() (SECURITY DEFINER),
-- unaffected.
REVOKE SELECT ON TABLE public.profiles FROM authenticated;

GRANT SELECT (
  id, display_name, strength_tier, power_tier, statics_tier,
  glory_score, streak, last_active, assessed_at, assessment_locked_until,
  power_assessed_at, statics_assessed_at, best_times, trials_attempted,
  trials_passed, is_public, updated_at, power_pbs, power_points,
  is_admin, is_searching_clash, tournament_gp, clash_win_streak,
  one_mm_points, one_mm_rank, coach_beta_access,
  is_coach, coach_id, gender, country,
  community_id
) ON TABLE public.profiles TO authenticated;
