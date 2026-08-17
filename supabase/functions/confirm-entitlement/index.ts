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
  const entitlements: Record<string, { expires_date: string | null }> = rcData?.subscriber?.entitlements ?? {};

  // Only one entitlement exists in this project ("Leap Arena Pro") — don't
  // hardcode its identifier string, just take whichever entry has the
  // furthest-future expiry, in case that ever changes.
  let latestExpiresAt: string | null = null;
  for (const entitlement of Object.values(entitlements)) {
    if (!entitlement.expires_date) continue;
    if (!latestExpiresAt || new Date(entitlement.expires_date) > new Date(latestExpiresAt)) {
      latestExpiresAt = entitlement.expires_date;
    }
  }

  if (!latestExpiresAt || new Date(latestExpiresAt).getTime() <= Date.now()) {
    return json({ success: true, active: false });
  }

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("[confirm-entitlement] Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const { error } = await admin.rpc("apply_revenuecat_entitlement", {
    p_user_id: userId,
    p_expires_at: latestExpiresAt,
    p_source: "rc_subscription",
  });

  if (error) {
    console.error(`[confirm-entitlement] apply_revenuecat_entitlement failed for ${userId}:`, error);
    return json({ error: "Failed to apply entitlement" }, 500);
  }

  return json({ success: true, active: true });
});
