import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

// Not user-triggered — invoked by RevenueCat's server, authenticated by a
// fixed Authorization header value configured in the RC dashboard (same
// shared-secret shape as the x-cron-secret pattern used by the cron
// functions), not a Supabase user JWT — verify_jwt is off for this function
// (see supabase/config.toml).
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("Authorization");
  return !!auth && auth === Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Same robust resolution as every other Edge Function in this project.
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

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  expiration_at_ms: number | null;
  product_id?: string;
  id?: string;
  // Apple's transaction id for the ORIGINAL purchase in a subscription —
  // stable across renewals and across RevenueCat app_user_id transfers,
  // unlike transaction_id (changes every renewal) or app_user_id itself.
  // Used to detect the same real subscription being claimed by more than
  // one account (confirmed happening in testing via Purchases.logIn() on
  // a device that already purchased) so apply_revenuecat_entitlement can
  // revoke the previous holder.
  original_transaction_id?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  let event: RevenueCatEvent;
  try {
    const body = await req.json();
    event = body.event;
    if (!event?.app_user_id) throw new Error("Missing event.app_user_id");
  } catch (err) {
    console.error("[revenuecat-webhook] Failed to parse payload:", err);
    return json({ error: "Invalid payload" }, 400);
  }

  // Deliberately no per-event-type branching (INITIAL_PURCHASE, RENEWAL,
  // CANCELLATION, UNCANCELLATION, PRODUCT_CHANGE, EXPIRATION, BILLING_ISSUE,
  // etc.) — RevenueCat always includes the authoritative current
  // period-end in expiration_at_ms regardless of event type, so a
  // cancellation-still-in-period naturally keeps access, a billing-issue
  // grace period isn't cut early, and switching between the 1/3/6-month
  // tiers is handled identically, all without special-casing each event.
  //
  // app_user_id is auth.uid() directly — Purchases.logIn(user.id) in
  // AuthContext.tsx makes RevenueCat's app_user_id equal to the Supabase
  // user id, so no separate id-mapping lookup is needed here.
  if (!event.expiration_at_ms) {
    console.error(`[revenuecat-webhook] Event ${event.type} for ${event.app_user_id} has no expiration_at_ms, skipping`);
    return json({ success: true, skipped: true });
  }

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("[revenuecat-webhook] Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const { error } = await admin.rpc("apply_revenuecat_entitlement", {
    p_user_id: event.app_user_id,
    p_expires_at: new Date(event.expiration_at_ms).toISOString(),
    p_source: "rc_subscription",
    p_original_transaction_id: event.original_transaction_id ?? null,
  });

  if (error) {
    console.error(`[revenuecat-webhook] apply_revenuecat_entitlement failed for event ${event.id} (${event.type}):`, error);
    return json({ error: "Failed to apply entitlement" }, 500);
  }

  return json({ success: true });
});
