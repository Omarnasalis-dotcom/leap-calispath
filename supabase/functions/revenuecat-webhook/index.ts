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
  // Only present on PRODUCT_CHANGE — per RevenueCat's own webhook field
  // reference, product_id on THIS event type means the product the
  // subscriber switched FROM, not to. new_product_id is the actual
  // destination product. Every other event type (INITIAL_PURCHASE,
  // RENEWAL, ...) only ever sets product_id, which already means "the
  // product," so resolvedProductId below falls back to it for those.
  new_product_id?: string;
  id?: string;
  // Apple's transaction id for the ORIGINAL purchase in a subscription —
  // stable across renewals and across RevenueCat app_user_id transfers,
  // unlike transaction_id (changes every renewal) or app_user_id itself.
  // Used to detect the same real subscription being claimed by more than
  // one account (confirmed happening in testing via Purchases.logIn() on
  // a device that already purchased) so apply_revenuecat_entitlement can
  // revoke the previous holder.
  original_transaction_id?: string;
  // TRANSFER-only: RevenueCat's own mechanism for reassigning a
  // subscription's app_user_id (fires automatically when Purchases.logIn()
  // detects the same real subscription already belongs to a different
  // account — a real, reproduced scenario given this project's own
  // multi-account testing). This event type carries NEITHER app_user_id
  // NOR expiration_at_ms — see the TRANSFER branch below, which must run
  // before either of those fields is required.
  transferred_from?: string[];
  transferred_to?: string[];
}

