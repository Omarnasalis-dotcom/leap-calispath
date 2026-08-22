-- Same admin-uploaded cover photo option as Workout Content
-- (20260822070000_add_standalone_workout_cover_image.sql), now for Program
-- library templates — replaces getCardImage's hardcoded tier-range-keyed
-- photo map (src/screens/WorkoutLibraryScreen.tsx) with a per-template
-- field an admin can set from the admin-web Library tab.
--
-- No new Storage bucket/RLS needed — reuses the existing 'workout-covers'
-- bucket as-is (its RLS is keyed only by bucket_id, not by which table
-- references it) and program_templates already has its own "Admin manages
-- all templates" FOR ALL RLS policy covering this direct-table write, same
-- as the existing matching_criteria/equipment_tags edit path
-- (saveLibraryCriteria in admin-web/src/api/coaching.ts).

alter table public.program_templates add column cover_image_url text;
