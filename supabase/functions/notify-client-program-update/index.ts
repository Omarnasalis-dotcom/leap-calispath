import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NOTIFICATION_TYPE = "client_program_update";

type UpdateType = "program_assigned" | "week_unlocked";
const VALID_UPDATE_TYPES: ReadonlySet<string> = new Set(["program_assigned", "week_unlocked"]);

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

// Same robust resolution as delete-user-account/index.ts and
// notify-coach-workout-logged/index.ts.
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

  let requestBody: { warrior_program_id?: string; update_type?: string };
  try {
    requestBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const warriorProgramId = requestBody.warrior_program_id;
  const updateType = requestBody.update_type;
  if (!warriorProgramId || !updateType || !VALID_UPDATE_TYPES.has(updateType)) {
    return json({ error: "Missing or invalid required fields: warrior_program_id, update_type" }, 400);
  }

  // Authenticated as the calling coach. RLS on warrior_programs ("Users can
  // view warrior programs": coach_id = auth.uid() OR warrior_id = auth.uid())
  // scopes this to rows the caller can see at all; the explicit coach_id
  // check below then rejects the case where the caller is the *client* on
  // this row rather than the coach — RLS alone can't tell those apart.
  const asClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await asClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: program, error: programError } = await asClient
    .from("warrior_programs")
    .select("id, warrior_id, coach_id, template_id, current_week")
    .eq("id", warriorProgramId)
    .maybeSingle();

  if (programError) {
    console.error("warrior_programs fetch error:", programError);
    return json({ error: "Failed to load program" }, 500);
  }
  if (!program) {
    return json({ error: "Program not found" }, 404);
  }
  if (program.coach_id !== user.id) {
    return json({ error: "Forbidden" }, 403);
  }

  const clientId = program.warrior_id;

  const { data: template } = await asClient
    .from("program_templates")
    .select("name")
    .eq("id", program.template_id)
    .maybeSingle();
  const templateName = (template as { name?: string } | null)?.name || "your program";

  const { data: coachProfile } = await asClient.rpc("get_my_profile").single();
  const coachName = (coachProfile as { display_name?: string } | null)?.display_name || "Your coach";

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  // Respect the client's own opt-out, same lazy-default-enabled semantics as
  // create_notification.
  const { data: prefRow } = await admin
    .from("notification_preferences")
    .select("prefs")
    .eq("user_id", clientId)
    .maybeSingle();

  const prefs = (prefRow?.prefs ?? {}) as Record<string, unknown>;
  if (prefs[NOTIFICATION_TYPE] === false) {
    return json({ success: true, notified: false, reason: "OPTED_OUT" });
  }

  // WarriorProgramScreen always loads the caller's own active program from
  // warriorId alone (app/warrior-program.tsx passes warriorId={user.id} and
  // nothing else) — no extra params needed for this deep link.
  const notificationData = { screen: "warrior-program" };

  const title = updateType === ("program_assigned" as UpdateType) ? "New Program Assigned!" : "New Week Unlocked!";
  const body = updateType === ("program_assigned" as UpdateType)
    ? `${coachName} assigned you a new program: "${templateName}".`
    : `Week ${program.current_week} of "${templateName}" is now available.`;

  const { data: notification, error: insertError } = await admin
    .from("notifications")
    .insert({
      user_id: clientId,
      type: NOTIFICATION_TYPE,
      title,
      body,
      data: notificationData,
    })
    .select("id")
    .single();

  if (insertError || !notification) {
    console.error("notifications insert error:", insertError);
    return json({ error: "Failed to record notification" }, 500);
  }

  const { data: clientProfile } = await admin
    .from("profiles")
    .select("push_token")
    .eq("id", clientId)
    .maybeSingle();

  const pushToken = (clientProfile as { push_token?: string | null } | null)?.push_token;
  if (!pushToken) {
    await admin.from("notifications").update({ push_error: "NO_TOKEN" }).eq("id", notification.id);
    return json({ success: true, notified: true, delivered: false, reason: "NO_TOKEN" });
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
    return json({ success: true, notified: true, delivered: false, reason: "EXPO_REQUEST_FAILED" });
  }

  const ticket = expoResult.data?.[0];
  if (!ticket || ticket.status !== "ok") {
    const errorCode = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR";
    await admin.from("notifications").update({ push_error: String(errorCode) }).eq("id", notification.id);

    if (ticket?.details?.error === "DeviceNotRegistered") {
      await admin.from("profiles").update({ push_token: null }).eq("id", clientId);
    }

    return json({ success: true, notified: true, delivered: false, reason: errorCode });
  }

  await admin.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", notification.id);

  return json({ success: true, notified: true, delivered: true });
});
