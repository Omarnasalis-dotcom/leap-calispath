-- Profiles & read-access hardening (audit 2026-09-25: M1, M2, M20, M21, M22, L5).
--
-- Every change below blocks a write the app never makes directly, or a read
-- the app never uses — verified against the mobile app and admin-web before
-- writing this. Existing data already satisfies the new constraints
-- (0 case-insensitive duplicate usernames, longest is 27 chars, none contain @).

-- ---------------------------------------------------------------------------
-- 1. create_community must run as owner.
--
-- It sets the creator's own community_id (creating a community also joins
-- it). It was SECURITY INVOKER, so with community_id now guarded below it
-- would be rejected. Same auth checks as before; SECURITY DEFINER puts it on
-- the same footing as join_community / leave_community. Body unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_community(p_name text, p_join_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF trim(coalesce(p_name, '')) = '' OR trim(coalesce(p_join_code, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NAME_AND_CODE_REQUIRED');
  END IF;

  BEGIN
    INSERT INTO public.communities (name, join_code, created_by)
    VALUES (trim(p_name), upper(trim(p_join_code)), auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    IF EXISTS (SELECT 1 FROM public.communities WHERE name ILIKE trim(p_name)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'NAME_TAKEN');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'CODE_TAKEN');
    END IF;
  END;

  -- Creating a community also joins it — same "one at a time" rule as
  -- join_community, and there'd be no other way to become a member of a
  -- community you just made.
  UPDATE public.profiles SET community_id = v_id WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'community_id', v_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Guard more profile columns against direct client writes (M1, M2, L5)
--    and make the username set-once (M20).
--
-- Only server-side functions (running as postgres / service_role) may change
-- these: admin_set_coaching_paused, join/leave/create_community, the submit
-- RPCs (best_times, power_pbs), sync_onemm_points (one_mm_rank), the
-- assessment RPC (assessment_locked_until), assign_program_template (coach_id).
-- The app sets display_name only once, in CompleteProfileScreen, while it is
-- still NULL — that path keeps working.
-- ---------------------------------------------------------------------------
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
       NEW.coach_beta_access IS DISTINCT FROM OLD.coach_beta_access OR
       NEW.entitlement_source IS DISTINCT FROM OLD.entitlement_source OR
       NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier OR
       NEW.entitlement_period_start IS DISTINCT FROM OLD.entitlement_period_start OR
       NEW.ai_coach_budget_usd IS DISTINCT FROM OLD.ai_coach_budget_usd OR
       NEW.rc_original_transaction_id IS DISTINCT FROM OLD.rc_original_transaction_id OR
       NEW.duplicate_subscription_flagged_at IS DISTINCT FROM OLD.duplicate_subscription_flagged_at OR
       NEW.duplicate_subscription_previous_transaction_id IS DISTINCT FROM OLD.duplicate_subscription_previous_transaction_id OR
       NEW.free_library_template_id IS DISTINCT FROM OLD.free_library_template_id OR
       -- 2026-09-26 (audit M1, M2, L5)
       NEW.coaching_paused_at IS DISTINCT FROM OLD.coaching_paused_at OR
       NEW.coaching_paused_reason IS DISTINCT FROM OLD.coaching_paused_reason OR
       NEW.community_id IS DISTINCT FROM OLD.community_id OR
       NEW.coach_id IS DISTINCT FROM OLD.coach_id OR
       NEW.best_times IS DISTINCT FROM OLD.best_times OR
       NEW.power_pbs IS DISTINCT FROM OLD.power_pbs OR
       NEW.one_mm_rank IS DISTINCT FROM OLD.one_mm_rank OR
       NEW.assessment_locked_until IS DISTINCT FROM OLD.assessment_locked_until OR
       NEW.email IS DISTINCT FROM OLD.email
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;
    IF OLD.display_name IS NOT NULL AND NEW.display_name IS DISTINCT FROM OLD.display_name THEN
        RAISE EXCEPTION 'Username can only be set once and cannot be changed.';
    END IF;
    IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
        RAISE EXCEPTION 'Gender can only be set once and cannot be changed.';
    END IF;
    IF OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
        RAISE EXCEPTION 'Country can only be set once and cannot be changed.';
    END IF;
    IF OLD.onboarding_completed_at IS NOT NULL AND NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at THEN
        RAISE EXCEPTION 'onboarding_completed_at can only be set once and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Username rules enforced by the database (M20): 1-30 chars, no '@'
--    (the app already rejects '@'), unique ignoring case and outer spaces.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_format
  CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 30 AND position('@' in display_name) = 0));

CREATE UNIQUE INDEX profiles_display_name_lower_unique
  ON public.profiles (lower(trim(display_name)))
  WHERE display_name IS NOT NULL;

-- Availability check now uses exactly the same comparison as the index.
CREATE OR REPLACE FUNCTION public.check_username_available(username text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles WHERE lower(trim(display_name)) = lower(trim(username))
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Coaches read only what they coach (M21).
--
-- "Users can view relevant workout logs" let a coach read EVERY log of any
-- user they ever had a program with (any status), including the user's own
-- or AI-built programs. Dropping it leaves:
--   - "Warriors manage own logs"  -> users still read their own logs
--   - "Coaches view warrior logs" -> coaches read logs of programs they coach
--   - "Admin views all logs"      -> unchanged
-- The coach screens only ever use their own program's logs.
-- Bodyweight is visible to a coach only while they have an ACTIVE program
-- with that user.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view relevant workout logs" ON public.workout_logs;

ALTER POLICY "Coaches view warrior bodyweight logs" ON public.bodyweight_logs
  USING (EXISTS (
    SELECT 1 FROM public.warrior_programs wp
    WHERE wp.warrior_id = bodyweight_logs.warrior_id
      AND wp.coach_id = auth.uid()
      AND wp.status = 'active'
  ));

-- ---------------------------------------------------------------------------
-- 5. Leaderboard raw data requires login (M22). These were readable with just
--    the public app key. Leaderboards are only shown after login.
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can read all power assessments" ON public.power_assessments TO authenticated;
ALTER POLICY "Anyone can read holds" ON public.static_holds TO authenticated;
ALTER POLICY "Anyone can view 1 min max logs" ON public.one_min_max_logs TO authenticated;
ALTER POLICY "Anyone can read entries" ON public.weekly_entries TO authenticated;
