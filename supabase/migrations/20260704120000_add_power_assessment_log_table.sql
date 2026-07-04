-- power_assessments is upsert-only (one row per user, each of the 4 lifts
-- independently kept at its all-time max via GREATEST) — there is no history
-- at all, unlike Static (static_holds + static_hold_attempts) and 1MM
-- (one_min_max_logs, which already logs every attempt). That makes it
-- impossible to compute "how many power points were earned this week": the
-- single row can't distinguish "PBs set long ago, untouched since" from
-- "just improved this week," since both look identical (assessed_at doesn't
-- capture the *previous* score). This adds the missing log, mirroring
-- static_hold_attempts: one row per validated submission (not just PB
-- improvements), so a weekly delta can be computed later by replaying the
-- running max over time.
create table "public"."power_assessment_log" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid,
  "pullup_1rm" numeric not null,
  "dip_1rm" numeric not null,
  "squat_1rm" numeric not null,
  "muscleup_1rm" numeric not null,
  "created_at" timestamp with time zone not null default now()
);

alter table "public"."power_assessment_log" add constraint "power_assessment_log_pkey" primary key ("id");
alter table "public"."power_assessment_log" add constraint "power_assessment_log_user_id_fkey"
  foreign key (user_id) references auth.users(id) on delete cascade not valid;
alter table "public"."power_assessment_log" validate constraint "power_assessment_log_user_id_fkey";

create index "idx_power_assessment_log_user_created"
  on "public"."power_assessment_log" using btree (user_id, created_at desc);

alter table "public"."power_assessment_log" enable row level security;

-- Same shape as static_hold_attempts: users can read their own log; no
-- insert/update/delete policy, so direct client writes are denied by RLS
-- despite table grants — the only write path is submit_power_assessment, a
-- SECURITY DEFINER function that bypasses RLS as its owner.
create policy "Users read own power assessment log"
  on "public"."power_assessment_log" as permissive for select to public using (auth.uid() = user_id);

grant select, insert, update, delete on table "public"."power_assessment_log" to "anon";
grant select, insert, update, delete on table "public"."power_assessment_log" to "authenticated";
grant select, insert, update, delete on table "public"."power_assessment_log" to "service_role";

-- submit_power_assessment now also logs every validated submission (pass or
-- fail PB) to power_assessment_log, in addition to its existing upsert into
-- power_assessments. Everything else — cooldown, bounds validation, the
-- upsert/GREATEST merge, tier/points sync — is unchanged.
CREATE OR REPLACE FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric)
 RETURNS TABLE(is_new_pb boolean, is_promotion boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_current_pullup NUMERIC := 0.0;
    v_current_dip NUMERIC := 0.0;
    v_current_squat NUMERIC := 0.0;
    v_current_muscleup NUMERIC := 0.0;
    v_old_points NUMERIC := 0.0;
    v_new_points NUMERIC := 0.0;
    v_old_tier INT := 0;
    v_new_tier INT := 0;
    v_is_new_pb BOOLEAN := false;
    v_last_assessed_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Validate bounds (realistic constraints)
    IF p_pullup < 0 OR p_pullup > 150 OR
       p_dip < 0 OR p_dip > 200 OR
       p_squat < 0 OR p_squat > 300 OR
       p_muscleup < 0 OR p_muscleup > 100
    THEN
        RAISE EXCEPTION 'Assessment values exceed realistic physical limits.' USING ERRCODE = 'P1001';
    END IF;

    -- Per-user cooldown: check the last assessment timestamp directly from
    -- power_assessments (one row per user, assessed_at is updated on every
    -- upsert) — no separate attempts log needed.
    SELECT assessed_at INTO v_last_assessed_at
    FROM public.power_assessments
    WHERE user_id = v_user_id;

    IF v_last_assessed_at IS NOT NULL THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_assessed_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait % seconds before submitting again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1002';
        END IF;
    END IF;

    -- Get current assessment
    SELECT
        pullup_1rm,
        dip_1rm,
        squat_1rm,
        muscleup_1rm
    INTO
        v_current_pullup,
        v_current_dip,
        v_current_squat,
        v_current_muscleup
    FROM public.power_assessments
    WHERE user_id = v_user_id;

    v_current_pullup  := COALESCE(v_current_pullup, 0.0);
    v_current_dip     := COALESCE(v_current_dip, 0.0);
    v_current_squat   := COALESCE(v_current_squat, 0.0);
    v_current_muscleup := COALESCE(v_current_muscleup, 0.0);

    -- Check if any is a new PB
    IF p_pullup > v_current_pullup OR
       p_dip > v_current_dip OR
       p_squat > v_current_squat OR
       p_muscleup > v_current_muscleup
    THEN
        v_is_new_pb := true;
    END IF;

    -- Always keep the max
    v_current_pullup   := GREATEST(v_current_pullup, p_pullup);
    v_current_dip      := GREATEST(v_current_dip, p_dip);
    v_current_squat    := GREATEST(v_current_squat, p_squat);
    v_current_muscleup := GREATEST(v_current_muscleup, p_muscleup);

    -- Calculate points and tier
    v_old_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);
    v_new_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);

    IF v_old_points >= 250 THEN v_old_tier := 3;
    ELSIF v_old_points >= 100 THEN v_old_tier := 2;
    ELSE v_old_tier := 1;
    END IF;

    IF v_new_points >= 250 THEN v_new_tier := 3;
    ELSIF v_new_points >= 100 THEN v_new_tier := 2;
    ELSE v_new_tier := 1;
    END IF;

    -- Upsert power_assessments — assessed_at is always updated, which is
    -- what the cooldown check reads on the next submission.
    INSERT INTO public.power_assessments (
        user_id,
        pullup_1rm,
        dip_1rm,
        squat_1rm,
        muscleup_1rm,
        power_tier,
        assessed_at
    )
    VALUES (
        v_user_id,
        v_current_pullup,
        v_current_dip,
        v_current_squat,
        v_current_muscleup,
        v_new_tier,
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        pullup_1rm   = EXCLUDED.pullup_1rm,
        dip_1rm      = EXCLUDED.dip_1rm,
        squat_1rm    = EXCLUDED.squat_1rm,
        muscleup_1rm = EXCLUDED.muscleup_1rm,
        power_tier   = EXCLUDED.power_tier,
        assessed_at  = EXCLUDED.assessed_at;

    -- Logged as submitted (raw values, not the merged max) so a later
    -- replay of running-max-over-time reproduces the same PB progression
    -- sync_static_points-style logic already uses for Static.
    INSERT INTO public.power_assessment_log (user_id, pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm, created_at)
    VALUES (v_user_id, p_pullup, p_dip, p_squat, p_muscleup, NOW());

    -- Sync to profile
    UPDATE public.profiles
    SET power_points = v_new_points,
        power_tier   = v_new_tier,
        updated_at   = NOW()
    WHERE id = v_user_id;

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier);
END;
$function$
;
