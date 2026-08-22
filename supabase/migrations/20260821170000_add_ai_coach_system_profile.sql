-- Creates the "AI Coach" house account: a real profiles row that owns
-- program_templates/warrior_programs rows created by the AI Coach on a
-- user's behalf. Kept distinct from LEAP_SYSTEM_PROFILE_ID (the Workout
-- Templates Library's system owner, see 20260709130000) so AI-authored
-- programs are cleanly identifiable via coach_id, separate from both real
-- coaches and the template library.
--
-- Same rationale as the Leap system profile: program_templates.coach_id and
-- warrior_programs.coach_id are NOT NULL FKs to profiles(id) — there is no
-- null-owner option, so self-service AI-authored programs need a real
-- owning row to satisfy the constraint.
--
-- is_coach = true (ownership-style checks that assume a "coach" behave
-- consistently), is_admin = false (must never carry staff privileges).
-- encrypted_password is an unusable placeholder; this account cannot and
-- should never be used to sign in.
--
-- Fixed id 00000000-0000-0000-0000-000000000002, exported as
-- AI_COACH_SYSTEM_PROFILE_ID in src/constants/system.ts. Any query that
-- lists profiles broadly (warrior pickers, leaderboards, user search) must
-- exclude this id explicitly — it is not filtered by any RLS policy.

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, aud, role
)
values (
  '00000000-0000-0000-0000-000000000002',
  'system+ai-coach@internal.leapcalispath.invalid',
  '!disabled!not-a-real-hash!',
  now(), now(), now(), 'authenticated', 'authenticated'
)
on conflict (id) do nothing;

update public.profiles
set display_name = 'AI Coach',
    is_coach = true,
    is_admin = false,
    is_public = false
where id = '00000000-0000-0000-0000-000000000002';
