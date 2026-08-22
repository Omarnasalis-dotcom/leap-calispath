import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { TOOLS_BY_NAME, ANTHROPIC_TOOLS } from "./tools/index.ts";

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

// Every RPC these tools call trusts auth.uid() internally (SECURITY
// DEFINER, "trust only auth.uid()" throughout this feature's design) — so
// every tool call and profile read in this function goes through a client
// authenticated AS THE CALLING USER (their own JWT forwarded from the
// request), never a service-role bypass. This function never touches
// SUPABASE_SERVICE_ROLE_KEY at all.
const MAX_TOOL_TURNS = 8;
const ANTHROPIC_MODEL = "claude-sonnet-5";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let body: { messages?: Array<{ role: string; content: unknown }>; platform?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "Missing messages array" }, 400);
  }

  // Pro gate — re-derives canAccessPro() (src/lib/entitlement.ts) server-side.
  // Never trust a client-sent flag for a paid feature: both the profile and
  // the paywall_enabled kill switch are read fresh here.
  const { data: profile, error: profileError } = await userClient.rpc("get_my_profile").single();
  if (profileError || !profile) {
    return json({ error: "Failed to load profile" }, 500);
  }

  const platform = body.platform === "android" ? "android" : "ios";
  const { data: appConfig } = await userClient
    .from("app_config")
    .select("paywall_enabled")
    .eq("platform", platform)
    .maybeSingle();
  const paywallEnabled = appConfig?.paywall_enabled === true;

  const isAdminOrCoach = profile.is_admin === true || profile.is_coach === true;
  const hasActiveAccess =
    !!profile.access_expires_at && new Date(profile.access_expires_at).getTime() > Date.now();
  const canAccessPro = !paywallEnabled || isAdminOrCoach || hasActiveAccess;

  if (!canAccessPro) {
    return json({ error: "PRO_REQUIRED", message: "AI Coach is a Pro feature." }, 403);
  }

  // Rate limit + log in one call — see ai_coach_log_chat_request. If this
  // rejects, we never spend a Claude API call at all.
  const { error: rateLimitError } = await userClient.rpc("ai_coach_log_chat_request");
  if (rateLimitError) {
    const isRateLimit = rateLimitError.message?.includes("RATE_LIMIT");
    return json(
      { error: isRateLimit ? "RATE_LIMIT" : "Internal error", message: rateLimitError.message },
      isRateLimit ? 429 : 500
    );
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    console.error("[ai-coach] Missing ANTHROPIC_API_KEY");
    return json({ error: "Server misconfiguration" }, 500);
  }

  async function callClaude(messages: unknown[]) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools: ANTHROPIC_TOOLS,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText}`);
    }
    return response.json();
  }

  try {
    const messages: unknown[] = [...body.messages];
    const recommendations: unknown[] = [];

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const claudeResponse = await callClaude(messages);

      if (claudeResponse.stop_reason !== "tool_use") {
        const text = (claudeResponse.content ?? [])
          .filter((block: { type: string }) => block.type === "text")
          .map((block: { text: string }) => block.text)
          .join("");
        return json({ reply: text, recommendations });
      }

      messages.push({ role: "assistant", content: claudeResponse.content });

      const toolResults = [];
      for (const block of claudeResponse.content) {
        if (block.type !== "tool_use") continue;
        const tool = TOOLS_BY_NAME[block.name];
        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
            is_error: true,
          });
          continue;
        }
        try {
          const result = await tool.handler(userClient, block.input ?? {});
          if (block.name === "recommend_test") recommendations.push(result);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err) {
          console.error(`[ai-coach] Tool ${block.name} failed:`, err);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    return json({ error: "Conversation exceeded maximum tool-use turns" }, 500);
  } catch (err) {
    console.error("[ai-coach] Unhandled error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});
