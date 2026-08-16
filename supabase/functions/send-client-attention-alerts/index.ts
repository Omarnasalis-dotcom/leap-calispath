import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;
const NOTIFICATION_TYPE = "client_needs_attention";

// Not user-triggered — invoked on a timer by a pg_cron job (see
// 20260815140000_schedule_client_attention_cron.sql), authenticated by a
// shared secret rather than a user JWT, same pattern as
// send-daily-workout-reminders (see supabase/config.toml).
function isAuthorized(req: Request): boolean {
  const secret = req.headers.get("x-cron-secret");
  return !!secret && secret === Deno.env.get("CRON_SECRET");
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

type ExpoTicket = { status: string; message?: string; details?: { error?: string } };
type Target = { warrior_program_id: string; warrior_id: string; client_name: string; coach_id: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const { data: targets, error: targetsError } = await admin.rpc("get_clients_needing_attention");
  if (targetsError) {
    console.error("get_clients_needing_attention error:", targetsError);
    return json({ error: "Failed to query targets" }, 500);
  }
  if (!targets || targets.length === 0) {
    return json({ success: true, targeted: 0, recipients: 0, sent: 0, failed: 0 });
  }

  // Fan out each flagged client to their coach and every active assistant —
  // same shape as notify-coach-workout-logged's fan-out fix. One
  // coach_assistants lookup per distinct coach, not per client.
  const coachIds = [...new Set((targets as Target[]).map((t) => t.coach_id))];
  const { data: assistantRows } = await admin
    .from("coach_assistants")
    .select("coach_id, assistant_id")
    .in("coach_id", coachIds);
  const assistantsByCoach = new Map<string, string[]>();
  for (const row of (assistantRows ?? []) as Array<{ coach_id: string; assistant_id: string }>) {
    const list = assistantsByCoach.get(row.coach_id) ?? [];
    list.push(row.assistant_id);
    assistantsByCoach.set(row.coach_id, list);
  }

  type Row = { user_id: string; type: string; title: string; body: string; data: Record<string, unknown> };
  const rows: Row[] = [];
  for (const t of targets as Target[]) {
    const recipients = [t.coach_id, ...(assistantsByCoach.get(t.coach_id) ?? [])];
    const data = { screen: "progress-tracking", warriorId: t.warrior_id, client_id: t.warrior_id };
    const title = "Client Needs Attention";
    const body = `${t.client_name} hasn't logged any exercise since being assigned their program.`;
    for (const recipientId of recipients) {
      rows.push({ user_id: recipientId, type: NOTIFICATION_TYPE, title, body, data });
    }
  }

  // Respect each recipient's own opt-out before inserting anything for them.
  const recipientIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: prefRows } = await admin
    .from("notification_preferences")
    .select("user_id, prefs")
    .in("user_id", recipientIds);
  const optedOut = new Set(
    ((prefRows ?? []) as Array<{ user_id: string; prefs: Record<string, unknown> }>)
      .filter((p) => p.prefs?.[NOTIFICATION_TYPE] === false)
      .map((p) => p.user_id),
  );
  const insertRows = rows.filter((r) => !optedOut.has(r.user_id));

  if (insertRows.length === 0) {
    return json({ success: true, targeted: (targets as Target[]).length, recipients: 0, sent: 0, failed: 0 });
  }

  const { data: inserted, error: insertError } = await admin
    .from("notifications")
    .insert(insertRows)
    .select("id, user_id, title, body, data");

  if (insertError || !inserted) {
    console.error("notifications insert error:", insertError);
    return json({ error: "Failed to record notifications" }, 500);
  }

  const userIds = [...new Set(inserted.map((n) => n.user_id))];
  const { data: profiles } = await admin.from("profiles").select("id, push_token").in("id", userIds);
  const tokenByUser = new Map((profiles ?? []).map((p: { id: string; push_token: string | null }) => [p.id, p.push_token]));

  const noTokenIds = inserted.filter((n) => !tokenByUser.get(n.user_id)).map((n) => n.id);
  if (noTokenIds.length > 0) {
    await admin.from("notifications").update({ push_error: "NO_TOKEN" }).in("id", noTokenIds);
  }

  const deliverable = inserted
    .map((n) => ({ id: n.id, userId: n.user_id, title: n.title, body: n.body, data: n.data, token: tokenByUser.get(n.user_id) }))
    .filter((d): d is typeof d & { token: string } => !!d.token);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < deliverable.length; i += EXPO_BATCH_SIZE) {
    const chunk = deliverable.slice(i, i + EXPO_BATCH_SIZE);
    const messages = chunk.map((d) => ({ to: d.token, title: d.title, body: d.body, data: d.data, sound: "default" }));

    let tickets: ExpoTicket[] = [];
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
        body: JSON.stringify(messages),
      });
      const result = await resp.json();
      tickets = result.data ?? [];
    } catch (err) {
      console.error("Expo batch request failed:", err);
      await admin.from("notifications").update({ push_error: "EXPO_REQUEST_FAILED" }).in("id", chunk.map((d) => d.id));
      failed += chunk.length;
      continue;
    }

    const sentIds: string[] = [];
    const deadTokenUserIds: string[] = [];

    for (let idx = 0; idx < chunk.length; idx++) {
      const d = chunk[idx];
      const ticket = tickets[idx];
      if (ticket?.status === "ok") {
        sentIds.push(d.id);
        sent++;
      } else {
        const errorCode = ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR";
        await admin.from("notifications").update({ push_error: String(errorCode) }).eq("id", d.id);
        failed++;
        if (ticket?.details?.error === "DeviceNotRegistered") {
          deadTokenUserIds.push(d.userId);
        }
      }
    }

    if (sentIds.length > 0) {
      await admin.from("notifications").update({ push_sent_at: new Date().toISOString() }).in("id", sentIds);
    }
    if (deadTokenUserIds.length > 0) {
      await admin.from("profiles").update({ push_token: null }).in("id", deadTokenUserIds);
    }
  }

  return json({
    success: true,
    targeted: (targets as Target[]).length,
    recipients: insertRows.length,
    sent,
    failed,
    no_token: noTokenIds.length,
  });
});
