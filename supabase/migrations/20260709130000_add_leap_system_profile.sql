-- Creates the "Leap" house account: a real profiles row that owns
-- program_templates/warrior_programs rows created by self-service Workout
-- Templates Library clones, where there is no real human coach involved.
-- Needed because program_templates.coach_id and warrior_programs.coach_id
-- are NOT NULL FKs to profiles(id) — there is no null-owner option.
--
-- is_coach = true (so ownership-style checks that assume a "coach" behave
-- consistently), is_admin = false (must never carry staff privileges).
-- encrypted_password is an unusable placeholder; this account cannot and
-- should never be used to sign in.
--
-- Fixed id 00000000-0000-0000-0000-000000000001, exported as
-- LEAP_SYSTEM_PROFILE_ID in src/constants/system.ts. Any query that lists
-- profiles broadly (warrior pickers, leaderboards, user search) must
-- exclude this id explicitly — it is not filtered by any RLS policy.

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, aud, role
)
values (
  '00000000-0000-0000-0000-000000000001',
  'system+leap-templates@internal.leapcalispath.invalid',
  '!disabled!not-a-real-hash!',
  now(), now(), now(), 'authenticated', 'authenticated'
)
on conflict (id) do nothing;

update public.profiles
set display_name = 'Leap',
    is_coach = true,
    is_admin = false,
    is_public = false
where id = '00000000-0000-0000-0000-000000000001';
