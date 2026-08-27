-- Workout Library content pass, closing the two content gaps found in the
-- 2026-08-27 audit:
--
-- 1. All 40 published rows had goal_tags='{}' and tier_min/tier_max=NULL —
--    the 2026-08-25 backfill (20260825010000) targeted the original 3
--    seed rows by literal id; that content was since replaced with fresh
--    admin-authored rows under new ids, so the backfill silently became a
--    no-op and nothing was ever re-tagged. Tagged here from each row's own
--    title (explicit skill names) and difficulty (tier band matches the
--    existing convention: beginner 0-2, intermediate 3-5, advanced 6-9,
--    same as templateLibrary.ts's tierRangeToDifficultyBand). Non-skill
--    rows get general_strength (a real day) or conditioning (a timed
--    AMRAP/EMOM/tabata/for-time quick_workout) as the closest real tag —
--    no "none of the above" option exists in the enum, and an untagged
--    row ranks no better than a wrong one under search_workouts' scoring.
--
-- 2. 5 blocks had zero exercises (the exact defect the previous migration
--    now rejects at the clone RPCs) — filled with real library exercises
--    matching each block's role and the workout's own difficulty, inferred
--    from the sibling blocks already in each of these 5 workouts (all 4
--    Legs "Skills" blocks sit right after Warm-Up, before a Strength block
--    built around squat/lunge patterns — pistol work is the only real
--    Legs-category skill line, scaled to the workout's own tier via the
--    same assisted-pistol progression get_workout_detail already exposes
--    elsewhere; the Push quick_workout's empty Cool-Down gets real
--    stretches matching the Cool-Down convention already used by every
--    other workout in this table).

-- ---- Part 1: goal_tags + tier band per workout ----

UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 6, tier_max = 9 WHERE id = '03d2dbe2-170c-4c3d-be3c-a46f4cfc6ac9'; -- Core Power — Advanced
UPDATE public.standalone_workouts SET goal_tags = ARRAY['front_lever'],      tier_min = 6, tier_max = 9 WHERE id = '4f3cc7c5-5f4a-499c-8ab0-39761055c3fa'; -- Front Lever Mastery — Core
UPDATE public.standalone_workouts SET goal_tags = ARRAY['back_lever'],       tier_min = 6, tier_max = 9 WHERE id = '8143d1bc-5fcf-4aa5-93dd-df723871365a'; -- Back Lever Progression — Core
UPDATE public.standalone_workouts SET goal_tags = ARRAY['front_lever'],      tier_min = 6, tier_max = 9 WHERE id = 'ede4b5bf-e1bf-4f24-9d08-2f415f048464'; -- Front Lever Progression — Core
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2 WHERE id = 'eb3b6a12-ef35-47bd-ac1a-768102b83061'; -- Core Foundations
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = 'defcc9b1-72cd-49aa-a4fd-a06561e65493'; -- 16 Min Core Tabata
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = 'cfa0909c-eaa3-46f2-8c2f-1d6e341ca3d8'; -- 10 Min Core AMRAP
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 3, tier_max = 5 WHERE id = 'd84e1430-b70e-442c-9fe6-5c7b31dbb597'; -- Core Day — Intermediate

UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 6, tier_max = 9 WHERE id = '7d76ca8b-7b39-4644-8496-90f6f6cee50c'; -- Full Body Power — Advanced
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 6, tier_max = 9 WHERE id = '3d25403f-e83c-4b87-b2b4-ef055caa2714'; -- 5 Rounds Full Body For Time — Advanced
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2 WHERE id = 'fbff97cd-3eaf-4890-a223-c1177a6f022c'; -- No-Equipment Full Body
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2 WHERE id = '039989e7-35fd-4e1d-afd5-46c5fe3bb45e'; -- Active Recovery — Mobility Reset
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2 WHERE id = '46181915-fd2c-458c-ae34-f4a923b20f37'; -- Full Body Foundations
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 0, tier_max = 2 WHERE id = '48b77d74-8bea-438d-b4c5-90128948c958'; -- 10 Min Full Body Beginner AMRAP
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = '37046e07-dba5-4fd9-9ae4-190d40682eae'; -- 15 Min Full Body AMRAP
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = '58fece78-c3b0-4946-8902-cf38528eb190'; -- Full Body Endurance Circuit
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 3, tier_max = 5 WHERE id = 'ddc0316d-0555-48ed-bfd6-eb1e8d347af2'; -- Full Body Day — Intermediate
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = 'f5f7841a-eefa-4723-bcc1-65806cc2a6b2'; -- 15 Min Full Body EMOM

UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 6, tier_max = 9 WHERE id = '5b6ce77e-fb6b-41cd-8d59-3abbbf6bfd76'; -- Legs Power — Advanced
UPDATE public.standalone_workouts SET goal_tags = ARRAY['pistol'],           tier_min = 6, tier_max = 9 WHERE id = '05349b4e-6680-402d-bc45-4af9f28beda8'; -- Pistol Mastery — Legs
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2 WHERE id = '168619ee-8404-40d2-9c51-5669f9aa1a2e'; -- Legs Day Foundations
UPDATE public.standalone_workouts SET goal_tags = ARRAY['pistol'],           tier_min = 0, tier_max = 2 WHERE id = '656daa31-af2e-476c-9216-c987470218e0'; -- Pistol Entry — Legs
UPDATE public.standalone_workouts SET goal_tags = ARRAY['pistol'],           tier_min = 3, tier_max = 5 WHERE id = '221b4c4f-6fab-480d-85dc-8e391a698115'; -- Pistol Squat Progression — Legs
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = 'aa165026-1b63-4d3b-9939-b2619b3f18ea'; -- 15 Min Legs EMOM
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 3, tier_max = 5 WHERE id = 'cb75dc3d-1d1c-4080-a57a-1b17fdb3f0e3'; -- Legs Day — Intermediate

UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 6, tier_max = 9 WHERE id = '6f5b6259-31b1-4cc2-ab37-565a05bd4d24'; -- Pull Power — Advanced
UPDATE public.standalone_workouts SET goal_tags = ARRAY['muscle_up'],        tier_min = 6, tier_max = 9 WHERE id = 'bc5ed050-d995-49f3-9bd2-40800285bb12'; -- Muscle-Up Mastery — Pull
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2 WHERE id = '5e4c60a0-61e3-4797-bcc0-5c7cfc0d84c5'; -- Pull Day Foundations
UPDATE public.standalone_workouts SET goal_tags = ARRAY['muscle_up'],        tier_min = 3, tier_max = 5 WHERE id = '39dd5664-435c-4d8a-8f99-e6e5c8abbf19'; -- Muscle-Up Prep — Pull
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = '80ed4ae3-3232-4a5b-a7ff-4af2cec16160'; -- 5 Rounds Pull For Time
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 3, tier_max = 5 WHERE id = '4ec9ed5c-2d39-4900-a553-ca48e5f0e830'; -- Pull Day — Intermediate
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = '8e366287-b326-49f4-ada9-021a27911a0e'; -- 15 Min Pull EMOM

UPDATE public.standalone_workouts SET goal_tags = ARRAY['handstand'],        tier_min = 6, tier_max = 9 WHERE id = 'd46e5e70-f2ce-4167-9060-9949f8e7d78d'; -- Handstand Push-Up Progression — Push
UPDATE public.standalone_workouts SET goal_tags = ARRAY['handstand'],        tier_min = 0, tier_max = 2 WHERE id = '1de34e07-98a6-47f2-8742-19f08480908d'; -- Handstand Entry — Push
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 0, tier_max = 2 WHERE id = 'fe28674d-9b79-44e1-820e-a957a1689990'; -- Push Day Foundations — Beginner
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = 'd706d138-f23c-414b-abc0-ec2b2746ee5a'; -- 12 Min Push Tabata
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 3, tier_max = 5 WHERE id = '6f8c95d2-b08f-4fc8-a597-0958280c03f7'; -- Push Power Foundations
UPDATE public.standalone_workouts SET goal_tags = ARRAY['conditioning'],     tier_min = 3, tier_max = 5 WHERE id = 'e2e439c6-e3b6-4add-8420-8656557a9bd7'; -- 20 MIN PUSH
UPDATE public.standalone_workouts SET goal_tags = ARRAY['handstand'],        tier_min = 3, tier_max = 5 WHERE id = 'eb4feed7-c775-4ade-86ef-149c07344f6e'; -- Handstand Progression — Push
UPDATE public.standalone_workouts SET goal_tags = ARRAY['general_strength'], tier_min = 3, tier_max = 5 WHERE id = 'fcd07b3e-c1cf-4f5f-ae17-b68c9c465c1d'; -- Push Day — Intermediate

-- ---- Part 2: fill the 5 empty blocks ----

-- Pistol Entry — Legs (beginner) — Skills block
INSERT INTO public.standalone_workout_exercises (block_id, exercise_id, sets, reps, rest_seconds, order_index) VALUES
  ('21ebbc62-a698-4586-bba2-8d5a06334433', '5c7bf08e-fde8-46a4-8525-353087536066', 2, 10, 45, 0), -- Asisted Squat
  ('21ebbc62-a698-4586-bba2-8d5a06334433', '249db91f-4cf0-4c47-96e8-43295315c6ab', 2, 6, 45, 1);  -- Asisted Pistol Negatives

-- Legs Day Foundations (beginner) — Skills block, same beginner pairing
INSERT INTO public.standalone_workout_exercises (block_id, exercise_id, sets, reps, rest_seconds, order_index) VALUES
  ('77ebb2aa-cef1-4aa9-9061-d5ba9a5e8283', '5c7bf08e-fde8-46a4-8525-353087536066', 2, 10, 45, 0), -- Asisted Squat
  ('77ebb2aa-cef1-4aa9-9061-d5ba9a5e8283', '249db91f-4cf0-4c47-96e8-43295315c6ab', 2, 6, 45, 1);  -- Asisted Pistol Negatives

-- Pistol Squat Progression — Legs (intermediate) — Skills block
INSERT INTO public.standalone_workout_exercises (block_id, exercise_id, sets, reps, rest_seconds, order_index) VALUES
  ('87386aca-1331-4de5-921d-de372ebcaa10', '249db91f-4cf0-4c47-96e8-43295315c6ab', 2, 6, 45, 0), -- Asisted Pistol Negatives
  ('87386aca-1331-4de5-921d-de372ebcaa10', '0ac90751-f46b-4249-ad38-10248bd5742c', 2, 8, 45, 1), -- Asisted Pistols Kicks
  ('87386aca-1331-4de5-921d-de372ebcaa10', '6b69cff8-c977-4e55-a6e1-285215a26134', 2, 8, 45, 2); -- Asisted Pistol Squat

-- Legs Day — Intermediate — Skills block, same intermediate pistol set
INSERT INTO public.standalone_workout_exercises (block_id, exercise_id, sets, reps, rest_seconds, order_index) VALUES
  ('59e0330b-f5ec-4611-b7a1-ca1c036cec85', '249db91f-4cf0-4c47-96e8-43295315c6ab', 2, 6, 45, 0), -- Asisted Pistol Negatives
  ('59e0330b-f5ec-4611-b7a1-ca1c036cec85', '0ac90751-f46b-4249-ad38-10248bd5742c', 2, 8, 45, 1), -- Asisted Pistols Kicks
  ('59e0330b-f5ec-4611-b7a1-ca1c036cec85', '6b69cff8-c977-4e55-a6e1-285215a26134', 2, 8, 45, 2); -- Asisted Pistol Squat

-- 20 MIN PUSH (quick_workout) — Cool-Down block, matching the stretch
-- pairing every other Cool-Down in this table already uses
INSERT INTO public.standalone_workout_exercises (block_id, exercise_id, sets, reps, hold_seconds, order_index) VALUES
  ('80bc4a1b-6ecb-456a-b474-56831ba5cf5a', '0bd55139-8cbe-4c13-889b-5b90b21b7060', 1, 1, 30, 0), -- Lat Stretch SH Opener
  ('80bc4a1b-6ecb-456a-b474-56831ba5cf5a', '8aea2887-da11-44db-aed2-25d442fadaf2', 1, 1, 30, 1); -- Childe Pose
