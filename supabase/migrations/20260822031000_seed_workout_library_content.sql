-- Seed content for Phase 4's Workout Library — real exercises pulled from
-- the live exercise_library (300 rows, confirmed), a free Workout, a
-- Pro-locked Workout, and a free Quick Workout, so the browse/filter/lock
-- flow has real content to test against end-to-end. No authoring UI exists
-- yet (browse-only scope) — this is the direct-SQL bootstrapping path,
-- same approach exercise_library's own original rows used.

INSERT INTO public.standalone_workouts (id, kind, title, description, category, difficulty, is_free, status)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'workout', 'Push Day Foundations',
   'A beginner-friendly push session to build the strict push-up before chasing harder variations.',
   'PUSH', 'beginner', true, 'published'),
  ('10000000-0000-0000-0000-000000000002', 'workout', 'Push Power Circuit',
   'Advanced single-arm and archer push-up work for athletes who''ve outgrown standard push-ups.',
   'PUSH', 'advanced', false, 'published');

INSERT INTO public.standalone_workouts (id, kind, title, description, category, difficulty, format, duration_minutes, is_free, status)
VALUES
  ('10000000-0000-0000-0000-000000000003', 'quick_workout', '20 Min Push AMRAP',
   'As many rounds as possible in 20 minutes — push-ups, dips, and knee push-ups for anyone still building up.',
   'PUSH', 'intermediate', 'amrap', 20, true, 'published');

INSERT INTO public.standalone_workout_exercises (workout_id, exercise_id, sets, reps, rest_seconds, order_index)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'a43ae91f-0448-4631-ac8d-c1f17ad52448', 3, 12, 60, 0), -- knee push ups
  ('10000000-0000-0000-0000-000000000001', '025f36bb-3fcd-48fa-8943-e0abbda74aa7', 3, 8, 60, 1),  -- Triceps box dips
  ('10000000-0000-0000-0000-000000000001', '4c278bfb-7ab7-41d3-9ff1-be801f0aa75a', 3, 8, 90, 2);   -- push ups

INSERT INTO public.standalone_workout_exercises (workout_id, exercise_id, sets, reps, rest_seconds, order_index)
VALUES
  ('10000000-0000-0000-0000-000000000002', '5d61df2a-3e19-4c0e-bcea-2659285c6a63', 4, 6, 90, 0),  -- Archer Push UPs
  ('10000000-0000-0000-0000-000000000002', '79911162-61dd-4d33-9b20-1629504794af', 4, 4, 120, 1), -- single arm push ups
  ('10000000-0000-0000-0000-000000000002', '1718b219-463b-47ff-a8cd-df5af0e126d3', 4, 10, 90, 2); -- Dips

INSERT INTO public.standalone_workout_exercises (workout_id, exercise_id, reps, order_index)
VALUES
  ('10000000-0000-0000-0000-000000000003', '4c278bfb-7ab7-41d3-9ff1-be801f0aa75a', 10, 0),  -- push ups
  ('10000000-0000-0000-0000-000000000003', '025f36bb-3fcd-48fa-8943-e0abbda74aa7', 10, 1),  -- Triceps box dips
  ('10000000-0000-0000-0000-000000000003', 'a43ae91f-0448-4631-ac8d-c1f17ad52448', 15, 2);  -- knee push ups
