-- Kill switch back off (see 20260902030000 for the last flip and
-- 20260902010000/20260902020000 for why it was ever off). getSubscriptionTier()/
-- caller_effective_tier() both return 'max' unconditionally for everyone while
-- this is false, same as before the tier-system rollout began.
UPDATE public.app_config SET paywall_enabled = false WHERE platform IN ('ios', 'android');
