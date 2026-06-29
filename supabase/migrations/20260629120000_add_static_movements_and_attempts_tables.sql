-- Reference table consolidating the 12-movement metadata (id, category,
-- multiplier, ceiling) previously duplicated across three CASE statements
-- (submit_static_hold / sync_static_points / get_static_well_rounded_leaderboard)
-- plus the client-side STATIC_MOVEMENTS array in src/lib/staticLogic.ts.
-- This table becomes the single SQL-side source of truth; the client array
-- is intentionally left as a parallel copy (client/server split is fine,
-- the goal was eliminating the 3x SQL-side duplication).
create table "public"."static_movements" (
  "id" text not null,
  "category" text not null,
  "multiplier" numeric not null,
  "max_hold_seconds" numeric not null,
  "created_at" timestamp with time zone default now()
);

alter table "public"."static_movements" add constraint "static_movements_pkey" primary key ("id");
alter table "public"."static_movements" add constraint "static_movements_category_check"
  check (category in ('handstand', 'front_lever', 'back_lever', 'planche'));
alter table "public"."static_movements" add constraint "static_movements_multiplier_check" check (multiplier > 0);
alter table "public"."static_movements" add constraint "static_movements_max_hold_seconds_check" check (max_hold_seconds > 0);

-- Reference data: non-sensitive, world-readable, server-maintained only.
-- Read-only-for-everyone pattern (no insert/update/delete policy at all,
-- so those are denied by RLS regardless of table grants) — same shape as
-- the existing "Anyone can read holds" policy on static_holds.
alter table "public"."static_movements" enable row level security;

create policy "Anyone can read static movements"
  on "public"."static_movements" as permissive for select to public using (true);

grant select on table "public"."static_movements" to "anon";
grant select on table "public"."static_movements" to "authenticated";
grant select, insert, update, delete on table "public"."static_movements" to "service_role";

-- max_hold_seconds values below are domain-expert-reviewed ceilings
-- provided directly by the product owner per movement (not the inverse-
-- multiplier-scaled placeholders used during design).
insert into "public"."static_movements" (id, category, multiplier, max_hold_seconds) values
  ('wall_handstand',          'handstand',   0.5,  300),
  ('freestanding_handstand',  'handstand',   2.0,  240),
  ('one_arm_handstand',       'handstand',   8.0,  120),
  ('tuck_front_lever',        'front_lever', 0.25, 300),
  ('straddle_front_lever',    'front_lever', 1.0,  280),
  ('full_front_lever',        'front_lever', 6.0,  240),
  ('tuck_planche',            'planche',     1.0,  300),
  ('straddle_planche',        'planche',     2.0,  240),
  ('full_planche',            'planche',     8.0,  120),
  ('tuck_back_lever',         'back_lever',  0.25, 300),
  ('straddle_back_lever',     'back_lever',  1.0,  280),
  ('full_back_lever',         'back_lever',  3.0,  240);

-- Per-attempt audit log, written on every validated submit_static_hold
-- call regardless of PB outcome — mirrors trial_history's "log every
-- attempt" role. This is what the cooldown check reads from, since
-- static_holds only ever holds the current PB row (upserted on improvement
-- only), so a string of non-improving attempts leaves no trace there.
create table "public"."static_hold_attempts" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid,
  "movement_id" text not null,
  "hold_seconds" numeric not null,
  "accepted" boolean not null,
  "created_at" timestamp with time zone not null default now()
);

alter table "public"."static_hold_attempts" add constraint "static_hold_attempts_pkey" primary key ("id");
alter table "public"."static_hold_attempts" add constraint "static_hold_attempts_user_id_fkey"
  foreign key (user_id) references auth.users(id) on delete cascade not valid;
alter table "public"."static_hold_attempts" validate constraint "static_hold_attempts_user_id_fkey";

-- Drives the per-(user, movement) "most recent attempt" cooldown lookup.
create index "idx_static_hold_attempts_user_movement_created"
  on "public"."static_hold_attempts" using btree (user_id, movement_id, created_at desc);

alter table "public"."static_hold_attempts" enable row level security;

-- Same shape as static_holds: users can read their own attempt log (useful
-- for a future "why am I on cooldown" UI); no insert/update/delete policy,
-- so direct client writes are denied by RLS despite table grants — the
-- only write path is submit_static_hold, a SECURITY DEFINER function that
-- bypasses RLS as its owner (the same pattern already relied on for
-- static_holds today).
create policy "Users read own static hold attempts"
  on "public"."static_hold_attempts" as permissive for select to public using (auth.uid() = user_id);

grant select, insert, update, delete on table "public"."static_hold_attempts" to "anon";
grant select, insert, update, delete on table "public"."static_hold_attempts" to "authenticated";
grant select, insert, update, delete on table "public"."static_hold_attempts" to "service_role";
