-- Powers the Profile tab's QuickStatsRow (streak / points this week /
-- workouts this week), replacing hardcoded placeholder values on the
-- client. Also fixes a dormant bug: profiles.streak has existed since the
-- original schema and is read by calculate_glory()'s streak*5 bonus, but
-- nothing has ever written to it, so that bonus has silently been +0 for
-- every user. This function computes a real streak from activity history
-- and persists it back to profiles.streak (guard_profile_protected_fields
-- already lets this through, since SECURITY DEFINER functions created by
-- migrations run as current_user = 'postgres', which that trigger exempts —
-- same mechanism submit_power_assessment relies on for power_tier).
--
-- "Points this week" is a true marginal delta, not a raw sum of logged
-- activity, so repeat non-PB attempts don't inflate it: for static and
-- 1MM we compare each movement/pattern's best score before vs. through the
-- 7-day cutoff (mirroring the same peak-per-movement / peak-per-pattern
-- aggregation sync_static_points and sync_onemm_points already use for the
-- real cumulative totals). Power now has the same shape of history via
-- power_assessment_log (added in the prior migration, since
-- power_assessments itself is a single upserted row per user with no
-- history) — its delta replays the running max of each lift over time and
-- compares the combined score before vs. through the cutoff.
--
-- "Workouts this week" combines both real activity sources per product
-- decision: coach-assigned program sessions (workout_logs) and completed
-- strength-tier trial attempts (trial_history), since workout_logs alone
-- is empty for any user not currently enrolled in a Warrior Program.
CREATE OR REPLACE FUNCTION public.get_weekly_activity_stats()
 RETURNS TABLE(streak_days integer, points_this_week numeric, workouts_this_week integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_streak INTEGER := 0;
    v_static_delta NUMERIC := 0;
    v_onemm_delta NUMERIC := 0;
    v_power_delta NUMERIC := 0;
    v_workouts INTEGER := 0;
    v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '7 days';
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Streak: union distinct activity dates across every discipline, then
    -- find the length of the consecutive-day run ending today or
    -- yesterday (so the streak doesn't drop to 0 mid-day before the
    -- user's first workout of the day).
    WITH activity_dates AS (
        SELECT DISTINCT (attempted_at AT TIME ZONE 'UTC')::date AS d
        FROM public.trial_history
        WHERE user_id = v_user_id AND completed = true
        UNION
        SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date
        FROM public.static_hold_attempts
        WHERE user_id = v_user_id AND accepted = true
        UNION
        SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date
        FROM public.one_min_max_logs
        WHERE user_id = v_user_id
        UNION
        SELECT DISTINCT (assessed_at AT TIME ZONE 'UTC')::date
        FROM public.power_assessments
        WHERE user_id = v_user_id
        UNION
        SELECT DISTINCT (completed_at AT TIME ZONE 'UTC')::date
        FROM public.workout_logs
        WHERE warrior_id = v_user_id
    ),
    islands AS (
        SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d) * INTERVAL '1 day') AS grp
        FROM activity_dates
        WHERE d <= CURRENT_DATE
    ),
    latest_island AS (
        SELECT COUNT(*) AS streak_len, MAX(d) AS last_day
        FROM islands
        GROUP BY grp
        ORDER BY MAX(d) DESC
        LIMIT 1
    )
    SELECT CASE WHEN last_day >= CURRENT_DATE - 1 THEN streak_len ELSE 0 END
    INTO v_streak
    FROM latest_island;

    v_streak := COALESCE(v_streak, 0);
    UPDATE public.profiles SET streak = v_streak WHERE id = v_user_id;

    -- Static points delta: peak points per movement, before the cutoff vs. overall.
    WITH sa AS (
        SELECT sha.movement_id, sha.created_at, sha.hold_seconds * sm.multiplier AS points
        FROM public.static_hold_attempts sha
        JOIN public.static_movements sm ON sm.id = sha.movement_id
        WHERE sha.user_id = v_user_id AND sha.accepted = true
    ),
    per_movement AS (
        SELECT
            COALESCE(MAX(points) FILTER (WHERE created_at < v_cutoff), 0) AS before_pts,
            COALESCE(MAX(points), 0) AS current_pts
        FROM sa
        GROUP BY movement_id
    )
    SELECT COALESCE(SUM(GREATEST(current_pts - before_pts, 0)), 0)
    INTO v_static_delta
    FROM per_movement;

    -- 1MM points delta: peak points per pattern (mirrors sync_onemm_points),
    -- before the cutoff vs. overall.
    WITH ol AS (
        SELECT om.pattern_id, omml.created_at, omml.points
        FROM public.one_min_max_logs omml
        JOIN public.onemm_movements om ON om.id = omml.movement_id
        WHERE omml.user_id = v_user_id
    ),
    per_pattern AS (
        SELECT
            COALESCE(MAX(points) FILTER (WHERE created_at < v_cutoff), 0) AS before_pts,
            COALESCE(MAX(points), 0) AS current_pts
        FROM ol
        GROUP BY pattern_id
    )
    SELECT COALESCE(SUM(GREATEST(current_pts - before_pts, 0)), 0)
    INTO v_onemm_delta
    FROM per_pattern;

    -- Power points delta: replay the running max of each lift over time
    -- (mirrors the GREATEST-merge submit_power_assessment applies), then
    -- compare the combined weighted score before the cutoff vs. overall —
    -- same shape as the static/1MM deltas above.
    WITH running AS (
        SELECT
            created_at,
            MAX(pullup_1rm) OVER (ORDER BY created_at) AS run_pullup,
            MAX(dip_1rm) OVER (ORDER BY created_at) AS run_dip,
            MAX(squat_1rm) OVER (ORDER BY created_at) AS run_squat,
            MAX(muscleup_1rm) OVER (ORDER BY created_at) AS run_muscleup
        FROM public.power_assessment_log
        WHERE user_id = v_user_id
    ),
    scored AS (
        SELECT created_at, (run_pullup + run_dip + run_squat + run_muscleup * 2) AS score
        FROM running
    )
    SELECT GREATEST(
        COALESCE(MAX(score), 0) - COALESCE(MAX(score) FILTER (WHERE created_at < v_cutoff), 0),
        0
    )
    INTO v_power_delta
    FROM scored;

    -- Workouts this week: coach-program sessions + completed strength trials.
    SELECT
        (SELECT COUNT(*) FROM public.workout_logs WHERE warrior_id = v_user_id AND completed_at >= v_cutoff)
        + (SELECT COUNT(*) FROM public.trial_history WHERE user_id = v_user_id AND completed = true AND attempted_at >= v_cutoff)
    INTO v_workouts;

    RETURN QUERY SELECT
        v_streak,
        (v_static_delta + v_onemm_delta + v_power_delta),
        v_workouts;
END;
$function$
;

GRANT EXECUTE ON FUNCTION public.get_weekly_activity_stats() TO authenticated;
