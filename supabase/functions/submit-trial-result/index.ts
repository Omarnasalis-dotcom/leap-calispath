import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Minimum time floors per tier (seconds) — must match src/constants/Progression.ts
const TIER_HARD_FLOORS: Record<number, number> = {
  0: 25,
  1: 90,
  2: 150,
  3: 180,
  4: 200,
  5: 220,
  6: 250,
  7: 360,
  8: 480,
  9: 600,
};

// Minimum seconds between any two trial submissions from the same user
const SUBMISSION_COOLDOWN_SECONDS = 30;

// Known Postgres SQLSTATE codes that can surface from the submit_trial_result RPC,
// mapped to a clearer client-facing message and the appropriate HTTP status.
const PG_ERROR_RESPONSES: Record<string, { status: number; message: string }> = {
  "57014": { status: 503, message: "The request timed out. Please try again." },
  "40001": { status: 409, message: "Submission conflicted with another request. Please try again." },
  "40P01": { status: 409, message: "Submission conflicted with another request. Please try again." },
  "23505": { status: 409, message: "This trial was already recorded." },
  "23503": { status: 400, message: "Invalid submission — referenced profile not found." },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get JWT from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: { tier: number; time_seconds: number; mode: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { tier, time_seconds, mode } = body;

  // Validate required fields
  if (tier === undefined || time_seconds === undefined) {
    return new Response(JSON.stringify({ error: "Missing required fields: tier, time_seconds" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate tier range
  if (tier < 0 || tier > 9 || !Number.isInteger(tier)) {
    return new Response(JSON.stringify({ error: "Invalid tier" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate time is a positive number
  if (typeof time_seconds !== "number" || time_seconds <= 0) {
    return new Response(JSON.stringify({ error: "Invalid time" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check hard floor — is this time physically possible?
  const floor = TIER_HARD_FLOORS[tier] ?? 25;
  if (time_seconds < floor) {
    return new Response(JSON.stringify({
      error: "DISHONOR",
      message: `Time ${time_seconds}s is below the minimum for Tier ${tier} (${floor}s). Submission rejected.`,
    }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create authenticated Supabase client
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit check — when was the last submission?
  const { data: lastSubmission } = await supabase
    .from("trial_history")
    .select("attempted_at")
    .eq("user_id", user.id)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSubmission?.attempted_at) {
    const secondsSinceLast = (Date.now() - new Date(lastSubmission.attempted_at).getTime()) / 1000;
    if (secondsSinceLast < SUBMISSION_COOLDOWN_SECONDS) {
      return new Response(JSON.stringify({
        error: "TOO_FAST",
        message: `Please wait ${Math.ceil(SUBMISSION_COOLDOWN_SECONDS - secondsSinceLast)}s before submitting again.`,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // All checks passed — save the result. submit_trial_result derives the user
  // from auth.uid() internally (not a client-supplied id), so this must run
  // as the caller's own authenticated session, not an admin/service-role
  // client. The insert + profile update happen atomically inside the DB
  // function so a failure partway through can't leave the two out of sync.
  const { data: result, error: rpcError } = await supabase.rpc("submit_trial_result", {
    p_tier: tier,
    p_time_seconds: time_seconds,
    p_mode: mode,
  });

  if (rpcError) {
    console.error("submit_trial_result error:", rpcError);
    const known = PG_ERROR_RESPONSES[rpcError.code ?? ""];
    return new Response(JSON.stringify({
      error: known ? rpcError.code : "Failed to save trial result",
      message: known?.message ?? "Failed to save trial result. Please try again.",
    }), {
      status: known?.status ?? 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!result?.success) {
    if (result?.error === "FORBIDDEN") {
      return new Response(JSON.stringify({ error: "FORBIDDEN", message: "This tier is currently locked." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (result?.error === "NOT_FOUND") {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Failed to save trial result" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
