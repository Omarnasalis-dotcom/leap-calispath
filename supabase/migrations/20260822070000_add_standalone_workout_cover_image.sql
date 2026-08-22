-- Admin-uploaded cover photos for Workout Content — replaces the
-- developer-only hardcoded STANDALONE_WORKOUT_IMAGES map
-- (src/screens/WorkoutLibraryScreen.tsx) with a real Storage-backed field
-- an admin can set from the admin-web editor. First Supabase Storage
-- usage in this app (confirmed via repo-wide grep — everything else is a
-- bundled local asset), so this follows Supabase's own documented Storage
-- RLS conventions rather than an in-repo precedent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workout-covers', 'workout-covers', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "Public read access to workout covers"
  on storage.objects for select
  using (bucket_id = 'workout-covers');

create policy "Admin can upload workout covers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'workout-covers' and public.is_admin());

create policy "Admin can update workout covers"
  on storage.objects for update to authenticated
  using (bucket_id = 'workout-covers' and public.is_admin())
  with check (bucket_id = 'workout-covers' and public.is_admin());

create policy "Admin can delete workout covers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'workout-covers' and public.is_admin());

alter table public.standalone_workouts add column cover_image_url text;

-- p_cover_image_url appended as a new last param with a DEFAULT. This is
-- NOT the additive/no-drop-needed case it might look like: Postgres
-- resolves overloaded functions purely by argument *types*, not defaults —
-- CREATE OR REPLACE on a longer parameter list creates a SECOND overload
-- alongside the existing 11-arg one rather than replacing it, and any call
-- with exactly 11 positional args then becomes ambiguous between the two
-- ("is not unique" error, confirmed locally). The old signature must be
-- dropped explicitly, same as the earlier p_exercises -> p_blocks rename.
DROP FUNCTION IF EXISTS public.save_standalone_workout(uuid, text, text, text, text, text, text, integer, boolean, text, jsonb);

CREATE OR REPLACE FUNCTION public.save_standalone_workout(
  p_workout_id uuid,
  p_kind text,
  p_title text,
  p_description text,
  p_category text,
  p_difficulty text,
  p_format text,
  p_duration_minutes integer,
  p_is_free boolean,
  p_status text,
  p_blocks jsonb,
  p_cover_image_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workout_id uuid;
  v_block jsonb;
  v_ex jsonb;
  v_new_block_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_workout_id IS NULL THEN
    INSERT INTO standalone_workouts (kind, title, description, category, difficulty, format, duration_minutes, is_free, status, created_by, cover_image_url)
    VALUES (p_kind, p_title, p_description, p_category, p_difficulty, p_format, p_duration_minutes, p_is_free, p_status, auth.uid(), p_cover_image_url)
    RETURNING id INTO v_workout_id;
  ELSE
    UPDATE standalone_workouts
    SET kind = p_kind, title = p_title, description = p_description, category = p_category,
        difficulty = p_difficulty, format = p_format, duration_minutes = p_duration_minutes,
        is_free = p_is_free, status = p_status, cover_image_url = p_cover_image_url
    WHERE id = p_workout_id
    RETURNING id INTO v_workout_id;
    IF v_workout_id IS NULL THEN
      RAISE EXCEPTION 'Workout not found: %', p_workout_id;
    END IF;
    DELETE FROM standalone_workout_blocks WHERE workout_id = v_workout_id;
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb))
  LOOP
    INSERT INTO standalone_workout_blocks (workout_id, name, notes, order_index)
    VALUES (
      v_workout_id,
      v_block->>'name',
      v_block->>'notes',
      COALESCE((v_block->>'order_index')::int, 0)
    )
    RETURNING id INTO v_new_block_id;

    FOR v_ex IN SELECT * FROM jsonb_array_elements(COALESCE(v_block->'exercises', '[]'::jsonb))
    LOOP
      INSERT INTO standalone_workout_exercises
        (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index)
      VALUES (
        v_new_block_id,
        (v_ex->>'exercise_id')::uuid,
        (v_ex->>'sets')::int, (v_ex->>'reps')::int, (v_ex->>'rest_seconds')::int,
        (v_ex->>'hold_seconds')::int, (v_ex->>'work_seconds')::int,
        COALESCE((v_ex->>'is_weighted')::boolean, false),
        v_ex->>'notes',
        COALESCE((v_ex->>'order_index')::int, 0)
      );
    END LOOP;
  END LOOP;

  RETURN v_workout_id;
END;
$function$;
