-- Pause = read-only for a coach: every write policy a coach relies on gets
-- an added "AND NOT is_coaching_paused(auth.uid())" on the coach's own
-- branch, while admin-override policies and read/select policies are left
-- completely untouched (paused coaches can still see their own data; admins
-- are never affected by another user's pause state).
--
-- RLS policies are OR'd together, so every policy that could independently
-- grant a write on a coach-owned row needs the same treatment — fixing only
-- one of several overlapping policies leaves the others as a bypass. This
-- migration is exhaustive per table for that reason (verified against the
-- live policy list before writing this).

-- ---------- exercise_library ----------
-- Single combined policy per operation (coach-branch OR admin-branch) —
-- pause only applies to the coach branch.

ALTER POLICY "Coaches and admin can insert exercises" ON public.exercise_library
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND ((profiles.is_coach = true AND NOT public.is_coaching_paused(auth.uid())) OR profiles.is_admin = true)
  )
);

ALTER POLICY "Coaches delete own exercises, admins delete any" ON public.exercise_library
USING (
  (
    (created_by = auth.uid())
    OR (created_by IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true
    ))
  ) AND NOT public.is_coaching_paused(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

ALTER POLICY "Coaches update own exercises, admins update any" ON public.exercise_library
USING (
  (
    (created_by = auth.uid())
    OR (created_by IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true
    ))
  ) AND NOT public.is_coaching_paused(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
)
WITH CHECK (
  (
    (created_by = auth.uid())
    OR (created_by IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true
    ))
  ) AND NOT public.is_coaching_paused(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- ---------- program_templates ----------
-- One coach-scoped policy per operation, admin's override is a fully
-- separate "Admin manages all templates" policy — untouched.

ALTER POLICY "Coaches can insert templates" ON public.program_templates
WITH CHECK (
  coach_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true)
  AND NOT public.is_coaching_paused(auth.uid())
);

ALTER POLICY "Coaches can delete templates" ON public.program_templates
USING (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()));

ALTER POLICY "Coaches can update templates" ON public.program_templates
USING (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
WITH CHECK (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()));

-- ---------- warrior_programs ----------
-- "Coaches manage their assignments" is FOR ALL and, left alone, would
-- independently satisfy every write even after the narrower per-operation
-- policies below are fixed (RLS OR's across all matching policies) — it
-- gets the same check. Reads stay open regardless: "Users can view warrior
-- programs" / "Warriors view own programs" are separate SELECT-only
-- policies, untouched.

ALTER POLICY "Coaches manage their assignments" ON public.warrior_programs
USING (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()));

ALTER POLICY "Coaches can insert warrior programs" ON public.warrior_programs
WITH CHECK (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()));

ALTER POLICY "Coaches can delete warrior programs" ON public.warrior_programs
USING (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()));

-- Covers both the coach updating (e.g. pause/activate/complete status) and
-- the warrior updating their own row (e.g. current_week progress) — only
-- the coach branch is pause-gated; a warrior's own updates must keep
-- working regardless of their coach's pause state.
ALTER POLICY "Users can update warrior programs" ON public.warrior_programs
USING (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR warrior_id = auth.uid()
)
WITH CHECK (
  (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
  OR warrior_id = auth.uid()
);
