import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MISSED_MARKER = "[STATUS:MISSED]";
// Covers both completed and missed logs — coaches want to know about a
// skipped session at least as much as a completed one, and splitting this
// into two preference types isn't worth the extra settings-UI surface yet.
const NOTIFICATION_TYPE = "client_workout_logged";

// Mirrors MISSED_LABELS in src/screens/coaching/ProgressTrackingScreen.tsx —
// keep in sync if that map changes.
const MISSED_REASON_LABELS: Record<string, string> = {
  no_time: "no time",
  too_tired: "too tired",
  injury: "injury",
  other: "other reason",
};

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

// Same robust resolution as delete-user-account/index.ts — this project's
// service role key isn't always exposed as SUPABASE_SERVICE_ROLE_KEY directly.
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

  let requestBody: { workout_log_id?: string };
  try {
    requestBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const workoutLogId = requestBody.workout_log_id;
  if (!workoutLogId) {
    return json({ error: "Missing required field: workout_log_id" }, 400);
  }

  // Authenticated as the calling client — proves ownership of the log via
  // RLS ("Warriors manage own logs": warrior_id = auth.uid()) rather than a
  // manual check. Everything past this point that touches the coach's row
  // needs service_role, since the coach isn't the caller.
  const asClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await asClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: log, error: logError } = await asClient
    .from("workout_logs")
    .select("id, warrior_id, warrior_program_id, notes, missed_reason, missed_detail")
    .eq("id", workoutLogId)
    .maybeSingle();

  if (logError) {
    console.error("workout_logs fetch error:", logError);
    return json({ error: "Failed to load workout log" }, 500);
  }
  if (!log || log.warrior_id !== user.id) {
    return json({ error: "Workout log not found" }, 404);
  }

  const isMissed = log.notes === MISSED_MARKER;

  const { data: program, error: programError } = await asClient
    .from("warrior_programs")
    .select("coach_id")
    .eq("id", log.warrior_program_id)
    .maybeSingle();

  if (programError) {
    console.error("warrior_programs fetch error:", programError);
    return json({ error: "Failed to load program" }, 500);
  }

  const coachId = program?.coach_id;
  if (!coachId) {
    return json({ success: true, notified: false, reason: "NO_COACH" });
  }
  if (coachId === user.id) {
    // A coach logging a block on their own test/demo program — nothing to notify.
    return json({ success: true, notified: false, reason: "SELF_COACHED" });
  }

  const { data: myProfile } = await asClient.rpc("get_my_profile").single();
  const displayName = (myProfile as { display_name?: string } | null)?.display_name || "Your client";

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  // Fan out to the coach and every assistant managing their roster — this
  // used to only ever notify the literal coach_id, leaving assistant
  // coaches with zero visibility into the same clients they manage.
  const { data: assistantRows } = await admin
    .from("coach_assistants")
    .select("assistant_id")
    .eq("coach_id", coachId);
  const recipientIds = [coachId, ...((assistantRows ?? []) as Array<{ assistant_id: string }>).map(r => r.assistant_id)];

  // Deep-links straight to this client's history in ProgressTrackingScreen
  // (see app/progress-tracking.tsx + the warriorId auto-open effect) rather
  // than just the roster — the coach should land on the logged block itself.
  const notificationData = { screen: "progress-tracking", warriorId: user.id };

  const title = isMissed ? "Workout Missed" : "Workout Logged";
  let body: string;
  if (isMissed) {
    const reasonLabel = log.missed_reason ? MISSED_REASON_LABELS[log.missed_reason] ?? log.missed_reason : null;
    body = `${displayName} marked a workout as missed${reasonLabel ? ` (${reasonLabel})` : ""}.`;
    if (log.missed_detail) body += ` "${log.missed_detail}"`;
  } else {
    body = `${displayName} just logged a workout.`;
  }

  const results: Array<{ recipient: string; notified: boolean; delivered?: boolean; reason?: string }> = [];

  for (const recipientId of recipientIds) {
    // Respect each recipient's own opt-out, same lazy-default-enabled
    // semantics as create_notification (no row / no key for this type =
    // enabled).
    const { data: prefRow } = await admin
      .from("notification_preferences")
      .select("prefs")
      .eq("user_id", recipientId)
      .maybeSingle();

    const prefs = (prefRow?.prefs ?? {}) as Record<string, unknown>;
    if (prefs[NOTIFICATION_TYPE] === false) {
      results.push({ recipient: recipientId, notified: false, reason: "OPTED_OUT" });
      continue;
    }

    const { data: notification, error: insertError } = await admin
      .from("notifications")
      .insert({
        user_id: recipientId,
        type: NOTIFICATION_TYPE,
        title,
        body,
        data: notificationData,
      })
      .select("id")
      .single();

    if (insertError || !notification) {
      console.error("notifications insert error:", insertError);
      results.push({ recipient: recipientId, notified: false, reason: "INSERT_FAILED" });
      continue;
    }

    const { data: recipientProfile } = await admin
      .from("profiles")
      .select("push_token")
      .eq("id", recipientId)
      .maybeSingle();

    const pushToken = (recipientProfile as { push_token?: string | null } | null)?.push_token;
    if (!pushToken) {
      await admin.from("notifications").update({ push_error: "NO_TOKEN" }).eq("id", notification.id);
      results.push({ recipient: recipientId, notified: true, delivered: false, reason: "NO_TOKEN" });
      continue;
    }

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
          title,
          body,
          data: notificationData,
          sound: "default",
        }]),
      });
      expoResult = await expoResponse.json();
    } catch (err) {
      console.error("Expo push request failed:", err);
      await admin.from("notifications").update({ push_error: "EXPO_REQUEST_FAILED" }).eq("id", notification.id);
      results.push({ recipient: recipientId, notified: true, delivered: false, reason: "EXPO_REQUEST_FAILED" });
      continue;
    }

    const ticket = expoResult.data?.[0];
    if (!ticket || ticket.status !== "ok") {
      const errorCode = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR";
      await admin.from("notifications").update({ push_error: String(errorCode) }).eq("id", notification.id);

      if (ticket?.details?.error === "DeviceNotRegistered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", recipientId);
      }

      results.push({ recipient: recipientId, notified: true, delivered: false, reason: String(errorCode) });
      continue;
    }

    await admin.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", notification.id);
    results.push({ recipient: recipientId, notified: true, delivered: true });
  }

  return json({ success: true, results });
});
