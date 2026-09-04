import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

// User-triggered fallback for the purchase-confirmation UX gap in
// PaywallScreen.tsx: the RevenueCat SDK's purchase/restore callback fires
// the instant StoreKit confirms, but the DB grant normally happens via the
// revenuecat-webhook function, which isn't instant. If the client polls the
// profile for a few seconds and access still isn't showing, it calls this
// instead of just waiting longer — this does a direct server-side lookup
// against RevenueCat's own REST API rather than trusting the client's own
// claim that a purchase succeeded.
//
// verify_jwt=true (see supabase/config.toml), so the platform gateway has
// already validated the token's signature/expiry before invoking this —
// decoding the payload to read the user id is safe and avoids a second
// network round trip to the auth server, same pattern as submit-trial-result.
function decodeJwtSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return typeof claims?.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Keep in sync by hand with the identical map in
// supabase/functions/revenuecat-webhook/index.ts — see that file's comment
// for the full rationale.
const PRODUCT_TIER_MAP: Record<string, { tier: "first" | "pro" | "max"; budgetUsd: number }> = {
  "com.leap.calispath.sub.first": { tier: "first", budgetUsd: 1.0 },
  "com.leap.calispath.sub.pro.1month": { tier: "pro", budgetUsd: 4.0 },
  "com.leap.calispath.sub.pro.2month": { tier: "pro", budgetUsd: 8.0 },
  // ".v2" — see revenuecat-webhook/index.ts's copy of this map for why.
  "com.leap.calispath.sub.max.1month.v2": { tier: "max", budgetUsd: 10.0 },
  "com.leap.calispath.sub.max.2month": { tier: "max", budgetUsd: 20.0 },
  // Android — RevenueCat identifies Play Store products as
  // "<product_id>:<base_plan_id>", unlike iOS's flat product ID string.
  "first:first-1month": { tier: "first", budgetUsd: 1.0 },
  "pro:pro-1month": { tier: "pro", budgetUsd: 4.0 },
  "pro:pro-2month": { tier: "pro", budgetUsd: 8.0 },
  "max:max-1month": { tier: "max", budgetUsd: 10.0 },
  "max:max-2month": { tier: "max", budgetUsd: 20.0 },
};

function resolveServiceRoleKey(): string {
  const raw = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (raw) return raw;
  const rawSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (rawSecretKeys) {
    try {
      const parsed = JSON.parse(rawSecretKeys);
      return parsed.service_role ?? parsed.serviceRole ?? parsed[Object.keys(parsed)[0]] ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = decodeJwtSubject(authHeader.slice(7));
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  if (!rcSecretKey) {
    console.error("[confirm-entitlement] Missing REVENUECAT_SECRET_API_KEY");
    return json({ error: "Server misconfiguration" }, 500);
  }

  const rcResp = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${rcSecretKey}` },
  });

  if (!rcResp.ok) {
    console.error(`[confirm-entitlement] RevenueCat lookup failed for ${userId}: ${rcResp.status}`);
    return json({ success: false, active: false }, 200);
  }

  const rcData = await rcResp.json();
  const entitlements: Record<string, { expires_date: string | null; product_identifier?: string }> =
    rcData?.subscriber?.entitlements ?? {};
  const subscriptions: Record<string, { store_transaction_id?: string | number }> =
    rcData?.subscriber?.subscriptions ?? {};

  // Only one entitlement exists in this project ("Leap Arena Pro") — don't
  // hardcode its identifier string, just take whichever entry has the
  // furthest-future expiry, in case that ever changes.
  let latestExpiresAt: string | null = null;
  let latestProductId: string | null = null;
  for (const [key, entitlement] of Object.entries(entitlements)) {
    if (!entitlement.expires_date) continue;
    if (!latestExpiresAt || new Date(entitlement.expires_date) > new Date(latestExpiresAt)) {
      latestExpiresAt = entitlement.expires_date;
      latestProductId = entitlement.product_identifier ?? key;
    }
  }

  // The REST API only exposes the CURRENT transaction id per subscription
  // (subscriber.subscriptions[productId].store_transaction_id), not the
  // stable original_transaction_id the webhook payload carries — it
  // changes on every renewal, unlike the webhook's identifier. Confirmed
  // this isn't just an oversight here: neither RevenueCat's v1 nor v2 REST
  // API exposes the stable id anywhere, ever — only real webhook events
  // carry it (per RevenueCat's own community answers). Practical
  // consequence: apply_revenuecat_entitlement's multi-account-revoke guard
  // (keyed off exact rc_original_transaction_id matches) can't correctly
  // revoke a previous account through THIS path — the id passed here won't
  // match what that old account has stored. This path is only a
  // short-lived fallback for when the webhook hasn't landed yet, so that's
  // an accepted, bounded gap: a restore-onto-a-new-account almost always
  // also produces a real TRANSFER webhook shortly after, which DOES carry
  // enough information (transferred_from) to revoke the old account
  // correctly — see revenuecat-webhook/index.ts's TRANSFER branch, which is
  // what actually closes this, not anything achievable here.
  const originalTransactionId = latestProductId
    ? subscriptions[latestProductId]?.store_transaction_id?.toString() ?? null
    : null;

  if (!latestExpiresAt || new Date(latestExpiresAt).getTime() <= Date.now()) {
    return json({ success: true, active: false });
  }

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("[confirm-entitlement] Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const mapped = latestProductId ? PRODUCT_TIER_MAP[latestProductId] : undefined;

  const { error } = await admin.rpc("apply_revenuecat_entitlement", {
    p_user_id: userId,
    p_expires_at: latestExpiresAt,
    p_source: "rc_subscription",
    p_original_transaction_id: originalTransactionId,
    p_tier: mapped?.tier ?? null,
    p_budget_usd: mapped?.budgetUsd ?? null,
    // Always false: this is a lag-bridging fallback for both fresh
    // purchases AND restores, fired from client-side polling — letting it
    // reset the billing period would let a reinstall-and-restore reset a
    // user's day-1 burst / $ budget for free. Only the real webhook event
    // (which carries a genuine event type) is allowed to start a new
    // period; it typically follows shortly after this and corrects things.
    p_is_new_period: false,
  });

  if (error) {
    console.error(`[confirm-entitlement] apply_revenuecat_entitlement failed for ${userId}:`, error);
    return json({ error: "Failed to apply entitlement" }, 500);
  }

  return json({ success: true, active: true });
});
