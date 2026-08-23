import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { TOOLS_BY_NAME, ANTHROPIC_TOOLS } from "./tools/index.ts";
import { transformBlocksForInsert, resolveExerciseIds } from "./tools/blockHelpers.ts";

const AI_COACH_SYSTEM_PROFILE_ID = "00000000-0000-0000-0000-000000000002";

// propose_new_program/propose_end_program are non-write "signal" tools —
// this builds the response's programAction field from the AI's proposal,
// with a trusted server-side lookup of the current active program (never
// trust an AI-relayed warrior_program_id/ownership flag for something
// CoachScreen.tsx will use to decide which RPC to call and what warning to
// show). Mirrors how `recommendations` already gets built from
// recommend_test calls, just one level more involved since this also needs
// the blocks transformed into the exact shape ai_coach_create_program
// expects (same transform createProgram.ts used to run before it was
// retired in favor of this propose-then-confirm flow).
async function buildProgramAction(
  userClient: SupabaseClient,
  toolName: string,
  input: Record<string, unknown>
) {
  const { data: active } = await userClient
    .from("warrior_programs")
    .select("id, coach_id")
    .eq("status", "active")
    .maybeSingle();

  const base = {
    warriorProgramId: active?.id ?? null,
    currentProgramIsAiOwned: active?.coach_id === AI_COACH_SYSTEM_PROFILE_ID,
  };

  if (toolName === "propose_new_program") {
    const idMap = await resolveExerciseIds(userClient, (input.blocks as never[]) ?? []);
    return {
      type: "create",
      reason: input.reason,
      payload: {
        name: input.name,
        description: input.description ?? "",
        blocks: transformBlocksForInsert((input.blocks as never[]) ?? [], idMap),
      },
      ...base,
    };
  }
  if (toolName === "propose_delete_week") {
    return { type: "delete_week", reason: input.reason, weekNumber: input.week_number, payload: null, ...base };
  }
  return { type: "end", reason: input.reason, payload: null, ...base };
}

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
// Raised from 8 after a real production failure: a program build spends
// turns on get_user_context + exercise lookups before it can call
// propose_new_program, and at 8 it ran out mid-lookup and fell through to
// the error return below — the athlete saw a long pause and then nothing.
// search_exercises now batches (see tools/searchExercises.ts), which is the
// actual fix; this is headroom so a build that needs a couple of extra
// round trips completes instead of dying silently.
const MAX_TOOL_TURNS = 16;
// Reverted from claude-haiku-4-5-20251001 back to Sonnet 2026-08-23: Haiku
// repeatedly narrated actions in text ("Now building your program...")
// without emitting the matching tool call — no card ever rendered, no
// program ever got created. Reproduced live multiple times even after
// prompt-level fixes (an explicit "act, don't narrate" rule placed first in
// the prompt, shrinking the prompt by ~3KB, removing redundant
// reinforcement). This is a real reliability ceiling for this compound
// agentic flow (multi-turn conversation + tool orchestration + a system
// prompt this size), not a wording problem — don't re-attempt Haiku here
// without re-verifying this exact failure mode is actually gone first.
const ANTHROPIC_MODEL = "claude-sonnet-5";

