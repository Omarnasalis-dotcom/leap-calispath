-- Remote kill switch for the entitlement paywall gate — same app_config
-- table/pattern as the force-update check (20260806120000), same public
-- read grants (must be checkable before auth state resolves). Defaults to
-- false so the gate stays off in production until explicitly flipped on
-- once App Review clears and TestFlight sandbox verification is confident.
-- No resubmission needed to toggle this — that's the whole point.
alter table "public"."app_config" add column "paywall_enabled" boolean not null default false;
