import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

// Generic sender for any "leaderboard_overtaken*" notification, reused
// across every board (strength, power, and later static/1mm/well-rounded).
// The submission RPC that created the row already proved legitimacy —
// authenticated=true (verify_jwt) is enough to trigger delivery of an
// already-queued row; the caller doesn't need to be the recipient, since
// they're just prompting immediate send, not fabricating content. The type
// prefix check keeps this endpoint from being repurposed to force-send any
// other notification class early.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { notification_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const notificationId = body.notification_id;
  if (!notificationId) {
    return json({ error: "Missing required field: notification_id" }, 400);
  }

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const { data: notification, error: fetchError } = await admin
    .from("notifications")
    .select("id, user_id, type, title, body, data, push_sent_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (fetchError) {
    console.error("notifications fetch error:", fetchError);
    return json({ error: "Failed to load notification" }, 500);
  }
  if (!notification) {
    return json({ error: "Notification not found" }, 404);
  }
  if (!notification.type.startsWith("leaderboard_overtaken")) {
    return json({ error: "This endpoint only sends leaderboard_overtaken notifications" }, 403);
  }
  if (notification.push_sent_at) {
    return json({ success: true, delivered: true, alreadySent: true });
  }

  const { data: profile } = await admin.from("profiles").select("push_token").eq("id", notification.user_id).maybeSingle();
  const pushToken = (profile as { push_token?: string | null } | null)?.push_token;
  if (!pushToken) {
    await admin.from("notifications").update({ push_error: "NO_TOKEN" }).eq("id", notificationId);
    return json({ success: true, delivered: false, reason: "NO_TOKEN" });
  }

  let expoResult: { data?: Array<{ status: string; message?: string; details?: { error?: string } }> };
  try {
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify([{
        to: pushToken,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        sound: "default",
      }]),
    });
    expoResult = await expoResponse.json();
  } catch (err) {
    console.error("Expo push request failed:", err);
    await admin.from("notifications").update({ push_error: "EXPO_REQUEST_FAILED" }).eq("id", notificationId);
    return json({ success: true, delivered: false, reason: "EXPO_REQUEST_FAILED" });
  }

  const ticket = expoResult.data?.[0];
  if (!ticket || ticket.status !== "ok") {
    const errorCode = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR";
    await admin.from("notifications").update({ push_error: String(errorCode) }).eq("id", notificationId);
    if (ticket?.details?.error === "DeviceNotRegistered") {
      await admin.from("profiles").update({ push_token: null }).eq("id", notification.user_id);
    }
    return json({ success: true, delivered: false, reason: errorCode });
  }

  await admin.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", notificationId);

  return json({ success: true, delivered: true });
});