// Prompt caching: the system prompt (~5-6k tokens) and the 7 tool schemas
// are 100% static across every call in the tool-use loop below — up to
// MAX_TOOL_TURNS full round-trips per exchange, each previously re-sending
// both from scratch at full price. Cache breakpoint precedence is
// tools -> system -> messages, so marking the last tool AND the system
// block lets Anthropic cache both as one shared prefix; only the actually-
// growing `messages` array pays full input price after the first call.
const CACHED_TOOLS = ANTHROPIC_TOOLS.map((tool, i) =>
  i === ANTHROPIC_TOOLS.length - 1 ? { ...tool, cache_control: { type: "ephemeral" } } : tool
);

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
    .select("paywall_enabled, ai_coach_enabled")
    .eq("platform", platform)
    .maybeSingle();
  const paywallEnabled = appConfig?.paywall_enabled === true;

  const isAdminOrCoach = profile.is_admin === true || profile.is_coach === true;

  // Remote kill switch (app_config.ai_coach_enabled, default false).
  // Admins/coaches bypass it so the rebuild can be exercised against prod data
  // without exposing a half-finished coach to athletes. Returns 200 with a real
  // reply rather than a non-2xx: a disabled feature is an expected state, and
  // the client renders an error status as "Coach is temporarily unreachable",
  // which is both alarming and wrong.
  const aiCoachEnabled = appConfig?.ai_coach_enabled === true;
  if (!aiCoachEnabled && !isAdminOrCoach) {
    return json({
      reply: "The AI Coach is off right now while we rebuild it to be faster and more reliable. Your programs and logs are untouched \u2014 everything else in the app works as normal.",
      recommendations: [],
      programAction: null,
    });
  }

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
        // 4096 was far too small and caused a silent, expensive failure: a
        // full 4-day program's propose_new_program tool call is ~16 blocks
        // x 3-6 exercises with UUIDs and metadata, well past 4096 output
        // tokens. The response came back stop_reason "max_tokens" with a
        // TRUNCATED tool_use block, the loop below treated it as "not a
        // tool call", kept only text blocks (there were none), and returned
        // an empty reply — which CoachScreen's `if (result?.content)` then
        // dropped silently. The athlete paid for thousands of tokens and saw
        // nothing at all appear. Sized for the largest realistic program.
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
        tools: CACHED_TOOLS,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      // Surface the real upstream status/body in logs — a bare rethrow here
      // becomes an opaque non-2xx on the client with nothing to diagnose from.
      console.error(`[ai-coach] Anthropic ${response.status}: ${errText.slice(0, 500)}`);
      throw new Error(`Anthropic API error ${response.status}: ${errText}`);
    }
    return response.json();
  }

  // Where does the wall clock actually go? Input is processed in parallel and
  // is mostly cache-read here; output is generated one token at a time, so a
  // big program build is dominated by generation, not by prompt size or DB
  // lookups. This logs it per turn instead of leaving it to inference — read
  // it in Dashboard > Edge Functions > ai-coach > Logs.
  function logTurn(turn: number, ms: number, r: { stop_reason?: string; usage?: Record<string, number>; content?: Array<{ type: string; name?: string }> }) {
    const u = r.usage ?? {};
    const tools = (r.content ?? []).filter((b) => b.type === "tool_use").map((b) => b.name).join(",") || "-";
    const out = u.output_tokens ?? 0;
    console.log(
      `[ai-coach] turn=${turn} ${ms}ms stop=${r.stop_reason} tools=${tools} ` +
      `in=${u.input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} ` +
      `cache_write=${u.cache_creation_input_tokens ?? 0} out=${out} ` +
      `(${ms > 0 ? Math.round((out / ms) * 1000) : 0} out-tok/s)`
    );
  }

  try {
    const messages: unknown[] = [...body.messages];
    const recommendations: unknown[] = [];
    let programAction: unknown = null;

    const startedAt = Date.now();
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const turnStart = Date.now();
      const claudeResponse = await callClaude(messages);
      logTurn(turn, Date.now() - turnStart, claudeResponse);

      if (claudeResponse.stop_reason !== "tool_use") {
        const text = (claudeResponse.content ?? [])
          .filter((block: { type: string }) => block.type === "text")
          .map((block: { text: string }) => block.text)
          .join("");

        // stop_reason "max_tokens" means the response was cut mid-generation.
        // If it was cut inside a tool_use block, that block is incomplete and
        // is discarded by the filter above — so whatever the model was doing
        // (usually proposing a program) is simply gone. Never return that as
        // a bare empty reply: that is the silent-failure path that showed the
        // athlete nothing after a long, expensive wait.
        if (claudeResponse.stop_reason === "max_tokens") {
          console.error(
            `[ai-coach] Response truncated at max_tokens (turn ${turn}). ` +
            `Text recovered: ${text.length} chars. A tool call was likely lost.`
          );
          return json({
            reply: text.trim()
              ? `${text}\n\n(That came out longer than I could fit in one message — if you were expecting a program card, ask me to build it again and I'll keep it tighter.)`
              : "That program came out too long for one message, so it didn't make it through. Ask me to build it again — tell me the split you want and I'll keep it tighter.",
            recommendations,
            programAction,
          });
        }

        console.log(`[ai-coach] DONE in ${Date.now() - startedAt}ms after ${turn + 1} turn(s)`);
        return json({ reply: text, recommendations, programAction });
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
          const toolStart = Date.now();
          const result = await tool.handler(userClient, block.input ?? {});
          console.log(`[ai-coach]   tool ${block.name} ${Date.now() - toolStart}ms`);
          if (block.name === "recommend_test") recommendations.push(result);
          if (
            block.name === "propose_new_program" ||
            block.name === "propose_end_program" ||
            block.name === "propose_delete_week"
          ) {
            programAction = await buildProgramAction(userClient, block.name, block.input ?? {});
          }
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

    // Turn budget exhausted. This used to return a bare 500 with no `reply`,
    // which the client surfaced as nothing at all — the athlete watched a
    // long pause and then got silence, with no way to know what happened or
    // what to do. Return 200 with a real reply instead: any work that DID
    // complete (a recommendation, a proposal card) still reaches them, and
    // the message tells them how to get unstuck. Logged as an error so this
    // stays visible as a bug to fix, not a normal path.
    console.error(
      `[ai-coach] Hit MAX_TOOL_TURNS (${MAX_TOOL_TURNS}) without a final reply. ` +
      `Last tool calls likely looping — check whether search_exercises is being ` +
      `called one-at-a-time instead of batched via \`queries\`.`
    );
    return json({
      reply:
        "That took more steps than I could finish in one go — I didn't want to leave you hanging without saying so. Ask me again and I'll go straight at it; if it was a full program, telling me the split you want (e.g. \"4 days, pull/legs/push/weighted\") gets me there in one pass.",
      recommendations,
      programAction,
    });
  } catch (err) {
    console.error("[ai-coach] Unhandled error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});
