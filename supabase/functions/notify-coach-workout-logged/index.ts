import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MISSED_MARKER = "[STATUS:MISSED]";
// Covers both completed and missed logs — coaches want to know about a
// skipped session at least as much as a completed one, and splitting this
// into two preference types isn't worth the extra settings-UI surface yet.
const NOTIFICATION_TYPE = "client_workout_logged";
const DAY_COMPLETE_TYPE = "client_day_complete";
const WEEK_COMPLETE_TYPE = "client_week_complete";
// Self-only, sent to the athlete themselves, AI-Coach-owned programs only —
// there's no human coach to notify for these, but per the original request
// ("For AI Coach, he can see the user finished his first week... notify
// user go back to your coach") the athlete still gets nudged to reopen the
// AI Coach chat and build their next week. A real-coach-owned program does
// NOT get this — the coach builds the next week themselves, no nudge needed.
const WEEK_COMPLETE_NUDGE_TYPE = "week_complete_nudge";

// Same fixed system profile ids as ai-coach/index.ts (AI_COACH_SYSTEM_PROFILE_ID)
// and select_library_template's LEAP_SYSTEM_PROFILE_ID — neither is a real
// coach, so neither should ever receive a coach-style push.
const AI_COACH_SYSTEM_PROFILE_ID = "00000000-0000-0000-0000-000000000002";
const LEAP_SYSTEM_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

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

interface NotifyResult {
  recipient: string;
  notified: boolean;
  delivered?: boolean;
  reason?: string;
}

