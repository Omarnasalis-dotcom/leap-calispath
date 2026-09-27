-- Batch: AI safety flags, Weekly Challenge limits, security hygiene
-- (audit 2026-09-25: H5 #4, M7, L2, L3, L4, L25).

-- H5 #4: the AI Coach saves replies its safety guard flags (meal plans,
-- calorie/macro targets, diagnoses, medication) as automated reports.
ALTER TABLE public.ai_coach_message_reports DROP CONSTRAINT ai_coach_message_reports_reason_check;
ALTER TABLE public.ai_coach_message_reports ADD CONSTRAINT ai_coach_message_reports_reason_check
  CHECK (reason IN ('inaccurate', 'inappropriate', 'other', 'auto_safety_flag'));

-- M7: body is the live prod definition with only the marked block added.
CREATE OR REPLACE FUNCTION public.submit_weekly_score(p_challenge_id uuid, p_score numeric, p_metadata jsonb)
 RETURNS TABLE(is_better boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_scoring_type TEXT;
    v_current_score NUMERIC;
    v_is_better BOOLEAN := false;
    v_last_submitted_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
    v_current_week_start DATE;
    v_time_limit INTEGER;
    v_round_points NUMERIC;
    v_total_reps NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Compute current week's Saturday (UTC) — matches ChallengeService.getCurrentWeekStart()
    v_current_week_start := DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC')::date - INTERVAL '1 day';
    -- DATE_TRUNC('week',...) gives Monday; subtract 1 day to get the preceding Sunday,
    -- then add 6 to get Saturday. Actually Saturday = Monday - 2 days in ISO week.
    -- Simpler: current Saturday = most recent date where EXTRACT(DOW) = 6 (Saturday in Postgres).
    v_current_week_start := (NOW() AT TIME ZONE 'UTC')::date
        - ((EXTRACT(DOW FROM NOW() AT TIME ZONE 'UTC')::int + 1) % 7) * INTERVAL '1 day';

    -- Fetch challenge — must be active AND belong to the current week
    SELECT scoring_type,
           time_limit,
           (SELECT sum((m->>'reps')::numeric * (m->>'points')::numeric) FROM jsonb_array_elements(movements) m),
           (SELECT sum((m->>'reps')::numeric) FROM jsonb_array_elements(movements) m)
    INTO v_scoring_type, v_time_limit, v_round_points, v_total_reps
    FROM public.weekly_challenges
    WHERE id = p_challenge_id
      AND is_active = true
      AND week_start = v_current_week_start;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active challenge not found for the current week.';
    END IF;

    -- Validate score bounds
    IF p_score <= 0 OR p_score > 10000 THEN
        RAISE EXCEPTION 'Submitted score exceeds realistic limits.' USING ERRCODE = 'P1001';
    END IF;

    -- Per-challenge plausibility (audit 2026-09-25, M7). Calibrated on
    -- every real entry to date: the fastest genuine "time" entry is well over
    -- 1 s/rep (7 entries at under 0.5 s/rep were impossible), and the best
    -- "reps" entry is 1.11 rounds/min. Limits sit far beyond both.
    IF v_scoring_type = 'time' AND COALESCE(v_total_reps, 0) > 0 AND p_score < v_total_reps THEN
        RAISE EXCEPTION 'That time is faster than is physically possible for this challenge. Please check the time you entered (minutes and seconds).' USING ERRCODE = 'P1001';
    END IF;
    IF v_scoring_type = 'reps' AND COALESCE(v_round_points, 0) > 0 AND COALESCE(v_time_limit, 0) > 0
       AND p_score > v_round_points * (v_time_limit * 3 + 1) THEN
        RAISE EXCEPTION 'That score is higher than is possible in this challenge''s time limit. Please check your rounds and reps.' USING ERRCODE = 'P1001';
    END IF;

    -- Per-user cooldown
    SELECT submitted_at INTO v_last_submitted_at
    FROM public.weekly_entries
    WHERE challenge_id = p_challenge_id AND user_id = v_user_id;

    IF v_last_submitted_at IS NOT NULL THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_submitted_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait % seconds before submitting again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1002';
        END IF;
    END IF;

    -- Fetch existing score for PB comparison
    SELECT score INTO v_current_score
    FROM public.weekly_entries
    WHERE challenge_id = p_challenge_id AND user_id = v_user_id;

    IF v_current_score IS NULL THEN
        v_is_better := true;
    ELSE
        IF v_scoring_type = 'time' THEN
            IF p_score < v_current_score THEN v_is_better := true; END IF;
        ELSE
            IF p_score > v_current_score THEN v_is_better := true; END IF;
        END IF;
    END IF;

    IF v_is_better THEN
        INSERT INTO public.weekly_entries (
            challenge_id, user_id, score, metadata, submitted_at
        )
        VALUES (p_challenge_id, v_user_id, p_score, p_metadata, NOW())
        ON CONFLICT (challenge_id, user_id) DO UPDATE
        SET score        = EXCLUDED.score,
            metadata     = EXCLUDED.metadata,
            submitted_at = EXCLUDED.submitted_at;
    END IF;

    RETURN QUERY SELECT v_is_better;
END;
$function$;

-- L2: the public waitlist forms accepted unlimited-length text and let the
-- submitter set their own status. Existing rows are far inside these limits.
ALTER TABLE public.invite_requests
  ADD CONSTRAINT invite_requests_field_lengths CHECK (
    char_length(name) <= 100 AND char_length(email) <= 254
    AND char_length(coalesce(instagram, '')) <= 100 AND char_length(coalesce(phone, '')) <= 30
    AND char_length(coalesce(why_join, '')) <= 1000
  );
ALTER TABLE public.play_store_testers
  ADD CONSTRAINT play_store_testers_email_length CHECK (char_length(email) <= 254);
ALTER POLICY "Anyone can submit invite requests" ON public.invite_requests WITH CHECK (status = 'pending');
ALTER POLICY "Anyone can sign up for Play Store testing" ON public.play_store_testers WITH CHECK (status = 'pending');

-- L25: these tables had a unique, non-null uuid id but no primary key.
ALTER TABLE public.bodyweight_logs ADD PRIMARY KEY (id);
ALTER TABLE public.coach_week_notes ADD PRIMARY KEY (id);
ALTER TABLE public.workout_set_logs ADD PRIMARY KEY (id);

-- L3: pin search_path on SECURITY DEFINER functions that had none. None
-- use extension functions; auth.* and pg_catalog references are unaffected.
ALTER FUNCTION public.auto_eliminate_non_submitters(p_session_id uuid) SET search_path = public;
ALTER FUNCTION public.claim_clash_victory(session_id uuid, claiming_user_id uuid) SET search_path = public;
ALTER FUNCTION public.claim_tournament_advance_lock(p_session_id uuid) SET search_path = public;
ALTER FUNCTION public.conclude_knockout_tournament(p_session_id uuid, p_winner_user_id uuid) SET search_path = public;
ALTER FUNCTION public.conclude_rank_based_tournament(p_session_id uuid) SET search_path = public;
ALTER FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb) SET search_path = public;
ALTER FUNCTION public.eliminate_tournament_match_losers(p_session_id uuid, p_round integer) SET search_path = public;
ALTER FUNCTION public.finish_clash_session(p_session_id uuid, p_user_id uuid, p_time_seconds integer, p_is_sender boolean) SET search_path = public;
ALTER FUNCTION public.get_arena_worldwide_rankings(p_phase_id text, p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.get_global_well_rounded_leaderboard(p_community_id uuid) SET search_path = public;
ALTER FUNCTION public.get_onemm_category_leaderboard(p_category_id text, p_community_id uuid) SET search_path = public;
ALTER FUNCTION public.get_onemm_well_rounded_leaderboard(p_community_id uuid) SET search_path = public;
ALTER FUNCTION public.get_static_level_leaderboard(l_id integer, m_ids text[], p_community_id uuid) SET search_path = public;
ALTER FUNCTION public.get_static_movement_leaderboard(m_id text, p_community_id uuid) SET search_path = public;
ALTER FUNCTION public.get_static_well_rounded_leaderboard(p_community_id uuid) SET search_path = public;
ALTER FUNCTION public.get_tier_leaderboard(tier_num integer, p_community_id uuid) SET search_path = public;
ALTER FUNCTION public.handle_clash_victory() SET search_path = public;
ALTER FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.release_invite_code(p_code text) SET search_path = public;
ALTER FUNCTION public.release_tournament_advance_lock(p_session_id uuid) SET search_path = public;
ALTER FUNCTION public.reserve_invite_code(p_code text) SET search_path = public;
ALTER FUNCTION public.submit_arena_attempt(p_phase_id text, p_time_seconds integer) SET search_path = public;
ALTER FUNCTION public.submit_trial_result(p_tier integer, p_time_seconds numeric, p_mode text) SET search_path = public;
ALTER FUNCTION public.sync_onemm_points(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.sync_static_points(p_user_id uuid) SET search_path = public;

-- L4: SECURITY DEFINER functions were executable by anon (via PUBLIC). All
-- of these need a signed-in user anyway (they check auth.uid() / roles), so
-- close them to anon and keep authenticated + service_role explicitly.
-- Left open: reserve/release_invite_code (called before sign-up by older
-- app builds) and is_admin/is_assistant_for/is_coaching_paused (used inside
-- RLS policies — a policy calling a function the role can't execute errors
-- instead of filtering). Trigger functions are unaffected.
REVOKE EXECUTE ON FUNCTION public.acknowledge_duplicate_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_duplicate_subscription() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_get_communities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_communities() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(p_query text, p_sort text, p_desc boolean, p_limit integer, p_offset integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(p_query text, p_sort text, p_desc boolean, p_limit integer, p_offset integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_add_block_to_week(p_warrior_program_id uuid, p_week_number integer, p_blocks jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_add_block_to_week(p_warrior_program_id uuid, p_week_number integer, p_blocks jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_adjust_program(p_warrior_program_id uuid, p_changes jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_adjust_program(p_warrior_program_id uuid, p_changes jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_append_week(p_warrior_program_id uuid, p_blocks jsonb, p_removed_block_names text[], p_carry_order_overrides jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_append_week(p_warrior_program_id uuid, p_blocks jsonb, p_removed_block_names text[], p_carry_order_overrides jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_create_program(p_name text, p_description text, p_blocks jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_create_program(p_name text, p_description text, p_blocks jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_create_program_from_workouts(p_workout_ids uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_create_program_from_workouts(p_workout_ids uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_delete_week(p_warrior_program_id uuid, p_week_number integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_delete_week(p_warrior_program_id uuid, p_week_number integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_end_program(p_warrior_program_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_end_program(p_warrior_program_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_log_chat_request(p_platform text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_log_chat_request(p_platform text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_replace_block_exercises(p_warrior_program_id uuid, p_block_id uuid, p_exercises jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_replace_block_exercises(p_warrior_program_id uuid, p_block_id uuid, p_exercises jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_replace_day_in_week(p_warrior_program_id uuid, p_week_number integer, p_day_name text, p_blocks jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_replace_day_in_week(p_warrior_program_id uuid, p_week_number integer, p_day_name text, p_blocks jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_coach_update_block_structure(p_warrior_program_id uuid, p_changes jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_update_block_structure(p_warrior_program_id uuid, p_changes jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.append_weeks_to_client_program(p_warrior_program_id uuid, p_blocks jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_weeks_to_client_program(p_warrior_program_id uuid, p_blocks jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.archive_and_append_client_program(p_warrior_program_id uuid, p_blocks jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_and_append_client_program(p_warrior_program_id uuid, p_blocks jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.assign_program_template(p_coach_id uuid, p_warrior_id uuid, p_template_id uuid, p_custom_name text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_program_template(p_coach_id uuid, p_warrior_id uuid, p_template_id uuid, p_custom_name text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.auto_eliminate_non_submitters(p_session_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_eliminate_non_submitters(p_session_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.caller_effective_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_effective_tier() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.caller_has_pro_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_has_pro_access() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.caller_is_pro_or_max() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_pro_or_max() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.caller_rc_transaction_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_rc_transaction_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_username_available(username text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_username_available(username text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_clash_victory(session_id uuid, claiming_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_clash_victory(session_id uuid, claiming_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_tournament_advance_lock(p_session_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_tournament_advance_lock(p_session_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.conclude_knockout_tournament(p_session_id uuid, p_winner_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conclude_knockout_tournament(p_session_id uuid, p_winner_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.conclude_rank_based_tournament(p_session_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conclude_rank_based_tournament(p_session_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_community(p_name text, p_join_code text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_community(p_name text, p_join_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_custom_program_from_workouts(p_workout_ids uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_custom_program_from_workouts(p_workout_ids uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_coach_client_data(p_assignment_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_coach_client_data(p_assignment_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_coach_week_data(p_template_id uuid, p_week_number integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_coach_week_data(p_template_id uuid, p_week_number integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.eliminate_tournament_match_losers(p_session_id uuid, p_round integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminate_tournament_match_losers(p_session_id uuid, p_round integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.end_active_program() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_active_program() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_global_well_rounded_leaderboard(p_community_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_global_well_rounded_leaderboard(p_community_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_onemm_category_leaderboard(p_category_id text, p_community_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onemm_category_leaderboard(p_category_id text, p_community_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_onemm_well_rounded_leaderboard(p_community_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onemm_well_rounded_leaderboard(p_community_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_static_level_leaderboard(l_id integer, m_ids text[], p_community_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_static_level_leaderboard(l_id integer, m_ids text[], p_community_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_static_movement_leaderboard(m_id text, p_community_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_static_movement_leaderboard(m_id text, p_community_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_static_well_rounded_leaderboard(p_community_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_static_well_rounded_leaderboard(p_community_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_tier_leaderboard(tier_num integer, p_community_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tier_leaderboard(tier_num integer, p_community_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_warrior_progress(p_warrior_program_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_warrior_progress(p_warrior_program_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_weekly_activity_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_activity_stats() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.join_community(p_join_code text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_community(p_join_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.leave_community() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_community() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.overwrite_client_program(p_warrior_program_id uuid, p_blocks jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.overwrite_client_program(p_warrior_program_id uuid, p_blocks jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.release_tournament_advance_lock(p_session_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_tournament_advance_lock(p_session_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_standalone_workout(p_workout_id uuid, p_kind text, p_title text, p_description text, p_category text, p_difficulty text, p_format text, p_duration_minutes integer, p_is_free boolean, p_status text, p_blocks jsonb, p_cover_image_url text, p_goal_tags text[], p_tier_min smallint, p_tier_max smallint, p_interval_seconds smallint, p_rounds smallint, p_is_skill boolean, p_skill_label text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_standalone_workout(p_workout_id uuid, p_kind text, p_title text, p_description text, p_category text, p_difficulty text, p_format text, p_duration_minutes integer, p_is_free boolean, p_status text, p_blocks jsonb, p_cover_image_url text, p_goal_tags text[], p_tier_min smallint, p_tier_max smallint, p_interval_seconds smallint, p_rounds smallint, p_is_skill boolean, p_skill_label text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.select_library_template(p_template_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_library_template(p_template_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer, p_force boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer, p_force boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric, p_force boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric, p_force boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric, p_force boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric, p_force boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_trial_result(p_tier integer, p_time_seconds numeric, p_mode text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_trial_result(p_tier integer, p_time_seconds numeric, p_mode text) TO authenticated, service_role;
