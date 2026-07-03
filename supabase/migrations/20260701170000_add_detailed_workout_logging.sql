-- Phase 1 of the warrior workout logging overhaul: adds structured feel/RPE/
-- missed-reason/session-duration columns to workout_logs (kept additive so
-- toggle_block_status's delete-then-reinsert contract and any existing
-- `rating` reads keep working), plus two new tables:
--   - workout_set_logs: per-set/per-round breakdown (reps, weight, hold time)
--     needed for Phase 2 coach-side drill-down and export.
--   - bodyweight_logs: weekly bodyweight check-in, decoupled from any
--     specific block since it's a once-a-week warrior action.

-- 1. Extend workout_logs -----------------------------------------------

alter table "public"."workout_logs"
  add column "feel" text,
  add column "rpe" integer,
  add column "missed_reason" text,
  add column "missed_detail" text,
  add column "session_seconds" integer;

alter table "public"."workout_logs"
  add constraint "workout_logs_feel_check"
  check (feel is null or feel in ('hard', 'ok', 'good', 'strong', 'beast'));

alter table "public"."workout_logs"
  add constraint "workout_logs_rpe_check"
  check (rpe is null or (rpe between 1 and 10));

alter table "public"."workout_logs"
  add constraint "workout_logs_missed_reason_check"
  check (missed_reason is null or missed_reason in ('no_time', 'too_tired', 'injury', 'other'));

-- 2. workout_set_logs ----------------------------------------------------

create table "public"."workout_set_logs" (
  "id" uuid not null default gen_random_uuid(),
  "workout_log_id" uuid not null references public.workout_logs(id) on delete cascade,
  "block_exercise_id" uuid references public.block_exercises(id) on delete set null,
  "set_index" integer not null,
  "reps_completed" integer,
  "weight_used" numeric,
  "hold_seconds" numeric,
  "created_at" timestamp with time zone not null default now()
);

alter table "public"."workout_set_logs" enable row level security;

create index "workout_set_logs_workout_log_id_idx"
  on "public"."workout_set_logs" using btree (workout_log_id);

grant delete on table "public"."workout_set_logs" to "anon";
grant insert on table "public"."workout_set_logs" to "anon";
grant references on table "public"."workout_set_logs" to "anon";
grant select on table "public"."workout_set_logs" to "anon";
grant trigger on table "public"."workout_set_logs" to "anon";
grant truncate on table "public"."workout_set_logs" to "anon";
grant update on table "public"."workout_set_logs" to "anon";

grant delete on table "public"."workout_set_logs" to "authenticated";
grant insert on table "public"."workout_set_logs" to "authenticated";
grant references on table "public"."workout_set_logs" to "authenticated";
grant select on table "public"."workout_set_logs" to "authenticated";
grant trigger on table "public"."workout_set_logs" to "authenticated";
grant truncate on table "public"."workout_set_logs" to "authenticated";
grant update on table "public"."workout_set_logs" to "authenticated";

grant delete on table "public"."workout_set_logs" to "service_role";
grant insert on table "public"."workout_set_logs" to "service_role";
grant references on table "public"."workout_set_logs" to "service_role";
grant select on table "public"."workout_set_logs" to "service_role";
grant trigger on table "public"."workout_set_logs" to "service_role";
grant truncate on table "public"."workout_set_logs" to "service_role";
grant update on table "public"."workout_set_logs" to "service_role";

create policy "Warriors manage own set logs"
  on "public"."workout_set_logs"
  as permissive
  for all
  to authenticated
  using ((EXISTS ( SELECT 1 FROM public.workout_logs wl
    WHERE (wl.id = workout_set_logs.workout_log_id) AND (wl.warrior_id = auth.uid()))))
  with check ((EXISTS ( SELECT 1 FROM public.workout_logs wl
    WHERE (wl.id = workout_set_logs.workout_log_id) AND (wl.warrior_id = auth.uid()))));

-- Present now (unused until Phase 2) so coach-side reads aren't blocked later.
create policy "Coaches view warrior set logs"
  on "public"."workout_set_logs"
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1 FROM public.workout_logs wl
    JOIN public.warrior_programs wp ON wp.id = wl.warrior_program_id
    WHERE (wl.id = workout_set_logs.workout_log_id) AND (wp.coach_id = auth.uid()))));

-- 3. bodyweight_logs ------------------------------------------------------

create table "public"."bodyweight_logs" (
  "id" uuid not null default gen_random_uuid(),
  "warrior_id" uuid not null references public.profiles(id) on delete cascade,
  "warrior_program_id" uuid references public.warrior_programs(id) on delete set null,
  "weight_kg" numeric not null,
  "logged_at" timestamp with time zone not null default now()
);

alter table "public"."bodyweight_logs" enable row level security;

create index "bodyweight_logs_warrior_id_logged_at_idx"
  on "public"."bodyweight_logs" using btree (warrior_id, logged_at desc);

grant delete on table "public"."bodyweight_logs" to "anon";
grant insert on table "public"."bodyweight_logs" to "anon";
grant references on table "public"."bodyweight_logs" to "anon";
grant select on table "public"."bodyweight_logs" to "anon";
grant trigger on table "public"."bodyweight_logs" to "anon";
grant truncate on table "public"."bodyweight_logs" to "anon";
grant update on table "public"."bodyweight_logs" to "anon";

grant delete on table "public"."bodyweight_logs" to "authenticated";
grant insert on table "public"."bodyweight_logs" to "authenticated";
grant references on table "public"."bodyweight_logs" to "authenticated";
grant select on table "public"."bodyweight_logs" to "authenticated";
grant trigger on table "public"."bodyweight_logs" to "authenticated";
grant truncate on table "public"."bodyweight_logs" to "authenticated";
grant update on table "public"."bodyweight_logs" to "authenticated";

grant delete on table "public"."bodyweight_logs" to "service_role";
grant insert on table "public"."bodyweight_logs" to "service_role";
grant references on table "public"."bodyweight_logs" to "service_role";
grant select on table "public"."bodyweight_logs" to "service_role";
grant trigger on table "public"."bodyweight_logs" to "service_role";
grant truncate on table "public"."bodyweight_logs" to "service_role";
grant update on table "public"."bodyweight_logs" to "service_role";

create policy "Warriors manage own bodyweight logs"
  on "public"."bodyweight_logs"
  as permissive
  for all
  to authenticated
  using (warrior_id = auth.uid())
  with check (warrior_id = auth.uid());

create policy "Coaches view warrior bodyweight logs"
  on "public"."bodyweight_logs"
  as permissive
  for select
  to authenticated
  using ((EXISTS ( SELECT 1 FROM public.warrior_programs wp
    WHERE (wp.warrior_id = bodyweight_logs.warrior_id) AND (wp.coach_id = auth.uid()))));
