import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

// Delivers an admin message (admin-web Messages page) as pushes.
//
// Who gets the message is decided by the database, not here: admin_send_message
// already wrote one notifications row per person. This function only pushes
// the rows of that one message that were never sent. Rows are claimed in the
// database (admin_message_claim_pending), so two calls can't push a row twice.
//
// Body: { message_id, action?: "send" | "receipts" }
//   send     : push every unsent row, 100 at a time.
//   receipts : ask Expo whether earlier pushes really reached Apple/Google
//              (available about 15 minutes after sending).
//
// The caller must be an admin. Sanity cap (2026-08-05 fan-out incident): if
// more rows are waiting than the message was sent to, refuse.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 100;
const RECEIPT_BATCH = 300;
// Leave time to answer before the platform's request limit.
const TIME_BUDGET_MS = 100_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function firstKey(envName: string, legacyEnvName: string): string {
  // New keys (sb_secret_… / sb_publishable_…) first; the legacy JWT keys are
  // only a fallback.
  const raw = Deno.env.get(envName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = parsed[Object.keys(parsed)[0]];
      if (key) return key;
    } catch {
      // fall through to the legacy key
    }
  }
  return Deno.env.get(legacyEnvName) ?? "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ClaimedRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  push_token: string | null;
}

type ExpoTicket = { status: string; id?: string; message?: string; details?: { error?: string } };
type ExpoReceipt = { status: string; message?: string; details?: { error?: string } };
type PushResult = { id: string; ticket_id?: string; error?: string; receipt?: string };

async function sendPending(admin: SupabaseClient, messageId: string) {
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  let noToken = 0;

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: claimed, error: claimError } = await admin.rpc("admin_message_claim_pending", {
      p_message_id: messageId,
      p_limit: BATCH,
    });
    if (claimError) {
      console.error("admin_message_claim_pending error:", claimError);
      return { error: "Failed to load the message rows", sent, failed, noToken };
    }
    const rows = (claimed ?? []) as ClaimedRow[];
    if (rows.length === 0) break;

    const results: PushResult[] = [];
    const withToken = rows.filter((r) => r.push_token);
    for (const r of rows) {
      if (!r.push_token) {
        results.push({ id: r.id, error: "NO_TOKEN" });
        noToken++;
      }
    }

    if (withToken.length > 0) {
      let tickets: ExpoTicket[] | null = null;
      try {
        const resp = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
          body: JSON.stringify(withToken.map((r) => ({
            to: r.push_token,
            title: r.title,
            body: r.body,
            data: r.data ?? {},
            sound: "default",
          }))),
        });
        // Expo's `data` is an array of tickets, one per message, in order.
        const parsed = await resp.json();
        tickets = Array.isArray(parsed?.data) ? parsed.data : null;
      } catch (err) {
        console.error("Expo push request failed:", err);
      }

      for (const [i, r] of withToken.entries()) {
        const ticket = tickets?.[i];
        if (ticket?.status === "ok") {
          results.push({ id: r.id, ticket_id: ticket.id });
          sent++;
        } else {
          const code = tickets ? (ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR") : "EXPO_REQUEST_FAILED";
          results.push({ id: r.id, error: String(code).slice(0, 200) });
          failed++;
        }
      }
    }

    const { error: recordError } = await admin.rpc("admin_message_record_push", { p_rows: results });
    if (recordError) {
      // The rows stay marked as sent, so nothing is pushed twice.
      console.error("admin_message_record_push error:", recordError);
    }
  }

  const { count: remaining } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId)
    .is("push_sent_at", null)
    .is("push_error", null);

  return { sent, failed, noToken, remaining: remaining ?? 0 };
}

async function checkReceipts(admin: SupabaseClient, messageId: string) {
  const started = Date.now();
  let delivered = 0;
  let failed = 0;
  let waiting = 0;

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: rows, error } = await admin
      .from("notifications")
      .select("id, push_ticket_id")
      .eq("message_id", messageId)
      .not("push_ticket_id", "is", null)
      .is("push_receipt", null)
      .order("id")
      .range(waiting, waiting + RECEIPT_BATCH - 1);
    if (error) {
      console.error("receipt rows error:", error);
      return { error: "Failed to load the message rows", delivered, failed, waiting };
    }
    const batch = (rows ?? []) as Array<{ id: string; push_ticket_id: string }>;
    if (batch.length === 0) break;

    let receipts: Record<string, ExpoReceipt> = {};
    try {
      const resp = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ ids: batch.map((r) => r.push_ticket_id) }),
      });
      receipts = (await resp.json())?.data ?? {};
    } catch (err) {
      console.error("Expo receipts request failed:", err);
      return { error: "Expo did not answer", delivered, failed, waiting };
    }

    const results: PushResult[] = [];
    for (const r of batch) {
      const receipt = receipts[r.push_ticket_id];
      if (!receipt) {
        // Not ready yet; skip past it on the next page.
        waiting++;
      } else if (receipt.status === "ok") {
        results.push({ id: r.id, receipt: "ok" });
        delivered++;
      } else {
        results.push({ id: r.id, receipt: String(receipt.details?.error ?? receipt.message ?? "error").slice(0, 200) });
        failed++;
      }
    }
    if (results.length > 0) {
      const { error: recordError } = await admin.rpc("admin_message_record_push", { p_rows: results });
      if (recordError) {
        console.error("admin_message_record_push error:", recordError);
        return { error: "Failed to save receipts", delivered, failed, waiting };
      }
    }
    if (batch.length < RECEIPT_BATCH) break;
  }

  return { delivered, failed, waiting };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { message_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const messageId = body.message_id;
  const action = body.action ?? "send";
  if (!messageId || !UUID_RE.test(messageId)) {
    return json({ error: "Missing or invalid message_id" }, 400);
  }
  if (action !== "send" && action !== "receipts") {
    return json({ error: "Invalid action" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = firstKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }

  // As the caller: must be a signed-in admin.
  const asCaller = createClient(url, firstKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await asCaller.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { data: isAdmin, error: adminError } = await asCaller.rpc("is_admin");
  if (adminError) {
    console.error("is_admin error:", adminError);
    return json({ error: "Failed to check access" }, 500);
  }
  if (isAdmin !== true) {
    return json({ error: "Admins only" }, 403);
  }

  const admin = createClient(url, serviceKey);

  const { data: message, error: messageError } = await admin
    .from("admin_messages")
    .select("id, target_count")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError) {
    console.error("admin_messages fetch error:", messageError);
    return json({ error: "Failed to load the message" }, 500);
  }
  if (!message) {
    return json({ error: "Message not found" }, 404);
  }

  if (action === "receipts") {
    const outcome = await checkReceipts(admin, messageId);
    return json({ success: !("error" in outcome), ...outcome }, "error" in outcome ? 500 : 200);
  }

  const { count: pending, error: countError } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId)
    .is("push_sent_at", null)
    .is("push_error", null);
  if (countError) {
    console.error("pending count error:", countError);
    return json({ error: "Failed to load the message rows" }, 500);
  }
  if ((pending ?? 0) > message.target_count) {
    console.error(`send-admin-message: ${pending} rows waiting for message ${messageId}, sent to ${message.target_count}; refusing`);
    return json({ error: "SANITY_CAP_EXCEEDED", pending }, 409);
  }

  const outcome = await sendPending(admin, messageId);
  return json({ success: !("error" in outcome), ...outcome }, "error" in outcome ? 500 : 200);
});
