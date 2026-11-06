import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sends the pushes for the Leap team program review. The rows themselves are
// written by the SQL functions, in the reader's language and respecting their
// opt-out; this only delivers ones not sent yet, so a repeat call does nothing.
//
//  - The athlete, after asking: reaches admins.
//  - An admin, after closing: reaches that athlete.
//  - The hourly cron: reaches admins, once per review, 36 hours in.
//
// A failed push never affects the review. Only admins or the one athlete are
// ever targeted, so this can't fan out (see the 2026-08-05 incident).

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const OVERDUE_AFTER_MS = 36 * 60 * 60 * 1000;

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
  // New secret key (sb_secret_…) first; the legacy JWT key is only a
  // fallback until legacy API keys are disabled (C1 key rotation).
  const rawSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (rawSecretKeys) {
    try {
      const parsed = JSON.parse(rawSecretKeys);
      const key = parsed[Object.keys(parsed)[0]];
      if (key) return key;
    } catch {
      // fall through to the legacy key
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

// Publishable key (sb_publishable_…) first; the legacy anon JWT is only a
// fallback until legacy API keys are disabled (C1 key rotation).
function resolvePublishableKey(): string {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = parsed[Object.keys(parsed)[0]];
      if (key) return key;
    } catch {
      // fall through to the legacy key
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

async function deliver(admin: SupabaseClient, type: string, reviewId: string): Promise<number> {
  const { data: rows } = await admin
    .from("notifications")
    .select("id, user_id, title, body, data")
    .eq("type", type)
    .eq("data->>review_id", reviewId)
    .is("push_sent_at", null)
    .is("push_error", null);

  let sent = 0;
  for (const row of rows ?? []) {
    const { data: profile } = await admin.from("profiles").select("push_token").eq("id", row.user_id).maybeSingle();
    const token = (profile as { push_token?: string | null } | null)?.push_token;
    if (!token) {
      await admin.from("notifications").update({ push_error: "NO_TOKEN" }).eq("id", row.id);
      continue;
    }
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify([{ to: token, title: row.title, body: row.body, data: row.data, sound: "default" }]),
      });
      const result = await response.json() as { data?: Array<{ status: string; message?: string; details?: { error?: string } }> };
      const ticket = result.data?.[0];
      if (ticket?.status === "ok") {
        await admin.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", row.id);
        sent += 1;
      } else {
        await admin.from("notifications").update({ push_error: String(ticket?.details?.error ?? ticket?.message ?? "UNKNOWN_ERROR") }).eq("id", row.id);
        if (ticket?.details?.error === "DeviceNotRegistered") {
          await admin.from("profiles").update({ push_token: null }).eq("id", row.user_id);
        }
      }
    } catch (err) {
      console.error("Expo push request failed:", err);
      await admin.from("notifications").update({ push_error: "EXPO_REQUEST_FAILED" }).eq("id", row.id);
    }
  }
  return sent;
}

async function alertOverdue(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - OVERDUE_AFTER_MS).toISOString();
  const { data: reviews } = await admin
    .from("program_reviews")
    .select("id, week_number")
    .eq("status", "open")
    .is("overdue_alerted_at", null)
    .lte("requested_at", cutoff);
  if (!reviews?.length) return 0;

  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  let sent = 0;
  for (const review of reviews) {
    // Marked first: a failed send must not repeat every hour.
    await admin.from("program_reviews").update({ overdue_alerted_at: new Date().toISOString() }).eq("id", review.id);
    await admin.from("notifications").insert((admins ?? []).map((a: { id: string }) => ({
      user_id: a.id,
      type: "program_review_overdue",
      title: "Program review due soon",
      body: `A review of week ${review.week_number} has been waiting 36 hours.`,
      data: { review_id: review.id },
    })));
    sent += await deliver(admin, "program_review_overdue", review.id);
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    console.error("Missing service role credentials");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    if (secret !== Deno.env.get("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
    return json({ success: true, sent: await alertOverdue(admin) });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const asCaller = createClient(Deno.env.get("SUPABASE_URL") ?? "", resolvePublishableKey(), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await asCaller.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let reviewId: string | undefined;
  try {
    reviewId = (await req.json()).review_id;
  } catch {
    // handled below
  }
  if (!reviewId) {
    return json({ error: "review_id is required" }, 400);
  }

  const { data: review } = await admin.from("program_reviews").select("id, user_id, status").eq("id", reviewId).maybeSingle();
  if (!review) {
    return json({ error: "Not found" }, 404);
  }

  if (review.status === "open" && review.user_id === user.id) {
    return json({ success: true, sent: await deliver(admin, "program_review_request", reviewId) });
  }
  const { data: isAdmin } = await asCaller.rpc("is_admin");
  if (review.status === "closed" && isAdmin) {
    return json({ success: true, sent: await deliver(admin, "program_review_ready", reviewId) });
  }
  return json({ error: "Forbidden" }, 403);
});
