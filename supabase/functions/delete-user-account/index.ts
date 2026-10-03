import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const REASONS = ["not_using", "too_expensive", "missing_features", "privacy", "other"];
const PLATFORMS = ["ios", "android", "web"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Get the JWT from the request header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Create a regular client to verify the JWT and get the user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      resolvePublishableKey(),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Create admin client to delete the user. New secret key (sb_secret_…)
    // first; the legacy JWT key is only a fallback until legacy API keys are
    // disabled (C1 key rotation). Never log either value.
    let serviceRoleKey = "";
    const rawSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (rawSecretKeys) {
      try {
        const secretKeys = JSON.parse(rawSecretKeys);
        serviceRoleKey = secretKeys[Object.keys(secretKeys)[0]] ?? "";
      } catch {
        // Fallback handled below
      }
    }
    if (!serviceRoleKey) {
      serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    }

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing service role credentials" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // Optional body from the app: { reason, note, platform }. Older app
    // versions send no body.
    let body: { reason?: unknown; note?: unknown; platform?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      // no / invalid body
    }
    const reason = typeof body.reason === "string" && REASONS.includes(body.reason) ? body.reason : null;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    const platform = typeof body.platform === "string" && PLATFORMS.includes(body.platform) ? body.platform : null;

    // Anonymous facts about the account, read before it's deleted
    // (deleted_accounts history). Never blocks the deletion.
    const { data: snapshot, error: snapshotError } = await supabaseAdmin.rpc(
      "account_deletion_snapshot",
      { p_user_id: user.id },
    );
    if (snapshotError) console.error("[delete-user-account] snapshot failed:", snapshotError.message);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Recorded only once the delete succeeded. No user id, email or name.
    const { error: recordError } = await supabaseAdmin.from("deleted_accounts").insert({
      ...(snapshot ?? {}),
      platform,
      reason,
      reason_note: note,
    });
    if (recordError) console.error("[delete-user-account] history insert failed:", recordError.message);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
