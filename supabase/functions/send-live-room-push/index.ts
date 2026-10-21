import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

// Delivers the "Half N starts now" notifications that start_live_half just
// queued for the other players in a Live Tournament room
// (docs/features/LIVE_TOURNAMENT_PLAN.md), so a player whose phone is locked
// doesn't miss the countdown. The starter's phone calls this right after the
// half starts.
//
// Who gets a push is decided by the database, not by this function: it only
// delivers rows start_live_half created. The caller must be a player in the
// room, and only this room's live_half_started rows from the last 2 minutes
// that were never sent are touched. Rows are claimed atomically (UPDATE ...
// WHERE push_sent_at IS NULL), so two calls can't send the same row twice.
// Sanity cap (see the 2026-08-05 fan-out incident): a room holds at most 24
// players, so more pending rows than that means something is wrong; refuse.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NOTIFICATION_TYPE = "live_half_started";
const MAX_ROOM_PLAYERS = 24;
const FRESH_MS = 2 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function firstKey(envName: string, legacyEnvName: string): string {
  // New keys (sb_secret_… / sb_publishable_…) first; the legacy JWT keys are
  // only a fallback until legacy API keys are disabled (C1 key rotation).
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

interface PendingRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
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

  let body: { room_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const roomId = body.room_id;
  if (!roomId || !UUID_RE.test(roomId)) {
    return json({ error: "Missing or invalid room_id" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = firstKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }

  // As the caller: must be signed in and a player in this room.
  const asClient = createClient(url, firstKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await asClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { data: isPlayer, error: playerError } = await asClient.rpc("is_live_room_player", { p_room_id: roomId });
  if (playerError) {
    console.error("is_live_room_player error:", playerError);
    return json({ error: "Failed to check the room" }, 500);
  }
  if (isPlayer !== true) {
    return json({ error: "Not a player in this room" }, 403);
  }

  const admin = createClient(url, serviceKey);
  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const pendingFilter = () =>
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", NOTIFICATION_TYPE)
      .eq("data->>room_id", roomId)
      .is("push_sent_at", null)
      .is("push_error", null)
      .gte("created_at", since);

  const { count, error: countError } = await pendingFilter();
  if (countError) {
    console.error("pending count error:", countError);
    return json({ error: "Failed to load notifications" }, 500);
  }
  if ((count ?? 0) === 0) {
    return json({ success: true, sent: 0 });
  }
  if ((count ?? 0) > MAX_ROOM_PLAYERS) {
    console.error(`send-live-room-push: ${count} pending rows for room ${roomId}, above the cap; refusing`);
    return json({ error: "Too many pending notifications" }, 409);
  }

  // Claim: whoever's UPDATE lands first gets the rows; a parallel call gets none.
  const { data: claimed, error: claimError } = await admin
    .from("notifications")
    .update({ push_sent_at: new Date().toISOString() })
    .eq("type", NOTIFICATION_TYPE)
    .eq("data->>room_id", roomId)
    .is("push_sent_at", null)
    .is("push_error", null)
    .gte("created_at", since)
    .select("id, user_id, title, body, data");
  if (claimError) {
    console.error("claim error:", claimError);
    return json({ error: "Failed to claim notifications" }, 500);
  }
  const rows = (claimed ?? []) as PendingRow[];
  if (rows.length === 0) {
    return json({ success: true, sent: 0 });
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, push_token")
    .in("id", rows.map((r) => r.user_id));
  const tokenOf = new Map(
    ((profiles ?? []) as Array<{ id: string; push_token: string | null }>).map((p) => [p.id, p.push_token]),
  );

  const withToken = rows.filter((r) => tokenOf.get(r.user_id));
  const noToken = rows.filter((r) => !tokenOf.get(r.user_id));
  if (noToken.length > 0) {
    await admin
      .from("notifications")
      .update({ push_sent_at: null, push_error: "NO_TOKEN" })
      .in("id", noToken.map((r) => r.id));
  }
  if (withToken.length === 0) {
    return json({ success: true, sent: 0, noToken: noToken.length });
  }

  let tickets: Array<{ status: string; message?: string; details?: { error?: string } }> = [];
  try {
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify(withToken.map((r) => ({
        to: tokenOf.get(r.user_id),
        title: r.title,
        body: r.body,
        data: r.data ?? {},
        sound: "default",
        priority: "high",
      }))),
    });
    // Expo's `data` is an array of tickets, one per message, in order.
    tickets = (await expoResponse.json())?.data ?? [];
  } catch (err) {
    console.error("Expo push request failed:", err);
    await admin
      .from("notifications")
      .update({ push_sent_at: null, push_error: "EXPO_REQUEST_FAILED" })
      .in("id", withToken.map((r) => r.id));
    return json({ success: true, sent: 0, reason: "EXPO_REQUEST_FAILED" });
  }

  let sent = 0;
  for (const [i, row] of withToken.entries()) {
    const ticket = tickets[i];
    if (ticket?.status === "ok") {
      sent++;
      continue;
    }
    const errorCode = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR";
    await admin.from("notifications").update({ push_sent_at: null, push_error: String(errorCode) }).eq("id", row.id);
    if (ticket?.details?.error === "DeviceNotRegistered") {
      await admin.from("profiles").update({ push_token: null }).eq("id", row.user_id);
    }
  }

  return json({ success: true, sent, failed: withToken.length - sent, noToken: noToken.length });
});
