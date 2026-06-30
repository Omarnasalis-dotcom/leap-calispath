-- Reference table consolidating the 16-movement metadata (id, category_id,
-- pattern_id, multiplier, max_reps) previously duplicated across three CASE
-- statements (submit_onemm_log / sync_onemm_points /
-- get_onemm_well_rounded_leaderboard) plus the client-side ONEMM_MOVEMENTS
-- array in src/lib/oneMMLogic.ts. This becomes the single SQL-side source
-- of truth; the client array is intentionally left as a parallel copy
-- (same client/server split accepted for Static World).
create table "public"."onemm_movements" (
  "id" text not null,
  "category_id" text not null,
  "pattern_id" text not null,
  "multiplier" numeric not null,
  "max_reps" integer not null,
  "created_at" timestamp with time zone default now()
);

alter table "public"."onemm_movements" add constraint "onemm_movements_pkey" primary key ("id");
alter table "public"."onemm_movements" add constraint "onemm_movements_category_check"
  check (category_id in ('entry', 'main', 'advanced'));
alter table "public"."onemm_movements" add constraint "onemm_movements_multiplier_check" check (multiplier > 0);
alter table "public"."onemm_movements" add constraint "onemm_movements_max_reps_check" check (max_reps > 0);

alter table "public"."onemm_movements" enable row level security;

create policy "Anyone can read onemm movements"
  on "public"."onemm_movements" as permissive for select to public using (true);

grant select on table "public"."onemm_movements" to "anon";
grant select on table "public"."onemm_movements" to "authenticated";
grant select, insert, update, delete on table "public"."onemm_movements" to "service_role";

-- max_reps values are domain-expert-reviewed ceilings provided directly
-- by the product owner per movement.
insert into "public"."onemm_movements" (id, category_id, pattern_id, multiplier, max_reps) values
  ('knee_push_ups',    'entry',    'push',       0.25, 100),
  ('incline_push_ups', 'entry',    'push',       0.25, 100),
  ('inverted_row',     'entry',    'pull',       0.25,  90),
  ('bench_dips',       'entry',    'dip',        0.25,  90),
  ('air_squats',       'entry',    'squat',      0.25, 100),
  ('assisted_pull_ups','entry',    'pull',       0.25,  90),
  ('push_ups',         'main',     'push',       0.5,  105),
  ('pull_ups',         'main',     'pull',       0.5,   75),
  ('dips',             'main',     'dip',        0.5,  100),
  ('goblet_squats',    'main',     'squat',      0.5,   90),
  ('deadlift',         'main',     'deadlift',   0.5,   90),
  ('muscle_ups',       'advanced', 'muscle_up',  5.0,   40),
  ('hspu',             'advanced', 'hspu',       5.0,   60),
  ('fl_press',         'advanced', 'fl_press',   5.0,   40),
  ('fl_pull_ups',      'advanced', 'fl_pull',    5.0,   30),
  ('planche_push_ups', 'advanced', 'planche',    5.0,   60);

-- Unlike static_holds (which only stores the current PB), one_min_max_logs
-- already records EVERY validated submission regardless of PB outcome — so
-- there is no need for a separate onemm_attempts log table (as exists for
-- static_hold_attempts). The cooldown check in the next migration reads
-- directly from one_min_max_logs instead.
-- The existing indexes on one_min_max_logs cover user_id alone and
-- (movement_id, reps DESC) — neither supports the per-(user, movement)
-- "most recent attempt" lookup needed by the cooldown efficiently. Adding
-- a composite index to fill that gap.
create index "idx_onemm_logs_user_movement_created"
  on "public"."one_min_max_logs" using btree (user_id, movement_id, created_at desc);
