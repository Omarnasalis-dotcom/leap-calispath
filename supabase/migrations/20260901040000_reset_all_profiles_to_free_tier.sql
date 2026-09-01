-- One-time reset: every profile currently showing active access (203 of
-- 251 at time of writing) got there via the 2026-08-16 grandfathering
-- backfill (192), the normal new-signup trial (5), a manual admin_grant
-- (3, including the team's own live-paywall-testing account), or
-- untagged early dev/founder-era accounts (3) — confirmed via direct
-- query that only ONE of these 203 has a real rc_original_transaction_id
-- attached (the team's own test purchase), so there are no genuine paying
-- customers to preserve here.
--
-- Only the "is access currently active" fields are cleared —
-- rc_original_transaction_id and all other purchase-history columns are
-- left untouched, so anyone with a real live RevenueCat subscription
-- self-heals correctly on their next webhook event (renewal/refresh)
-- rather than being permanently disconnected from it. New signups still
-- get their normal trial going forward — this only clears what's
-- currently granted.
UPDATE public.profiles
SET subscription_tier = NULL,
    access_granted_at = NULL,
    access_expires_at = NULL,
    entitlement_source = NULL
WHERE access_expires_at IS NOT NULL AND access_expires_at > now();
