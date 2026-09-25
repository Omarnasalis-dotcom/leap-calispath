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

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
