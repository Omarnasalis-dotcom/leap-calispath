-- TEMPORARY: flipping the paywall kill switch on for real-device testing of
-- the just-shipped tier system (First/Pro/Max badges, gating). This enables
-- real enforcement for ALL live users on both platforms, not just the test
-- account — expected to be reverted shortly via a follow-up migration once
-- testing is done.
UPDATE public.app_config SET paywall_enabled = true WHERE platform IN ('ios', 'android');
