-- Separate light-mode cover photos for Workout Content (Quick Workout /
-- Customize) and Program library templates. NULL = light mode falls back
-- to cover_image_url, so nothing changes until an admin uploads one.
--
-- Deliberately NOT added to save_standalone_workout: a new trailing param
-- defaulting to NULL would wipe an admin-set light cover every time an
-- older app build saves through the mobile builder. Admin-web writes this
-- column with a direct table update instead, covered by the existing
-- admin RLS policies on both tables (same path as the list-view cover
-- upload and saveLibraryCoverImage). Reuses the 'workout-covers' bucket.
alter table public.standalone_workouts add column cover_image_url_light text;
alter table public.program_templates add column cover_image_url_light text;