// Product IDs set up in App Store Connect/RevenueCat for the 2026-08-29
// Free/First/Pro/Max tier launch — keep in sync by hand with the identical
// map in supabase/functions/confirm-entitlement/index.ts and with
// src/lib/entitlement.ts's SubscriptionTier type. Budget is the $ ceiling
// for one full billing period at that product's own duration (Pro 2mo gets
// double Pro 1mo's budget, same message-count pacing either duration —
// see ai_coach_tier_limits, which is tier-only, not tier+duration).
const PRODUCT_TIER_MAP: Record<string, { tier: "first" | "pro" | "max"; budgetUsd: number }> = {
  "com.leap.calispath.sub.first": { tier: "first", budgetUsd: 1.0 },
  "com.leap.calispath.sub.pro.1month": { tier: "pro", budgetUsd: 4.0 },
  "com.leap.calispath.sub.pro.2month": { tier: "pro", budgetUsd: 8.0 },
  // ".v2" — the plain "com.leap.calispath.sub.max.1month" ID was created
  // then deleted in App Store Connect during setup; Apple never allows a
  // deleted product ID to be reused, so this is the real, final ID.
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

// Events that mean "a new billing period just started" — only these reset
// entitlement_period_start (and therefore the AI Coach $ budget/message
// pacing window). Everything else (CANCELLATION, UNCANCELLATION,
// EXPIRATION, BILLING_ISSUE, ...) leaves the current period's spend/message
// counters exactly where they were.
const NEW_PERIOD_EVENT_TYPES = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"]);

// Only used to tell an upgrade PRODUCT_CHANGE apart from a downgrade one —
// see the branch below for why that distinction matters.
const TIER_RANK: Record<"first" | "pro" | "max", number> = { first: 1, pro: 2, max: 3 };

// Same live-lookup RevenueCat's REST API supports as confirm-entitlement's
// fallback path — reused here because a TRANSFER event carries no
// expiration_at_ms/product_id of its own to apply directly; the only way to
// know what the destination account should actually receive is to ask
// RevenueCat what it currently holds.
async function fetchLiveEntitlement(userId: string, rcSecretKey: string) {
  const rcResp = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${rcSecretKey}` },
  });
  if (!rcResp.ok) {
    console.error(`[revenuecat-webhook] Live entitlement lookup failed for ${userId}: ${rcResp.status}`);
    return null;
  }
  const rcData = await rcResp.json();
  const entitlements: Record<string, { expires_date: string | null; product_identifier?: string }> =
    rcData?.subscriber?.entitlements ?? {};
  const subscriptions: Record<string, { store_transaction_id?: string | number }> =
    rcData?.subscriber?.subscriptions ?? {};

  let expiresAt: string | null = null;
  let productId: string | null = null;
  for (const [key, entitlement] of Object.entries(entitlements)) {
    if (!entitlement.expires_date) continue;
    if (!expiresAt || new Date(entitlement.expires_date) > new Date(expiresAt)) {
      expiresAt = entitlement.expires_date;
      productId = entitlement.product_identifier ?? key;
    }
  }
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) return null;

  // Same tradeoff confirm-entitlement already accepts: the REST API only
  // exposes the CURRENT (renews-every-cycle) transaction id, not the stable
  // original_transaction_id a real webhook event carries. Self-corrects on
  // the destination account's next RENEWAL event, which does carry the
  // stable id.
  const transactionId = productId ? subscriptions[productId]?.store_transaction_id?.toString() ?? null : null;
  return { expiresAt, productId, transactionId };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  let event: RevenueCatEvent;
  try {
    const body = await req.json();
    event = body.event;
    if (!event?.type) throw new Error("Missing event.type");
  } catch (err) {
    console.error("[revenuecat-webhook] Failed to parse payload:", err);
    return json({ error: "Invalid payload" }, 400);
  }

  // TRANSFER carries neither app_user_id nor expiration_at_ms — it must be
  // handled before either is required below, or it always 400s (confirmed
  // happening live: RC's dashboard showed 6/6 delivery failures for exactly
  // this reason, and the destination account's entitlement was never
  // applied even though the real subscription was, and stayed, active).
  if (event.type === "TRANSFER") {
    const serviceRoleKey = resolveServiceRoleKey();
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
    if (!serviceRoleKey || !rcSecretKey) {
      console.error("[revenuecat-webhook] Missing service role or RevenueCat API credentials for TRANSFER");
      return json({ error: "Server misconfiguration" }, 500);
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);
    const realDestinationIds = (event.transferred_to ?? []).filter((id) => !id.startsWith("$RCAnonymousID:"));
    const realSourceIds = (event.transferred_from ?? []).filter((id) => !id.startsWith("$RCAnonymousID:"));

    // Revoke the losing account(s) directly, by identity — not by matching
    // rc_original_transaction_id the way apply_revenuecat_entitlement's own
    // multi-account guard does elsewhere. That guard depends on the NEW
    // account being granted the same stable original_transaction_id the OLD
    // account already has stored, but the live entitlement lookup below can
    // only return the current (renews-every-cycle) transaction id, not the
    // stable one — so relying on that match here would silently fail to
    // revoke the old account (confirmed happening live: both accounts
    // showed active after a transfer). RC is already telling us definitively
    // who lost the subscription via transferred_from, so use that directly.
    if (realSourceIds.length > 0) {
      const { error: revokeError } = await admin
        .from("profiles")
        .update({ access_expires_at: new Date().toISOString() })
        .in("id", realSourceIds)
        .eq("entitlement_source", "rc_subscription");
      if (revokeError) {
        console.error("[revenuecat-webhook] Failed to revoke TRANSFER source accounts:", revokeError);
      }
    }

    for (const userId of realDestinationIds) {
      const live = await fetchLiveEntitlement(userId, rcSecretKey);
      if (!live) continue; // Nothing currently active for this id — nothing to apply.
      const mapped = live.productId ? PRODUCT_TIER_MAP[live.productId] : undefined;
      const { error } = await admin.rpc("apply_revenuecat_entitlement", {
        p_user_id: userId,
        p_expires_at: live.expiresAt,
        p_source: "rc_subscription",
        p_original_transaction_id: live.transactionId,
        p_tier: mapped?.tier ?? null,
        p_budget_usd: mapped?.budgetUsd ?? null,
        // Not a new billing period — same subscription, just reassigned.
        p_is_new_period: false,
      });
      if (error) {
        console.error(`[revenuecat-webhook] apply_revenuecat_entitlement failed for TRANSFER destination ${userId}:`, error);
        return json({ error: "Failed to apply entitlement" }, 500);
      }
    }
    return json({ success: true });
  }

  if (!event.app_user_id) {
    console.error(`[revenuecat-webhook] Event ${event.type} has no app_user_id, skipping`);
    return json({ success: true, skipped: true });
  }

  // access_expires_at handling stays deliberately event-type-agnostic, as
  // before — RevenueCat always includes the authoritative current period-end
  // in expiration_at_ms regardless of event type, so a cancellation-still-
  // in-period naturally keeps access and a billing-issue grace period isn't
  // cut early. The ONE thing that now branches by event type (2026-08-29,
  // tier launch) is entitlement_period_start: only a real new-period event
  // (see NEW_PERIOD_EVENT_TYPES) resets the AI Coach $ budget/message
  // pacing window — a plain renewal notification for the same ongoing
  // period must not give someone a fresh budget mid-period.
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

  // PRODUCT_CHANGE (an in-group upgrade/downgrade) is the one event type
  // where product_id means "switched FROM," not the destination — the real
  // new product lives in new_product_id. Reading product_id here for that
  // event type silently re-applied the OLD tier on every upgrade (confirmed
  // against RevenueCat's own webhook field reference — this was a real,
  // shipped bug, not a hypothetical). Every other event type only ever
  // populates product_id, so this falls back to it correctly for those.
  const resolvedProductId = event.new_product_id ?? event.product_id;

  // Unmapped/legacy product id (e.g. one of the pre-tier-launch products) —
  // leave tier/budget untouched via apply_revenuecat_entitlement's own
  // COALESCE(p_tier, subscription_tier) fallback; access_expires_at still
  // advances normally either way.
  const mapped = resolvedProductId ? PRODUCT_TIER_MAP[resolvedProductId] : undefined;

  // A downgrade PRODUCT_CHANGE fires immediately too, but — unlike an
  // upgrade — Apple defers it to the end of the current period; the
  // customer keeps their existing (higher) tier's access until then.
  // RevenueCat's own docs confirm this event is "informative" for a
  // downgrade and "does not mean the product change has gone into effect."
  // Applying it right away would prematurely cut someone from Pro to First
  // budget/caps the instant they picked a lower plan, well before they've
  // actually lost Pro access — confirmed as a real, reproducible risk, not
  // hypothetical, once the earlier upgrade-mapping bug made testing
  // downgrades possible. The real switch arrives later as a RENEWAL event
  // (product_id directly holds the new product then, no new_product_id
  // involved), which this same code already applies correctly as-is.
  if (event.type === "PRODUCT_CHANGE" && mapped) {
    const fromMapped = event.product_id ? PRODUCT_TIER_MAP[event.product_id] : undefined;
    const isDowngradeOrLateral = fromMapped && TIER_RANK[mapped.tier] <= TIER_RANK[fromMapped.tier];
    if (isDowngradeOrLateral) {
      return json({ success: true, skipped: true, reason: "deferred_downgrade" });
    }
  }

  const { error } = await admin.rpc("apply_revenuecat_entitlement", {
    p_user_id: event.app_user_id,
    p_expires_at: new Date(event.expiration_at_ms).toISOString(),
    p_source: "rc_subscription",
    p_original_transaction_id: event.original_transaction_id ?? null,
    p_tier: mapped?.tier ?? null,
    p_budget_usd: mapped?.budgetUsd ?? null,
    p_is_new_period: NEW_PERIOD_EVENT_TYPES.has(event.type),
  });

  if (error) {
    console.error(`[revenuecat-webhook] apply_revenuecat_entitlement failed for event ${event.id} (${event.type}):`, error);
    return json({ error: "Failed to apply entitlement" }, 500);
  }

  return json({ success: true });
});
