-- Journey tab: two pieces of lane state that used to live only in the
-- phone's AsyncStorage (or not at all) move to the server, per program.
--
-- 1. journey_quest_slots — which side-quest / Strength Trial slots
--    ("w{week}_s{n}" / "w{week}_trial") the user finished or skipped.
--    Was device-only, so a reinstall or a second phone reopened old quests.
--    Insert-only: a slot, once resolved, stays resolved.
--
-- 2. journey_day_choices — the program day the user picked to train next
--    ("Switch day"), one row per program. The program itself is never
--    reordered, so coach-assigned programs stay exactly as built.
--
-- Both are scoped to the caller's own rows and to a program the caller
-- is the warrior on.

CREATE TABLE IF NOT EXISTS public.journey_quest_slots (
  user_id            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  warrior_program_id uuid NOT NULL REFERENCES public.warrior_programs(id) ON DELETE CASCADE,
  slot_key           text NOT NULL CHECK (slot_key ~ '^w[0-9]+_(s[0-9]+|trial)$'),
  status             text NOT NULL CHECK (status IN ('done', 'skipped')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, warrior_program_id, slot_key, status)
);

ALTER TABLE public.journey_quest_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_quest_slots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.journey_quest_slots TO authenticated;

CREATE POLICY "Users read own journey quest slots"
  ON public.journey_quest_slots FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users record own journey quest slots"
  ON public.journey_quest_slots FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.warrior_programs wp
      WHERE wp.id = warrior_program_id AND wp.warrior_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.journey_day_choices (
  user_id            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  warrior_program_id uuid NOT NULL REFERENCES public.warrior_programs(id) ON DELETE CASCADE,
  week_number        integer NOT NULL CHECK (week_number >= 1),
  day_index          integer NOT NULL CHECK (day_index >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, warrior_program_id)
);

ALTER TABLE public.journey_day_choices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_day_choices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.journey_day_choices TO authenticated;

CREATE POLICY "Users read own journey day choice"
  ON public.journey_day_choices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users set own journey day choice"
  ON public.journey_day_choices FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.warrior_programs wp
      WHERE wp.id = warrior_program_id AND wp.warrior_id = auth.uid()
    )
  );

CREATE POLICY "Users change own journey day choice"
  ON public.journey_day_choices FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.warrior_programs wp
      WHERE wp.id = warrior_program_id AND wp.warrior_id = auth.uid()
    )
  );
