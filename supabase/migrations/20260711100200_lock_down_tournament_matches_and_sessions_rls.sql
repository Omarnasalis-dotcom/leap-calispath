-- tournament_matches had "Allow all insert" (INSERT, WITH CHECK true) and
-- "Allow all update" (UPDATE, USING true) open to the `public` role, which
-- in Postgres RLS includes unauthenticated anon requests — anyone holding
-- the app's public anon key could fabricate or rewrite match results for
-- any tournament with zero login required.
--
-- tournament_sessions had "Allow authenticated users to update sessions"
-- (UPDATE, USING auth.role() = 'authenticated') — any logged-in user, not
-- just participants of that session, could rewrite its status/round/lock.
--
-- The client (src/services/TournamentService.ts) drives match creation and
-- session advancement from an ordinary participant's own device as a side
-- effect of submitting their score, so the fix scopes access to "must be a
-- participant of this specific tournament" rather than admin-only, which
-- would break that flow entirely. Admin access is untouched — it already
-- has its own separate "Admins manage tournament sessions" / "Admins can
-- delete matches" policies that this migration doesn't touch.
--
-- Read access (SELECT) is unaffected — public match/session viewing was
-- never the risk here, only unrestricted writes.

DROP POLICY IF EXISTS "Allow all insert" ON public.tournament_matches;
DROP POLICY IF EXISTS "Allow all update" ON public.tournament_matches;

CREATE POLICY "Participants can insert matches for their tournament"
  ON public.tournament_matches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_participants
      WHERE tournament_id = tournament_matches.tournament_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can update matches for their tournament"
  ON public.tournament_matches
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_participants
      WHERE tournament_id = tournament_matches.tournament_id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_participants
      WHERE tournament_id = tournament_matches.tournament_id
        AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow authenticated users to update sessions" ON public.tournament_sessions;

CREATE POLICY "Participants can update their tournament session"
  ON public.tournament_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_participants
      WHERE tournament_id = tournament_sessions.id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_participants
      WHERE tournament_id = tournament_sessions.id
        AND user_id = auth.uid()
    )
  );
