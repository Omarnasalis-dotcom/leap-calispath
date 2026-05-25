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

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get JWT from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: { tier: number; time_seconds: number; mode: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { tier, time_seconds, mode } = body;

  // Validate required fields
  if (tier === undefined || time_seconds === undefined || !mode) {
    return new Response(JSON.stringify({ error: "Missing required fields: tier, time_seconds, mode" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate tier range
  if (tier < 0 || tier > 9 || !Number.isInteger(tier)) {
    return new Response(JSON.stringify({ error: "Invalid tier" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate time is a positive number
  if (typeof time_seconds !== "number" || time_seconds <= 0) {
    return new Response(JSON.stringify({ error: "Invalid time" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit check — when was the last submission?
  const { data: lastSubmission } = await supabase
    .from("trial_history")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSubmission?.created_at) {
    const secondsSinceLast = (Date.now() - new Date(lastSubmission.created_at).getTime()) / 1000;
    if (secondsSinceLast < SUBMISSION_COOLDOWN_SECONDS) {
      return new Response(JSON.stringify({
        error: "TOO_FAST",
        message: `Please wait ${Math.ceil(SUBMISSION_COOLDOWN_SECONDS - secondsSinceLast)}s before submitting again.`,
      }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // All checks passed — save the result using admin client
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Insert into trial_history
  const { error: insertError } = await supabaseAdmin
    .from("trial_history")
    .insert({
      user_id: user.id,
      tier,
      time_seconds,
      mode,
      created_at: new Date().toISOString(),
    });

  if (insertError) {
    console.error("Insert error:", insertError);
    return new Response(JSON.stringify({ error: "Failed to save trial result" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Update profile PB if this is a progression trial and better than current
  if (mode === "progression") {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("strength_tier, best_times")
      .eq("id", user.id)
      .single();

    if (profile) {
      const bestTimes = profile.best_times || {};
      const currentBest = bestTimes[tier];

      // Update if no previous best or new time is better (lower)
      if (!currentBest || time_seconds < currentBest) {
        bestTimes[tier] = time_seconds;

        // Advance tier if completing current tier
        const newTier = tier === profile.strength_tier
          ? Math.min(tier + 1, 9)
          : profile.strength_tier;

        await supabaseAdmin
          .from("profiles")
          .update({
            best_times: bestTimes,
            strength_tier: Math.max(newTier, profile.strength_tier),
          })
          .eq("id", user.id);
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
