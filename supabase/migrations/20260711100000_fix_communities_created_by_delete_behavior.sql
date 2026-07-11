-- communities.created_by referenced profiles(id) with no ON DELETE clause,
-- which defaults to NO ACTION — meaning any user who has ever created a
-- community can never delete their account: auth.users -> profiles cascades
-- via delete-user-account's auth.admin.deleteUser() call, but that cascade
-- then hits this FK and the whole delete transaction fails. Every other
-- "who did this" attribution column in this schema (program_templates.coach_id,
-- exercise_library.created_by, invite_codes.used_by, warrior_programs.coach_id)
-- already uses ON DELETE SET NULL for exactly this reason — bringing this one
-- in line. created_by has no functional use after creation (only the INSERT
-- policy checks it), so NULLing it out on account deletion is safe.
ALTER TABLE public.communities
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.communities
  DROP CONSTRAINT communities_created_by_fkey;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
