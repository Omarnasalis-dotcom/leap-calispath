import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

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

  // Authenticated as the caller (not service_role) — RLS on `notifications`
  // ("Users can read own notifications") is what proves this notification
  // actually belongs to the caller. There is deliberately no separate
  // ownership check here: a missing row and someone else's row look
  // identical, both 404.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: notification, error: fetchError } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, data, push_sent_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (fetchError) {
    console.error("notifications fetch error:", fetchError);
    return json({ error: "Failed to load notification" }, 500);
  }
  if (!notification) {
    return json({ error: "Notification not found" }, 404);
  }
  if (notification.push_sent_at) {
    return json({ success: true, delivered: true, alreadySent: true });
  }

  // push_token is deliberately excluded from every direct SELECT grant on
  // profiles (see 20260630190000_lock_down_profiles_pii_columns.sql) — the
  // only path to read it, even for your own row, is this SECURITY DEFINER RPC.
  const { data: myProfile, error: profileError } = await supabase
    .rpc("get_my_profile")
    .single();

  if (profileError) {
    console.error("get_my_profile error:", profileError);
    return json({ error: "Failed to load profile" }, 500);
  }

  const pushToken = (myProfile as { push_token?: string | null } | null)?.push_token;
  if (!pushToken) {
    await supabase.from("notifications").update({ push_error: "NO_TOKEN" }).eq("id", notificationId);
    return json({ success: true, delivered: false, reason: "NO_TOKEN" });
  }

  // Expo's response `data` is an array of tickets, one per message in the
  // request body — indexed the same as the input array, not a single object.
  let expoResult: { data?: Array<{ status: string; message?: string; details?: { error?: string } }> };
  try {
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
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
    await supabase.from("notifications").update({ push_error: "EXPO_REQUEST_FAILED" }).eq("id", notificationId);
    return json({ success: true, delivered: false, reason: "EXPO_REQUEST_FAILED" });
  }

  const ticket = expoResult.data?.[0];
  if (!ticket || ticket.status !== "ok") {
    const errorCode = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR";
    await supabase.from("notifications").update({ push_error: String(errorCode) }).eq("id", notificationId);

    // Token is permanently dead (app uninstalled, etc.) — clear it so future
    // notifications don't keep paying the round trip to find out again.
    // Table-wide UPDATE is granted to authenticated and "Warriors can update
    // own profile" scopes it to auth.uid() = id, so this is safe as the
    // caller's own row.
    if (ticket?.details?.error === "DeviceNotRegistered") {
      await supabase.from("profiles").update({ push_token: null }).eq("id", notification.user_id);
    }

    return json({ success: true, delivered: false, reason: errorCode });
  }

  await supabase.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", notificationId);

  return json({ success: true, delivered: true });
});
