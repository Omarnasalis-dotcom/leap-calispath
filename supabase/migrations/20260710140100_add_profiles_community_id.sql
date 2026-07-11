-- Community feature, phase 1 (continued): tracks each user's current
-- community. Nullable — no community is the default/existing state for
-- every user. One community at a time by design (joining replaces it, see
-- join_community in the next migration), so a single FK column is enough;
-- no membership join table needed.
ALTER TABLE public.profiles
  ADD COLUMN community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL;

-- Every leaderboard filter added in later migrations reads this column,
-- same indexing discipline applied to every other hot FK column this
-- session (warrior_programs.coach_id, program_templates.coach_id, etc.).
CREATE INDEX idx_profiles_community_id ON public.profiles USING btree (community_id);

-- Mandatory step easy to forget: profiles restricts cross-user column
-- reads to an explicit GRANT allowlist (20260630190000_lock_down_profiles
-- _pii_columns.sql). Without this, community_id is invisible to every
-- cross-user read that doesn't go through a SECURITY DEFINER RPC —
-- specifically the Power and Well-Rounded-gender-backfill leaderboard
-- queries, which query profiles directly rather than through an RPC.
GRANT SELECT (community_id) ON TABLE public.profiles TO authenticated;
