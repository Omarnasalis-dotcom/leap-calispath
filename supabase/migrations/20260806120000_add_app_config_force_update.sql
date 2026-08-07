-- Force-update mechanism. One row per platform holding the minimum app
-- version still allowed to run — the client checks this on launch and
-- blocks with no bypass if the installed version is below it. Publicly
-- readable (anon included) since this must be checkable before any auth
-- state resolves, mirroring the existing public-config pattern used for
-- arena_phase_hard_floors.
--
-- Seeded at the CURRENT production version (1.1.7) — this blocks nobody
-- today. It only ever fires once you raise this value in the future. It's
-- also not retroactive: only installs already running a build that
-- contains this check can be blocked at all; older installs have no such
-- code and are unaffected either way. See project notes for the full
-- rollout reasoning.
create table "public"."app_config" (
  "platform" text not null,
  "minimum_version" text not null,
  "message" text,
  "updated_at" timestamptz not null default now(),
  constraint "app_config_pkey" primary key ("platform"),
  constraint "app_config_platform_check" check (platform in ('ios', 'android'))
);

alter table "public"."app_config" enable row level security;

create policy "Anyone can read app config"
  on "public"."app_config" as permissive for select to public using (true);

grant select on table "public"."app_config" to "anon";
grant select on table "public"."app_config" to "authenticated";
grant select, insert, update, delete on table "public"."app_config" to "service_role";

insert into "public"."app_config" (platform, minimum_version, message) values
  ('ios', '1.1.7', 'A new version of Leap Arena is required to continue. Please update from the App Store.'),
  ('android', '1.1.7', 'A new version of Leap Arena is required to continue. Please update from the Play Store.');
