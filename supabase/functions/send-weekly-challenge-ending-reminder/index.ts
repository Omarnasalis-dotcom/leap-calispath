import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;
const NOTIFICATION_TYPE = "weekly_challenge_ending";

// Not user-triggered — invoked on a timer by a pg_cron job (see
// 20260805130000_schedule_reminder_crons.sql), authenticated by a shared
// secret rather than a user JWT (see supabase/config.toml).
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

// Bulk-inserts one notification per target, then batch-delivers via Expo in
// chunks of 100, updating each row's push_sent_at/push_error and clearing
// any DeviceNotRegistered token. Returns delivery counts.
async function notifyUsers(
  admin: SupabaseClient,
  targets: Array<{ user_id: string; display_name: string | null }>,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<{ notified: number; sent: number; failed: number }> {
  if (targets.length === 0) return { notified: 0, sent: 0, failed: 0 };

  const rows = targets.map((t) => ({ user_id: t.user_id, type, title, body, data }));
  const { data: inserted, error: insertError } = await admin
    .from("notifications")
    .insert(rows)
    .select("id, user_id");

  if (insertError || !inserted) {
    console.error("notifications insert error:", insertError);
    return { notified: 0, sent: 0, failed: 0 };
  }

  const userIds = inserted.map((n) => n.user_id);
  const { data: profiles } = await admin.from("profiles").select("id, push_token").in("id", userIds);
  const tokenByUser = new Map((profiles ?? []).map((p: { id: string; push_token: string | null }) => [p.id, p.push_token]));

  const noTokenIds = inserted.filter((n) => !tokenByUser.get(n.user_id)).map((n) => n.id);
  if (noTokenIds.length > 0) {
    await admin.from("notifications").update({ push_error: "NO_TOKEN" }).in("id", noTokenIds);
  }

  const deliverable = inserted
    .map((n) => ({ id: n.id, userId: n.user_id, token: tokenByUser.get(n.user_id) }))
    .filter((d): d is typeof d & { token: string } => !!d.token);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < deliverable.length; i += EXPO_BATCH_SIZE) {
    const chunk = deliverable.slice(i, i + EXPO_BATCH_SIZE);
    const messages = chunk.map((d) => ({ to: d.token, title, body, data, sound: "default" }));

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

  return { notified: inserted.length, sent, failed };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const { data: pending, error: pendingError } = await admin.rpc("get_pending_weekly_challenge_ending_reminders");
  if (pendingError) {
    console.error("get_pending_weekly_challenge_ending_reminders error:", pendingError);
    return json({ error: "Failed to query pending challenges" }, 500);
  }
  if (!pending || pending.length === 0) {
    return json({ success: true, challenges_processed: 0 });
  }

  // Safety net: there are only 3 tier groups, so at most 3 challenges should
  // ever be pending at once in normal operation. A number far beyond that
  // means the "pending" query has regressed to matching a historical
  // backlog again (exactly what happened on 2026-08-05 — 30 stale
  // challenges were mass-reminded to 160 real users in one run) — abort
  // rather than mass-send on a query result that looks wrong.
  const MAX_SANE_PENDING_CHALLENGES = 5;
  if (pending.length > MAX_SANE_PENDING_CHALLENGES) {
    console.error(`Aborting: ${pending.length} pending challenges exceeds sane cap of ${MAX_SANE_PENDING_CHALLENGES} — refusing to mass-send.`);
    return json({ error: "SANITY_CAP_EXCEEDED", pending_count: pending.length }, 500);
  }

  const results = [];
  for (const challenge of pending as Array<{ challenge_id: string; title: string; group_id: number }>) {
    const { data: targets, error: targetsError } = await admin.rpc("get_weekly_challenge_users_without_entry", {
      p_challenge_id: challenge.challenge_id,
      p_group_id: challenge.group_id,
      p_preference_key: NOTIFICATION_TYPE,
    });
    if (targetsError) {
      console.error("get_weekly_challenge_users_without_entry error:", targetsError);
      continue;
    }

    const outcome = await notifyUsers(
      admin,
      targets ?? [],
      NOTIFICATION_TYPE,
      "Last Chance This Week!",
      `You haven't completed "${challenge.title}" yet — the week ends soon.`,
      { screen: "weekly-challenge" }
    );

    await admin.from("weekly_challenges").update({ ending_reminder_sent_at: new Date().toISOString() }).eq("id", challenge.challenge_id);

    results.push({ challenge_id: challenge.challenge_id, ...outcome });
  }

  return json({ success: true, challenges_processed: results.length, results });
});
