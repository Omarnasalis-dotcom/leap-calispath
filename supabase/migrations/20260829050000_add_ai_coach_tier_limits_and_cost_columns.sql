-- Tier-only key (not tier+duration) — the confirmed spec's message caps
-- (day-1/steady-state/weekly) don't vary between a tier's 1mo/2mo variants,
-- only the $ budget does (that lives directly on profiles.ai_coach_budget_usd,
-- set per-grant since it's the one value that varies by duration too).
CREATE TABLE public.ai_coach_tier_limits (
  tier text PRIMARY KEY CHECK (tier IN ('first', 'pro', 'max')),
  day1_msg_cap integer NOT NULL,
  steady_daily_cap integer,   -- NULL = no split (First: one flat allowance)
  weekly_msg_cap integer      -- NULL = no split (First)
);

INSERT INTO public.ai_coach_tier_limits (tier, day1_msg_cap, steady_daily_cap, weekly_msg_cap) VALUES
  ('first', 20, NULL, NULL),
  ('pro',   20, 10,   50),
  ('max',   30, 15,   75);

-- Same "public config, no per-row sensitivity" pattern as app_config itself
-- (confirmed: RLS enabled, permissive public SELECT policy, service_role
-- has full access) — mirrored exactly here.
ALTER TABLE public.ai_coach_tier_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read tier limits" ON public.ai_coach_tier_limits
  FOR SELECT TO public USING (true);
GRANT SELECT ON TABLE public.ai_coach_tier_limits TO anon;
GRANT SELECT ON TABLE public.ai_coach_tier_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_coach_tier_limits TO service_role;

-- Only kind='chat' rows ever populate these — the AI-coach write RPCs
-- (create_program/append_week/etc.) never call Claude at all, so they have
-- nothing to cost.
ALTER TABLE public.ai_coach_requests
  ADD COLUMN cost_usd numeric(10,6),
  ADD COLUMN input_tokens integer,
  ADD COLUMN output_tokens integer,
  ADD COLUMN cache_creation_input_tokens integer,
  ADD COLUMN cache_read_input_tokens integer;
