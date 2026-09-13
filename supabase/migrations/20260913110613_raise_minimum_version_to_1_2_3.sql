-- Forces the update-required screen (ForceUpdateScreen, src/lib/appVersion.ts)
-- for anyone below 1.2.3 on either platform. Both platforms have 1.2.3 live
-- in their respective stores as of this migration (Android confirmed live,
-- iOS confirmed released) -- see project notes.
--
-- Primarily closes out a real bug, not just a routine bump: freemium/paywall
-- gating first shipped in 1.2.0 with a deep-link double-navigation race and
-- a wrong-parsed-URL bug that could leave a user stuck mid-paywall-flow,
-- fixed progressively across builds 13/14/16/17 and clean by 1.2.1. Anyone
-- still on 1.2.0 or earlier is running the buggy version.
update "public"."app_config" set minimum_version = '1.2.3' where platform = 'ios';
update "public"."app_config" set minimum_version = '1.2.3' where platform = 'android';