// Shared by every recipient loop below (the original per-log notification,
// day-complete, week-complete, and the athlete's own week-complete nudge) —
// prefs-check, insert, push, delivery-status writeback, all one shape.
// `dedupKey` is only meaningful for day/week-complete: those can otherwise
// re-fire every time an already-complete day/week is re-edited (e.g. a
// block's notes changed after every block that week was already logged) —
// checked against `data->>key` on existing rows of the same type/recipient
// so a genuinely new completion is the only thing that ever inserts one.
// `any`, matching this project's other edge functions (none generate/pin a
// Database type for their Supabase clients) — ReturnType<typeof
// createClient> collapses to an unusable `never`-schema generic once it
// crosses a function boundary like this, breaking every .update()/.eq()
// call's argument types below.
async function sendNotification(
  admin: any,
  recipientId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  dedupKey?: string
): Promise<NotifyResult> {
  if (dedupKey) {
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", recipientId)
      .eq("type", type)
      .eq("data->>key", dedupKey)
      .maybeSingle();
    if (existing) return { recipient: recipientId, notified: false, reason: "ALREADY_SENT" };
  }

  const { data: prefRow } = await admin
    .from("notification_preferences")
    .select("prefs")
    .eq("user_id", recipientId)
    .maybeSingle();

  const prefs = (prefRow?.prefs ?? {}) as Record<string, unknown>;
  if (prefs[type] === false) {
    return { recipient: recipientId, notified: false, reason: "OPTED_OUT" };
  }

  const { data: notification, error: insertError } = await admin
    .from("notifications")
    .insert({ user_id: recipientId, type, title, body, data })
    .select("id")
    .single();

  if (insertError || !notification) {
    console.error("notifications insert error:", insertError);
    return { recipient: recipientId, notified: false, reason: "INSERT_FAILED" };
  }

  const { data: recipientProfile } = await admin
    .from("profiles")
    .select("push_token")
    .eq("id", recipientId)
    .maybeSingle();

  const pushToken = (recipientProfile as { push_token?: string | null } | null)?.push_token;
  if (!pushToken) {
    await admin.from("notifications").update({ push_error: "NO_TOKEN" }).eq("id", notification.id);
    return { recipient: recipientId, notified: true, delivered: false, reason: "NO_TOKEN" };
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
      body: JSON.stringify([{ to: pushToken, title, body, data, sound: "default" }]),
    });
    expoResult = await expoResponse.json();
  } catch (err) {
    console.error("Expo push request failed:", err);
    await admin.from("notifications").update({ push_error: "EXPO_REQUEST_FAILED" }).eq("id", notification.id);
    return { recipient: recipientId, notified: true, delivered: false, reason: "EXPO_REQUEST_FAILED" };
  }

  const ticket = expoResult.data?.[0];
  if (!ticket || ticket.status !== "ok") {
    const errorCode = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR";
    await admin.from("notifications").update({ push_error: String(errorCode) }).eq("id", notification.id);
    if (ticket?.details?.error === "DeviceNotRegistered") {
      await admin.from("profiles").update({ push_token: null }).eq("id", recipientId);
    }
    return { recipient: recipientId, notified: true, delivered: false, reason: String(errorCode) };
  }

  await admin.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", notification.id);
  return { recipient: recipientId, notified: true, delivered: true };
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
    .select("id, warrior_id, warrior_program_id, block_id, notes, missed_reason, missed_detail")
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

  const coachId = program?.coach_id ?? null;
  const isRealCoach = !!coachId && coachId !== user.id && coachId !== AI_COACH_SYSTEM_PROFILE_ID && coachId !== LEAP_SYSTEM_PROFILE_ID;
  const isAiOwned = coachId === AI_COACH_SYSTEM_PROFILE_ID;

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const results: NotifyResult[] = [];

  // ---- 1. Original per-log notification (unchanged behavior) ----
  if (!coachId) {
    results.push({ recipient: "none", notified: false, reason: "NO_COACH" });
  } else if (coachId === user.id) {
    results.push({ recipient: coachId, notified: false, reason: "SELF_COACHED" });
  } else if (isRealCoach) {
    const { data: myProfile } = await asClient.rpc("get_my_profile").single();
    const displayName = (myProfile as { display_name?: string } | null)?.display_name || "Your client";

    const { data: assistantRows } = await admin
      .from("coach_assistants")
      .select("assistant_id")
      .eq("coach_id", coachId);
    const recipientIds = [coachId, ...((assistantRows ?? []) as Array<{ assistant_id: string }>).map(r => r.assistant_id)];

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

    for (const recipientId of recipientIds) {
      results.push(await sendNotification(admin, recipientId, NOTIFICATION_TYPE, title, body, notificationData));
    }
  }
  // isAiOwned / Leap-system-profile: no per-log coach notification — there's
  // no real coach to tell. Falls through to day/week detection below
  // regardless, since that also drives the AI-owned self-nudge.

  // ---- 2. Day/week completion detection ----
  // No server-side "day complete"/"week complete" concept exists anywhere
  // else in the schema — this mirrors the same grouping logic the client
  // already does itself (src/lib/trainingCenter.ts's computeWeekStats,
  // MilestoneLaneScreen.tsx's weekComplete): a day/week counts as complete
  // once every one of its real (non-empty) blocks has ANY workout_logs row,
  // completed or missed. Uses `asClient` throughout — the athlete's own
  // RLS-scoped read access to their own program/blocks/logs, nothing here
  // needs service-role.
  let isDayComplete = false;
  let isWeekComplete = false;
  let weekNumber: number | null = null;
  let dayLabel = "";

  const { data: blockRow } = await asClient
    .from("program_blocks")
    .select("id, name, week_number, template_id")
    .eq("id", log.block_id)
    .maybeSingle();

  if (blockRow?.template_id && blockRow.week_number != null) {
    weekNumber = blockRow.week_number;
    dayLabel = (blockRow.name ?? "").split("|")[0].trim();

    const { data: weekBlocks } = await asClient
      .from("program_blocks")
      .select("id, name")
      .eq("template_id", blockRow.template_id)
      .eq("week_number", blockRow.week_number);

    const allWeekBlockIds = (weekBlocks ?? []).map((b: { id: string }) => b.id);
    const dayBlockIds = (weekBlocks ?? [])
      .filter((b: { name: string | null }) => (b.name ?? "").split("|")[0].trim() === dayLabel)
      .map((b: { id: string }) => b.id);

    // Blocks with zero exercises are rest-day/empty placeholders — nobody
    // ever logs one, so they must be excluded or a day/week containing one
    // could never register as complete.
    const { data: exerciseRows } = await asClient
      .from("block_exercises")
      .select("block_id")
      .in("block_id", allWeekBlockIds.length ? allWeekBlockIds : ["00000000-0000-0000-0000-000000000000"]);
    const blocksWithExercises = new Set((exerciseRows ?? []).map((r: { block_id: string }) => r.block_id));

    const realDayBlockIds = dayBlockIds.filter((id: string) => blocksWithExercises.has(id));
    const realWeekBlockIds = allWeekBlockIds.filter((id: string) => blocksWithExercises.has(id));

    const { data: loggedRows } = await asClient
      .from("workout_logs")
      .select("block_id")
      .eq("warrior_program_id", log.warrior_program_id)
      .in("block_id", realWeekBlockIds.length ? realWeekBlockIds : ["00000000-0000-0000-0000-000000000000"]);
    const loggedBlockIds = new Set((loggedRows ?? []).map((r: { block_id: string }) => r.block_id));

    isDayComplete = realDayBlockIds.length > 0 && realDayBlockIds.every((id: string) => loggedBlockIds.has(id));
    isWeekComplete = realWeekBlockIds.length > 0 && realWeekBlockIds.every((id: string) => loggedBlockIds.has(id));
  }

  // ---- 3. Coach-facing day/week-complete notifications (real coach only) ----
  if (isRealCoach && (isDayComplete || isWeekComplete)) {
    const { data: myProfile } = await asClient.rpc("get_my_profile").single();
    const displayName = (myProfile as { display_name?: string } | null)?.display_name || "Your client";
    const { data: assistantRows } = await admin
      .from("coach_assistants")
      .select("assistant_id")
      .eq("coach_id", coachId as string);
    const recipientIds = [coachId as string, ...((assistantRows ?? []) as Array<{ assistant_id: string }>).map(r => r.assistant_id)];
    const notificationData = { screen: "progress-tracking", warriorId: user.id };

    if (isDayComplete) {
      const dedupKey = `${log.warrior_program_id}:w${weekNumber}:${dayLabel}`;
      const title = "Day Complete";
      const body = `${displayName} finished ${dayLabel || "a training day"}${weekNumber ? ` (Week ${weekNumber})` : ""}.`;
      for (const recipientId of recipientIds) {
        results.push(await sendNotification(admin, recipientId, DAY_COMPLETE_TYPE, title, body, { ...notificationData, key: dedupKey }, dedupKey));
      }
    }
    if (isWeekComplete) {
      const dedupKey = `${log.warrior_program_id}:w${weekNumber}`;
      const title = "Week Complete";
      const body = `${displayName} finished Week ${weekNumber}! 🎉`;
      for (const recipientId of recipientIds) {
        results.push(await sendNotification(admin, recipientId, WEEK_COMPLETE_TYPE, title, body, { ...notificationData, key: dedupKey }, dedupKey));
      }
    }
  }

  // ---- 4. Athlete's own "go back to your coach" nudge (AI-owned only) ----
  if (isAiOwned && isWeekComplete) {
    const dedupKey = `${log.warrior_program_id}:w${weekNumber}`;
    results.push(await sendNotification(
      admin,
      user.id,
      WEEK_COMPLETE_NUDGE_TYPE,
      "Week Complete!",
      `You finished Week ${weekNumber} — open your AI Coach to build Week ${(weekNumber ?? 0) + 1}.`,
      { screen: "coach", key: dedupKey },
      dedupKey
    ));
  }

  return json({ success: true, results });
});
