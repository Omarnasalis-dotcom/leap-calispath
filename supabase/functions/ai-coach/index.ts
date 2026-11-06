import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { TOOLS_BY_NAME, ANTHROPIC_TOOLS } from "./tools/index.ts";
import { computeDayPosition, getBlockParts } from "./tools/blockHelpers.ts";
import { addUsage, usageCostUsd, AccumulatedUsage, ClaudeUsage } from "./pricing.ts";
import { detectPendingCardClaim, detectUnactedClaim } from "./tools/actionClaimGuard.ts";
import { detectSafetyFlags } from "./tools/safetyGuard.ts";
import { isNarrationRound, sanitizeReply } from "./tools/replyCleanup.ts";
import { isAutoOpener } from "./tools/chatOpener.ts";
import { neutralizeUsageNotices } from "./tools/usageNotices.ts";
import { neutralizeAppNotes } from "./tools/appNotes.ts";
import { lastUserText, traceTool, ToolTrace, TurnOutcome } from "./tools/turnLog.ts";
import { createEventSink, finalRow, parseClientRequestId } from "./tools/resultRecovery.ts";
import { buildDayPreview, exerciseIds, PreviewBlock } from "./tools/dayPreview.ts";
import {
  addPendingCardNote,
  asPendingCard,
  cardReplyIsInChat,
  NO_PENDING_CARD,
  PENDING_CARD_LOOKUP_TIMEOUT_MS,
  pendingCardEnabled,
  pendingCardNote,
  pendingCardToStore,
  ProposedCard,
  proposedCardFrom,
  withinLimit,
} from "./tools/pendingCard.ts";

// Every tool whose call IS the write/propose action — system-prompt §1's
// list, exactly. If a terminal (non-tool-use) turn's text claims one of
// these happened but none of them were actually called anywhere in this
// request, that's the narrate-without-acting failure (see
// actionClaimGuard.ts's header for the Haiku history behind this).
const WRITE_TOOL_NAMES = new Set([
  "propose_new_program",
  "propose_add_day",
  "propose_program_from_workouts",
  "propose_end_program",
  "propose_delete_week",
  "propose_append_week",
  "adjust_program",
  "replace_block_exercises",
  "update_block_structure",
  "add_block_to_week",
]);

const AI_COACH_SYSTEM_PROFILE_ID = "00000000-0000-0000-0000-000000000002";

// propose_new_program/propose_add_day/propose_end_program are non-write
// "signal" tools — this builds the response's programAction field from the
// AI's proposal, with a trusted server-side lookup of the current active
// program (never trust an AI-relayed warrior_program_id/ownership flag for
// something CoachScreen.tsx will use to decide which RPC to call and what
// warning to show). Mirrors how `recommendations` already gets built from
// recommend_test calls, just one level more involved.
//
// `result` is the tool's OWN return value (from tool.handler above), not
// just its input — day-by-day build (2026-09-17): propose_new_program and
// propose_add_day both already resolve exercise names and transform blocks
// for insert themselves (they have to, to validate athlete-fit against real
// ids), so this reuses `result.resolved_blocks` instead of paying for a
// second resolveExerciseIds pass over the same names. That duplication
// used to be real and deliberate ("an extra DB query, not a correctness
// issue, not touched" — see git history); collapsing it was one of the
// approved Step 1/2 cleanup items.
// The day card's "See exercises" list (dayPreview.ts). One name lookup for
// the day's exercise ids; any failure just leaves the card without it.
async function dayPreview(userClient: SupabaseClient, blocks: unknown): Promise<PreviewBlock[] | null> {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  try {
    const ids = exerciseIds(blocks);
    const { data, error } = await userClient.from("exercise_library").select("id, name").in("id", ids);
    if (error) throw error;
    const nameById = new Map(((data ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]));
    return buildDayPreview(blocks, nameById);
  } catch (err) {
    console.error("[ai-coach] Day preview failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function buildProgramAction(
  userClient: SupabaseClient,
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
  result: Record<string, unknown>
) {
  // The caller's own active program only — RLS also shows coaches their
  // clients' programs and admins every program (see getUserContext.ts).
  const { data: active } = await userClient
    .from("warrior_programs")
    .select("id, template_id, coach_id")
    .eq("warrior_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const base = {
    warriorProgramId: active?.id ?? null,
    currentProgramIsAiOwned: active?.coach_id === AI_COACH_SYSTEM_PROFILE_ID,
  };

  if (toolName === "propose_new_program") {
    const resolvedBlocks = (result.resolved_blocks as Array<{ name: string }> | undefined) ?? [];
    // Day 1's own day name, for the same "Add Day 1 of M: <name>?" card
    // add_day's days use — derived from the already-resolved blocks rather
    // than trusting a separate model-supplied field, since propose_new_program
    // never asked for one (its schema only ever had a program `name`).
    const dayName = resolvedBlocks.length > 0 ? getBlockParts({ name: resolvedBlocks[0].name, exercises: [] }).day : null;
    const totalDays = Array.isArray((input.brief as { split_days?: unknown[] } | undefined)?.split_days)
      ? (input.brief as { split_days: unknown[] }).split_days.length
      : null;
    return {
      type: "create",
      reason: input.reason,
      dayNumber: 1,
      displayDayNumber: 1,
      totalDays,
      payload: {
        name: input.name,
        description: input.description ?? "",
        dayName,
        blocks: resolvedBlocks,
      },
      preview: await dayPreview(userClient, resolvedBlocks),
      ...base,
    };
  }
  if (toolName === "propose_add_day") {
    const dayName = typeof input.day_name === "string" ? input.day_name.trim() : "";
    // The week propose_add_day's handler chose (the athlete's current week,
    // week 1 during a build) — trusted, never the model's input.
    const weekNumber = typeof result.week_number === "number" ? result.week_number : 1;
    // Trusted, fresh check — never the model's own claim about what's
    // already in that week — of whether this day_name already exists there.
    // Decides which RPC CoachScreen.tsx's confirm tap calls: a genuinely
    // new day (ai_coach_add_block_to_week) or a redo of one already added
    // (ai_coach_replace_day_in_week, which deletes then re-inserts instead
    // of hard-rejecting the name collision add_block_to_week would raise).
    let replacing = false;
    let dayNumber: number | null = null;
    if (active?.template_id && dayName) {
      const { data: existingBlocks } = await userClient
        .from("program_blocks")
        .select("name")
        .eq("template_id", active.template_id)
        .eq("week_number", weekNumber);
      const position = computeDayPosition((existingBlocks ?? []).map((row: { name: string }) => row.name), dayName);
      replacing = position.replacing;
      dayNumber = position.dayNumber;
    }
    const totalDays = Array.isArray((input.brief as { split_days?: unknown[] } | undefined)?.split_days)
      ? ((input.brief as { split_days: unknown[] }).split_days.length)
      : null;
    // Fix B (2026-09-18): the model MAY supply day_number — its own read of
    // this day's true position in the confirmed structure, which matters
    // on a redo (computeDayPosition's dayNumber is just a running total, so
    // redoing an earlier day shows the wrong number — see that function's
    // own comment/tests). Label only: `dayNumber` above (the trusted,
    // server-computed one) is what CoachScreen.tsx's isLastConfirmedDay
    // uses to decide whether the build is actually done and the
    // celebration should fire — never this. A wrong or dishonest
    // day_number from the model can misname a card; it can never trigger
    // the wrong RPC or a premature/missed celebration.
    const modelDayNumber = typeof input.day_number === "number" && Number.isFinite(input.day_number) ? input.day_number : null;
    return {
      type: "add_day",
      reason: input.reason,
      weekNumber,
      replacing,
      dayNumber,
      displayDayNumber: modelDayNumber ?? dayNumber,
      totalDays,
      payload: {
        dayName,
        blocks: result.resolved_blocks ?? [],
      },
      preview: await dayPreview(userClient, result.resolved_blocks),
      ...base,
    };
  }
  if (toolName === "propose_delete_week") {
    return { type: "delete_week", reason: input.reason, weekNumber: input.week_number, payload: null, ...base };
  }
  if (toolName === "propose_append_week") {
    // week_number is propose_append_week's own trusted computation
    // (computeAppendWeekOrdering — current max week + 1, never the AI's
    // claim), reused here as-is rather than re-deriving it from `base`'s
    // active-program lookup, which only ever tells us the template/coach
    // ownership, not a week count.
    return {
      type: "append_week",
      reason: input.reason,
      weekNumber: (result.week_number as number | null | undefined) ?? null,
      payload: {
        blocks: result.resolved_blocks ?? [],
        removedBlockNames: (result.removed_block_names as string[] | undefined) ?? (input.removed_block_names as string[] | undefined) ?? null,
        carryOrderOverrides: (result.carry_order_overrides as Record<string, number> | undefined) ?? {},
      },
      ...base,
    };
  }
  if (toolName === "propose_program_from_workouts") {
    const workoutIds = (input.workout_ids as string[]) ?? [];
    // Trusted server-side lookup, same reasoning as `base` above — never
    // render a card title the AI could have gotten wrong. A stale/invalid
    // id just falls back to a placeholder here; ai_coach_create_program_from_workouts
    // re-validates existence for real when the athlete actually confirms.
    const { data: titleRows } = await userClient
      .from("standalone_workouts")
      .select("id, title")
      .in("id", workoutIds);
    const titleById = new Map((titleRows ?? []).map((r: { id: string; title: string }) => [r.id, r.title]));
    return {
      type: "create_from_workouts",
      reason: input.reason,
      payload: {
        name: input.name,
        workoutIds,
        dayTitles: workoutIds.map((id) => titleById.get(id) ?? "Unknown workout"),
      },
      ...base,
    };
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

// Design handoff (assets/design_handoff_leap_coach_chat): live "what the
// coach is doing" activity indicator, real stages emitted as the request
// progresses — never a client-side fake timer. `run` streams `event: stage`
// (data: {verb, label}) as the tool loop executes, then exactly one
// `event: final` carrying the same {reply, recommendations, programAction}
// shape the client already parsed before this existed. All the early-exit
// gates (auth/body/pro-gate/kill-switch/rate-limit, all before the tool
// loop starts) stay plain json() — nothing about them needs to stream.
// A genuine unhandled exception mid-loop becomes `event: error` instead of
// a fresh HTTP status, since headers are already committed by then.
// onDone runs after the final (or error) event is already sent, before the
// stream closes — the chat-review row and the collectable answer (see
// resultRecovery.ts) are saved there, off the athlete's wait, with the
// final event exactly as they received it.
// If the phone disconnects mid-turn, writes to the stream are dropped and
// the run carries on to the end, so its cost is recorded and the app can
// collect the answer afterwards.
function sseResponse(
  run: (send: (event: "stage" | "final" | "error", data: unknown) => void) => Promise<void>,
  onDone?: (reply: string | null, error: unknown, finalPayload: unknown) => Promise<void>,
) {
  const encoder = new TextEncoder();
  let sink: ReturnType<typeof createEventSink> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      sink = createEventSink((text) => controller.enqueue(encoder.encode(text)));
      const out = sink;
      let finalReply: string | null = null;
      let finalPayload: unknown = null;
      let runError: unknown = null;
      let reportedGone = false;
      const send = (event: "stage" | "final" | "error", data: unknown) => {
        // Single enforcement point for every "final" event, model-generated
        // or one of the hardcoded fallback messages above — see
        // replyCleanup.ts. Applied here rather than at each call site so a
        // future one can't forget it.
        if (event === "final" && data && typeof (data as { reply?: unknown }).reply === "string") {
          (data as { reply: string }).reply = sanitizeReply((data as { reply: string }).reply);
          finalReply = (data as { reply: string }).reply;
        }
        if (event === "final") finalPayload = data;
        if (!out.write(event, data) && !reportedGone) {
          reportedGone = true;
          console.warn(`[ai-coach] Client disconnected before the ${event} event; finishing the turn so the app can collect it.`);
        }
      };
      try {
        await run(send);
      } catch (err) {
        runError = err;
        console.error("[ai-coach] Unhandled error mid-stream:", err);
        send("error", { message: err instanceof Error ? err.message : "Internal Server Error" });
      } finally {
        if (onDone) {
          try {
            await onDone(finalReply, runError, finalPayload);
          } catch (err) {
            console.error("[ai-coach] onDone failed:", err);
          }
        }
        if (out.isOpen) {
          out.close();
          try {
            controller.close();
          } catch {
            // already closed by the disconnect
          }
        }
      }
    },
    cancel() {
      // The phone went away (app backgrounded, signal lost).
      sink?.close();
    },
  });
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Real, specific stage labels keyed off which tool is about to run and its
// actual input — never generic filler like "Thinking...". Deliberately a
// server-side template, not model-authored text: the model already proved
// unreliable at hand-authoring structured output today, a lookup keyed on
// the tool call it already has to make is a much smaller surface to get
// wrong.
function stageForTool(name: string, input: Record<string, unknown>): { verb: string; label: string } {
  const focus = typeof input.focus === "string" ? input.focus.replace(/_/g, " ").toLowerCase() : null;
  switch (name) {
    case "get_user_context":
      return { verb: "READING", label: "Reading your profile and program" };
    case "search_workouts":
      return { verb: "SEARCHING", label: focus ? `Looking for a ${focus} day that fits` : "Searching the workout library" };
    case "get_workout_detail":
      return { verb: "READING", label: "Checking that workout's details" };
    case "match_workout_for_day":
      return { verb: "SEARCHING", label: focus ? `Looking for a ${focus} day that fits` : "Searching the workout library" };
    case "get_workout_logs":
      return { verb: "READING", label: "Reading your logged workouts" };
    case "get_program_structure":
      return { verb: "READING", label: "Reading your current program" };
    case "search_exercises":
      return { verb: "SEARCHING", label: "Looking up exercises in the library" };
    case "propose_new_program":
      return { verb: "BUILDING", label: "Putting your program together" };
    case "propose_add_day":
      return { verb: "BUILDING", label: "Putting that day together" };
    case "propose_program_from_workouts":
      return { verb: "BUILDING", label: "Putting your program together" };
    case "propose_append_week":
      return { verb: "BUILDING", label: "Putting your next week together" };
    case "adjust_program":
      return { verb: "ADJUSTING", label: "Applying that change" };
    case "save_athlete_update":
      return { verb: "UPDATING", label: "Applying that change" };
    case "replace_block_exercises":
      return { verb: "ADJUSTING", label: "Swapping that exercise" };
    case "add_block_to_week":
      return { verb: "WRITING", label: "Adding that day" };
    case "recommend_test":
      return { verb: "CHECKING", label: "Checking if you're ready to test" };
    case "propose_end_program":
    case "propose_delete_week":
      return { verb: "UPDATING", label: "Preparing that change" };
    case "attach_stat_bars":
      return { verb: "READING", label: "Pulling your discipline scores" };
    case "attach_steps":
    case "suggest_replies":
      return { verb: "WRITING", label: "Writing your reply" };
    default:
      return { verb: "WORKING", label: "Working on it" };
  }
}

// Every RPC these tools call trusts auth.uid() internally (SECURITY
// DEFINER, "trust only auth.uid()" throughout this feature's design) — so
// every tool call and profile read in this function goes through a client
// authenticated AS THE CALLING USER (their own JWT forwarded from the
// request), never a service-role bypass. One deliberate exception:
// ai_coach_record_chat_cost (see recordCost() below) — real infrastructure
// telemetry, not a user action, so it's called via a service-role client
// instead. It used to run as the user's own JWT and trust a client-supplied
// p_cost_usd at face value, which meant any authenticated caller could
// invoke it directly and report $0 for their own usage, defeating the
// budget cap entirely. Locked down at the DB level (GRANT restricted to
// service_role only) — this client-side change keeps that the only way in.
// Raised from 8 after a real production failure: a program build spends
// turns on get_user_context + exercise lookups before it can call
// propose_new_program, and at 8 it ran out mid-lookup and fell through to
// the error return below — the athlete saw a long pause and then nothing.
// search_exercises now batches (see tools/searchExercises.ts), which is the
// actual fix; this is headroom so a build that needs a couple of extra
// round trips completes instead of dying silently.
const MAX_TOOL_TURNS = 16;
// No new Claude turn starts after this much wall-clock time (see the guard
// at the top of the tool loop). A turn plus its tools has run up to ~17s in
// live logs, so this leaves headroom under the Edge Function limit.
const TURN_START_DEADLINE_MS = 100_000;
// Reverted AGAIN 2026-08-26, same day as the re-attempt above: Haiku
// claimed "Week 2 is built... Go log Week 2" with no append_week call
// behind it (athlete checked, nothing was added) — the exact narrate-
// without-acting failure this was reverted for on 2026-08-23, reproduced
// on the very first live multi-turn test. Two independent occurrences now.
// Re-attempted 2026-09-16 with the real architectural change the comment
// above asked for: WRITE_TOOL_NAMES + detectUnactedClaim() (see
// actionClaimGuard.ts) now catch a terminal turn that claims a write action
// happened with no matching tool call anywhere in the request, force one
// corrective round-trip, and fall back to an honest "I described that but
// didn't actually do it" reply rather than shipping a false claim if the
// correction itself fails. This is independent of Haiku's own prompt
// compliance — it doesn't rely on the model getting it right a second time.
// Switched back to Sonnet the same day. The actionClaimGuard backstop and
// the per-model pricing lookup both stay regardless of which model runs
// here — neither is Haiku-specific, and the guard is a harmless no-op if
// Sonnet's own §1 compliance never trips it.
// Cost-per-token is model-specific (see pricing.ts's PRICING_BY_MODEL) —
// changing this constant again means adding that model's real rates there
// too, not just here, or the paid-tier $ budget cap silently mis-enforces.
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    resolvePublishableKey(),
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // Narrow, deliberate exception to this function's "always call as the
  // user" rule — see the comment above MAX_TOOL_TURNS. Only ever used for
  // ai_coach_record_chat_cost. Same fallback shape as
  // confirm-entitlement/index.ts's resolveServiceRoleKey, in case this
  // project's secrets are exposed as SUPABASE_SECRET_KEYS instead.
  const serviceRoleKey = (() => {
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
  })();
  const serviceClient = serviceRoleKey
    ? createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey)
    : null;

  let body: { messages?: Array<{ role: string; content: unknown }>; platform?: string; client_request_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "Missing messages array" }, 400);
  }
  // Captured into its own const here, not read as `body.messages` inside
  // the sseResponse callback below — TS's narrowing above doesn't survive
  // into a nested closure over the mutable `body` binding.
  // The app's own usage-limit notices are swapped for a neutral note (see
  // usageNotices.ts) so the model never repeats them as if still true, and
  // its "**PULL DAY** added." confirmations for an app note (appNotes.ts) so
  // the model never copies them as if it had built something.
  const initialMessages = neutralizeAppNotes(neutralizeUsageNotices(body.messages));

  const { data: profile, error: profileError } = await userClient.rpc("get_my_profile").single();
  if (profileError || !profile) {
    return json({ error: "Failed to load profile" }, 500);
  }

  const platform = body.platform === "android" ? "android" : "ios";
  const { data: appConfig } = await userClient
    .from("app_config")
    .select("ai_coach_enabled")
    .eq("platform", platform)
    .maybeSingle();

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

  // Free users can chat now (no outright block here) — ai_coach_log_chat_request
  // itself enforces a tier-aware cap: a small lifetime allowance for free
  // callers (raises PRO_REQUIRED/403 once exhausted, routing to the paywall
  // the same way this used to happen outright) and, for paid tiers
  // (First/Pro/Max), a real $ budget plus day-1/steady-state/weekly message
  // pacing (raises RATE_LIMIT:BUDGET|DAY1|DAILY|WEEKLY|CAP, all still 429 —
  // the client doesn't need to distinguish which one). Never spend a Claude
  // API call before this check passes. On success it returns request_id —
  // the ai_coach_requests row this turn's real Claude cost gets attached to
  // once the tool-use loop below finishes (see recordCost()).
  const { data: chatLogResult, error: rateLimitError } = await userClient.rpc("ai_coach_log_chat_request", { p_platform: platform });
  if (rateLimitError) {
    const isProRequired = rateLimitError.message?.includes("PRO_REQUIRED");
    const isRateLimit = rateLimitError.message?.includes("RATE_LIMIT");
    return json(
      {
        error: isProRequired ? "PRO_REQUIRED" : isRateLimit ? "RATE_LIMIT" : "Internal error",
        message: rateLimitError.message,
      },
      isProRequired ? 403 : isRateLimit ? 429 : 500
    );
  }
  const chatRequestId = (chatLogResult as { request_id?: string } | null)?.request_id;

  // The app's automatic opener isn't the athlete's message, so it doesn't use
  // one up on a paid plan. Any failure here only means it counts, as before.
  if (serviceClient && chatRequestId && (chatLogResult as { tier?: string } | null)?.tier !== "free" && isAutoOpener(body.messages)) {
    try {
      const { error } = await serviceClient.rpc("ai_coach_mark_opener", { p_request_id: chatRequestId, p_user_id: user.id });
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error("[ai-coach] Marking the opener failed:", err instanceof Error ? err.message : err);
    }
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    console.error("[ai-coach] Missing ANTHROPIC_API_KEY");
    return json({ error: "Server misconfiguration" }, 500);
  }

  // The answer the app can collect if its connection drops (see
  // resultRecovery.ts). 'running' now, so the app knows to keep waiting;
  // the final event or 'failed' once the turn ends (onDone below). Never
  // lets a failure here reach the athlete.
  const clientRequestId = parseClientRequestId(body.client_request_id);
  const storeResult = async (status: "running" | "done" | "failed", payload: unknown) => {
    if (!clientRequestId || !serviceClient) return;
    try {
      const { error } = await serviceClient.rpc("ai_coach_store_result", {
        p_user_id: user.id,
        p_client_request_id: clientRequestId,
        p_status: status,
        p_payload: payload,
      });
      if (error) console.error(`[ai-coach] ai_coach_store_result (${status}) failed:`, error.message);
    } catch (err) {
      console.error(`[ai-coach] ai_coach_store_result (${status}) failed:`, err);
    }
  };
  await storeResult("running", null);

  // Automatic caching of the growing conversation (2026-10-16): a top-level
  // cache_control lets every turn of the tool loop read the turns before it
  // from cache instead of re-sending them uncached (a week build re-sent its
  // ~35k-token logs on every turn: 76% of that message's cost). It uses one
  // of the 4 cache slots (system + last tool use the other two), all 5-minute.
  // If the API ever rejects it, the call is retried once without it and
  // caching stays off for the rest of this request, so it can't take the
  // coach down.
  let autoCache = true;
  async function callClaude(messages: unknown[]) {
    const post = () => fetch("https://api.anthropic.com/v1/messages", {
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
        // nothing at all appear.
        // Raised again, 16000 -> 32000, 2026-09-16: Direct Build's
        // propose_new_program now also carries the build brief and can span
        // a 4-day/~32-block advanced program (~5-8K tokens of pure JSON) —
        // plus, raising effort to "medium" the same day (see output_config
        // below) may spend more tokens per turn than "low" did. This costs
        // nothing extra unless actually used; it's headroom against the
        // exact silent-truncation failure above recurring at a larger scale.
        max_tokens: 32000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
        tools: CACHED_TOOLS,
        // Raised from "low" to "medium" 2026-09-16, same day as Direct
        // Build: at "low", a real 4-day-program build failed twice against
        // propose_new_program's validation (build brief + athlete-fit +
        // split coverage + block-structure checks, all against the FULL
        // blocks array with no partial resend) and burned ~50 cents in
        // repeated full-payload retries each time — no confirmed root cause
        // yet (couldn't pull the live logTurn lines to see whether it was
        // the same check failing repeatedly or genuine turn exhaustion),
        // but "low" is Anthropic's own recommendation for simple chat, not
        // structured multi-constraint output like this, so it's the prime
        // suspect: less internal effort per turn means more failed
        // validation passes, and every failure here regenerates the whole
        // program from scratch, not just the bad field. "medium" is
        // Anthropic's own recommended step for exactly this shape ("agentic
        // tasks that require a balance of speed, cost, and performance").
        // Reverted back to "low" 2026-09-17: the live 150s-timeout kill
        // (boot->shutdown exactly 150s) showed turns 2-3 spending ~37s and
        // 3,000+ output tokens each on a single read tool call (get_user_context,
        // search_exercises) — "medium" effort spending that much on a plain
        // tool call, not on the actual program content, is the bigger cost
        // than whatever validation-retry problem it was raised to fix on
        // 2026-09-16 (see the removed comment above / git history), and that
        // retry problem turned out to be the real crash bug in
        // validateBuildBrief (fixed same day), not an effort/token shortage.
        // Sonnet 5 doesn't support per-message effort switching (only
        // Fable 5.1/Mythos 5.1/Opus 5 do per Anthropic's docs), so this is
        // a global change, not build-calls-only — no beta header needed for
        // a static top-level value like this either way.
        output_config: { effort: "low" },
        ...(autoCache ? { cache_control: { type: "ephemeral" } } : {}),
      }),
    });
    let response = await post();
    if (!response.ok && response.status === 400 && autoCache) {
      const errText = await response.text();
      if (!/cache/i.test(errText)) {
        console.error(`[ai-coach] Anthropic ${response.status}: ${errText.slice(0, 500)}`);
        throw new Error(`Anthropic API error ${response.status}: ${errText}`);
      }
      console.error(`[ai-coach] Automatic caching rejected, retrying without it: ${errText.slice(0, 300)}`);
      autoCache = false;
      response = await post();
    }
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
  // elapsedMs is time since this whole request started (not just this
  // turn) — added 2026-09-17 after a live 150s-platform-timeout kill: the
  // per-turn `ms` alone couldn't show how close a given turn was to the
  // wall-clock limit when it was cut off mid-stream, only how long that one
  // turn itself took.
  function logTurn(turn: number, ms: number, elapsedMs: number, r: { stop_reason?: string; usage?: Record<string, number>; content?: Array<{ type: string; name?: string }> }) {
    const u = r.usage ?? {};
    const tools = (r.content ?? []).filter((b) => b.type === "tool_use").map((b) => b.name).join(",") || "-";
    const out = u.output_tokens ?? 0;
    console.log(
      `[ai-coach] turn=${turn} ${ms}ms elapsed=${elapsedMs}ms stop=${r.stop_reason} tools=${tools} ` +
      `in=${u.input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} ` +
      `cache_write=${u.cache_creation_input_tokens ?? 0} out=${out} ` +
      `(${ms > 0 ? Math.round((out / ms) * 1000) : 0} out-tok/s)`
    );
  }

  // What this exchange did, for the ai_coach_turns row saved in onDone
  // below (see turnLog.ts). Every exit sets outcome before its final event.
  const requestStartedAt = Date.now();
  const turnLog = {
    outcome: "ok" as TurnOutcome,
    tools: [] as ToolTrace[],
    unacted: false,
    programAction: null as string | null,
    usage: null as AccumulatedUsage | null,
  };

  // The last day card this request proposed, and the day card waiting from
  // an earlier one (tools/pendingCard.ts). Off unless AI_COACH_PENDING_CARD
  // allows this user. Neither can fail the athlete's message: any problem
  // here just means no note, which is how the coach always worked.
  const pendingCardOn = pendingCardEnabled(Deno.env.get("AI_COACH_PENDING_CARD"), user.id);
  let proposedCard: ProposedCard | null = null;
  // Set for every card, day card or not: the newest card replaces the saved
  // one, so an older day card can't be described as the current card.
  let proposedAt: string | null = null;

  const readPendingCardNote = async (): Promise<string | null> => {
    // One message can't hold a card's reply: it's the athlete's own.
    if (!pendingCardOn || !serviceClient || initialMessages.length < 2) return null;
    try {
      const lookup = await withinLimit(
        serviceClient.rpc("ai_coach_get_pending_card", { p_user_id: user.id }),
        PENDING_CARD_LOOKUP_TIMEOUT_MS,
      );
      if (!lookup) {
        console.warn("[ai-coach] Pending card lookup hit its time limit; continuing without it.");
        return null;
      }
      if (lookup.error) throw new Error(lookup.error.message);
      const card = asPendingCard(lookup.data);
      return card && cardReplyIsInChat(card, initialMessages) ? pendingCardNote(card) : null;
    } catch (err) {
      console.error("[ai-coach] Pending card lookup failed:", err instanceof Error ? err.message : err);
      return null;
    }
  };

  const savePendingCard = async (reply: string | null) => {
    // No reply means the turn failed and the phone got no new card.
    if (!pendingCardOn || !serviceClient || !proposedAt || !reply) return;
    const card = pendingCardToStore(proposedCard, reply) ?? NO_PENDING_CARD;
    try {
      const { error } = await serviceClient.rpc("ai_coach_store_pending_card", {
        p_user_id: user.id,
        p_card: card,
        p_proposed_at: proposedAt,
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error("[ai-coach] Pending card save failed:", err instanceof Error ? err.message : err);
    }
  };

  const saveTurnForReview = async (reply: string | null, error: unknown) => {
    // Chat review row (migration 20261030120000). Off until the privacy
    // policy naming it is live: set the AI_COACH_CHAT_LOG secret to "on".
    // Never lets a failure here reach the athlete.
    if (Deno.env.get("AI_COACH_CHAT_LOG") !== "on") return;
    if (!serviceClient) {
      console.error("[ai-coach] Missing service role credentials — chat turn NOT saved for review.");
      return;
    }
    const usage = turnLog.usage;
    const { error: insertError } = await serviceClient.from("ai_coach_turns").insert({
      user_id: user.id,
      request_id: chatRequestId ?? null,
      platform,
      model: ANTHROPIC_MODEL,
      user_message: lastUserText(initialMessages),
      reply,
      outcome: error ? "error" : turnLog.outcome,
      error_message: error ? (error instanceof Error ? error.message : String(error)) : null,
      tools: turnLog.tools,
      tool_errors: turnLog.tools.filter((t) => !t.ok).length,
      safety_flags: reply ? detectSafetyFlags(reply) : [],
      unacted_correction: turnLog.unacted,
      program_action: turnLog.programAction,
      history_length: initialMessages.length,
      latency_ms: Date.now() - requestStartedAt,
      cost_usd: usage ? usageCostUsd(usage, ANTHROPIC_MODEL) : null,
      input_tokens: usage ? usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens : null,
      output_tokens: usage?.output_tokens ?? null,
    });
    if (insertError) console.error("[ai-coach] Failed to save chat turn for review:", insertError.message);
  };

  return sseResponse(async (send) => {
    const pendingLookupStart = Date.now();
    const pendingNote = await readPendingCardNote();
    if (pendingNote) {
      turnLog.tools.push(traceTool("pending_card_note", {}, Date.now() - pendingLookupStart, { result: "added" }));
    }
    const messages: unknown[] = pendingNote ? addPendingCardNote(initialMessages, pendingNote) : [...initialMessages];
    const recommendations: unknown[] = [];
    let programAction: unknown = null;
    // Design handoff rich blocks (attach_stat_bars/attach_steps) and
    // contextual quick-reply chips (suggest_replies) — same collect-as-the-
    // loop-runs pattern as `recommendations` above.
    const blocks: unknown[] = [];
    let suggestedReplies: string[] = [];
    // Found live: a turn that calls a tool (suggest_replies, recommend_test,
    // attach_stat_bars...) alongside real prose has stop_reason "tool_use",
    // so it never reaches the terminal branch below — and the terminal
    // branch used to be the ONLY place `reply` was read from, meaning that
    // turn's actual analysis was pushed into `messages` for Claude's own
    // context and then silently discarded from what the athlete sees. The
    // next turn's short continuation ("Let me know which you'd like to do")
    // became the whole reply. Accumulate every turn's text here instead —
    // §1 already forbids narrating ("checking your profile...") separately
    // from real content, so concatenating turns in order is safe.
    const replyParts: string[] = [];
    // Working-out-loud text (isNarrationRound), used only if nothing else came.
    const heldParts: string[] = [];
    // See WRITE_TOOL_NAMES/actionClaimGuard.ts above — populated as write
    // tools actually run, checked against a terminal turn's own claimed
    // action below. correctionAttempted bounds the self-correction nudge to
    // once per request so a model that fails it twice doesn't loop forever.
    const calledWriteTools = new Set<string>();
    let athleteUpdateSaved = false;
    let correctionAttempted = false;
    let cardClaimChecked = false;

    // A single chat turn (one call to this function) can span multiple
    // Claude API calls — every tool_use iteration below calls callClaude()
    // again. Real cost is the SUM of usage across all of them, not just the
    // last call. Recorded against chatRequestId (the ai_coach_requests row
    // ai_coach_log_chat_request already inserted) once this turn is done,
    // at whichever exit point below is actually hit.
    let totalUsage: AccumulatedUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    async function recordCost() {
      turnLog.usage = totalUsage;
      if (!chatRequestId) return;
      const costUsd = usageCostUsd(totalUsage, ANTHROPIC_MODEL);
      if (!serviceClient) {
        // Never let cost bookkeeping break a reply that's already been
        // generated — but this is a real gap when it happens: this turn's
        // spend never gets attributed, so it never counts against the
        // athlete's budget. Logged loudly since it means the cap is
        // silently not enforcing, not just a missed nice-to-have.
        console.error("[ai-coach] Missing service role credentials — chat cost NOT recorded, budget enforcement degraded for this turn.");
        return;
      }
      const { error } = await serviceClient.rpc("ai_coach_record_chat_cost", {
        p_request_id: chatRequestId,
        p_user_id: user.id,
        p_input_tokens: totalUsage.input_tokens,
        p_output_tokens: totalUsage.output_tokens,
        p_cache_creation_input_tokens: totalUsage.cache_creation_input_tokens,
        p_cache_read_input_tokens: totalUsage.cache_read_input_tokens,
        p_cost_usd: costUsd,
      });
      // Never let cost bookkeeping break a reply that's already been
      // generated and is about to be sent to the athlete.
      if (error) console.error("[ai-coach] ai_coach_record_chat_cost failed:", error.message);
    }

    // Safety backstop (see safetyGuard.ts): log-and-flag only — the reply is
    // always sent unchanged. Flagged replies are saved as an automated report
    // for human review. Never lets a failure here affect the athlete.
    const flagUnsafeReply = async (reply: string) => {
      const flags = detectSafetyFlags(reply);
      if (flags.length === 0) return;
      console.error(`[ai-coach] SAFETY FLAG (${flags.join(", ")}) for ${user.id}: "${reply.slice(0, 200)}"`);
      try {
        const lastUser = [...initialMessages].reverse().find((m) => m.role === "user");
        const precedingUserMessage = typeof lastUser?.content === "string" ? lastUser.content : null;
        const { error } = await userClient.from("ai_coach_message_reports").insert({
          user_id: user.id,
          reason: "auto_safety_flag",
          assistant_message: `[${flags.join(", ")}] ${reply}`,
          preceding_user_message: precedingUserMessage,
        });
        if (error) console.error("[ai-coach] Failed to save safety flag:", error.message);
      } catch (err) {
        console.error("[ai-coach] Failed to save safety flag:", err);
      }
    };

    const startedAt = Date.now();
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      // Wall-clock guard (audit 2026-09-25, H5 #1): never start another
      // Claude turn this late — one more slow turn plus a tool can push past
      // the Edge Function limit, which the athlete sees as a dead connection
      // with no message. Stop cleanly instead; any card/recommendation this
      // request already produced is still sent.
      if (turn > 0 && Date.now() - startedAt > TURN_START_DEADLINE_MS) {
        console.error(`[ai-coach] Stopping at turn ${turn}: ${Date.now() - startedAt}ms elapsed, past the ${TURN_START_DEADLINE_MS}ms turn-start deadline.`);
        turnLog.outcome = "deadline";
        await recordCost();
        send("final", {
          reply: "This is taking longer than it should, so I'm stopping here rather than leave you waiting. Ask me again and I'll pick up from where we are.",
          recommendations,
          programAction,
          blocks,
          suggestedReplies,
        });
        return;
      }
      const turnStart = Date.now();
      let claudeResponse;
      try {
        claudeResponse = await callClaude(messages);
      } catch (err) {
        // A failed call on a later turn (provider error, network) skips every
        // exit below, so the turns already paid for would never count toward
        // the athlete's budget (audit 2026-10-16, L1). Record them before the
        // error reaches the stream's handler. A first-turn failure spent
        // nothing and stays unrecorded, as before.
        const spent = totalUsage.input_tokens + totalUsage.output_tokens +
          totalUsage.cache_creation_input_tokens + totalUsage.cache_read_input_tokens;
        if (spent > 0) await recordCost();
        throw err;
      }
      logTurn(turn, Date.now() - turnStart, Date.now() - startedAt, claudeResponse);
      totalUsage = addUsage(totalUsage, (claudeResponse.usage ?? {}) as ClaudeUsage);

      const turnText = (claudeResponse.content ?? [])
        .filter((block: { type: string }) => block.type === "text")
        .map((block: { text: string }) => block.text)
        .join("");
      const turnTools = (claudeResponse.content ?? [])
        .filter((block: { type: string }) => block.type === "tool_use")
        .map((block: { name: string }) => block.name);
      if (turnText.trim()) {
        (claudeResponse.stop_reason === "tool_use" && isNarrationRound(turnTools) ? heldParts : replyParts).push(turnText.trim());
      }

      if (claudeResponse.stop_reason !== "tool_use") {
        const text = (replyParts.length > 0 ? replyParts : heldParts).join("\n\n");

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
          turnLog.outcome = "max_tokens";
          await recordCost();
          send("final", {
            reply: text.trim()
              ? `${text}\n\n(That came out longer than I could fit in one message — if you were expecting a program card, ask me to build it again and I'll keep it tighter.)`
              : "That program came out too long for one message, so it didn't make it through. Ask me to build it again — tell me the split you want and I'll keep it tighter.",
            recommendations,
            programAction,
            blocks,
            suggestedReplies,
          });
          return;
        }

        // Found live: a normal (non-tool-use, non-max_tokens) turn can still
        // come back with genuinely empty text — Claude settled with nothing
        // to say. Same "never claim success with nothing said" reasoning as
        // the max_tokens case above, just a different cause. The client has
        // its own fallback text too, but the server should never need it —
        // a real message here, not a blank one calling itself successful.
        if (!text.trim()) {
          console.error(`[ai-coach] Normal turn (stop_reason=${claudeResponse.stop_reason}) ended with empty text (turn ${turn}).`);
          turnLog.outcome = "empty";
          await recordCost();
          send("final", {
            reply: "That didn't come through with anything to say — ask me again and I'll pick it back up.",
            recommendations, programAction, blocks, suggestedReplies,
          });
          return;
        }

        // Narrate-without-acting guard (see actionClaimGuard.ts) — checked
        // against THIS turn's own text only (turnText), never the joined
        // `text`, since an earlier turn's claim in the same request would
        // have had its own real tool call attached (that's what stop_reason
        // "tool_use" means) and joining would dilute the signal. Only fires
        // when no write tool has run anywhere in this request yet.
        const looksUnacted = calledWriteTools.size === 0 && detectUnactedClaim(turnText, athleteUpdateSaved);
        if (looksUnacted && !correctionAttempted) {
          correctionAttempted = true;
          turnLog.unacted = true;
          console.error(`[ai-coach] SUSPECTED NARRATE-WITHOUT-ACTING (turn ${turn}), forcing one correction: "${turnText.slice(0, 300)}"`);
          // Drop the false claim from replyParts (pushed unconditionally
          // above) — if the correction succeeds, the athlete should see the
          // corrected turn's text, never the discarded lie alongside it.
          replyParts.pop();
          messages.push({ role: "assistant", content: claudeResponse.content });
          messages.push({
            role: "user",
            content:
              "[System check] Your last reply described an action (building, adding, ending, deleting, or adjusting a program, week, or day) but no matching tool was called. If you meant to do that, call the correct tool now, in this response. If you were only describing an option or something not yet done, reply again without implying it already happened.",
          });
          continue;
        }
        if (looksUnacted && correctionAttempted) {
          // The corrected turn narrated an unacted claim again. Never ship
          // it — substitute an honest reply instead of a false success
          // claim. Strictly safer than the original bug even when the
          // model fails the same way twice.
          console.error(`[ai-coach] Narrate-without-acting persisted after correction (turn ${turn}) — substituting a safe reply instead of the claim.`);
          turnLog.outcome = "unacted_blocked";
          await recordCost();
          send("final", {
            reply: "I described that but didn't actually do it — want me to go ahead and make that change now? Say yes and I'll do it in the same message.",
            recommendations, programAction, blocks, suggestedReplies,
          });
          return;
        }

        // A card is up and the reply talks as if it were already applied
        // (see detectPendingCardClaim). One re-check against the tool
        // results, then ship whatever comes back: edits made directly in
        // this request are real, so there is no safe reply to substitute.
        // The whole reply is rewritten, since the claim can sit in an
        // earlier turn's text ("Day 4 now has…" before the tool calls).
        if (programAction && !cardClaimChecked && detectPendingCardClaim(text)) {
          cardClaimChecked = true;
          turnLog.unacted = true;
          console.error(`[ai-coach] SUSPECTED CLAIM BEFORE CARD TAP (turn ${turn}), forcing one re-check: "${text.slice(0, 300)}"`);
          replyParts.length = 0;
          messages.push({ role: "assistant", content: claudeResponse.content });
          messages.push({
            role: "user",
            content:
              "[System check] A card in this reply is still waiting for the athlete's tap, and nothing on it has changed their program yet. Write your whole reply to them again: describe what's on the card as ready for them to tap, and say something is already done only if a tool result above confirms it (success: true). Don't call tools again.",
          });
          continue;
        }

        console.log(`[ai-coach] DONE in ${Date.now() - startedAt}ms after ${turn + 1} turn(s)`);
        await recordCost();
        await flagUnsafeReply(text);
        send("final", { reply: text, recommendations, programAction, blocks, suggestedReplies });
        return;
      }

      messages.push({ role: "assistant", content: claudeResponse.content });

      const toolResults = [];
      for (const block of claudeResponse.content) {
        if (block.type !== "tool_use") continue;
        const tool = TOOLS_BY_NAME[block.name];
        if (!tool) {
          turnLog.tools.push(traceTool(block.name, block.input, 0, { error: `Unknown tool: ${block.name}` }));
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
            is_error: true,
          });
          continue;
        }
        const toolStart = Date.now();
        try {
          send("stage", stageForTool(block.name, (block.input as Record<string, unknown>) ?? {}));
          const result = await tool.handler(userClient, block.input ?? {});
          console.log(`[ai-coach]   tool ${block.name} ${Date.now() - toolStart}ms`);
          turnLog.tools.push(traceTool(block.name, block.input, Date.now() - toolStart, { result }));
          if (WRITE_TOOL_NAMES.has(block.name)) calledWriteTools.add(block.name);
          if (block.name === "save_athlete_update") athleteUpdateSaved = true;
          if (block.name === "recommend_test") recommendations.push(result);
          if (block.name === "attach_stat_bars" || block.name === "attach_steps") blocks.push(result);
          if (block.name === "suggest_replies") suggestedReplies = (result as { replies: string[] }).replies;
          if (
            block.name === "propose_new_program" ||
            block.name === "propose_add_day" ||
            block.name === "propose_end_program" ||
            block.name === "propose_delete_week" ||
            block.name === "propose_program_from_workouts" ||
            block.name === "propose_append_week"
          ) {
            programAction = await buildProgramAction(userClient, user.id, block.name, block.input ?? {}, result as Record<string, unknown>);
            turnLog.programAction = block.name;
            proposedCard = proposedCardFrom(block.name, (block.input ?? {}) as Record<string, unknown>);
            proposedAt = new Date().toISOString();
          }
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err) {
          console.error(`[ai-coach] Tool ${block.name} failed:`, err);
          turnLog.tools.push(traceTool(block.name, block.input, Date.now() - toolStart, { error: err instanceof Error ? err.message : String(err) }));
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
    // what to do. Send a final event with a real reply instead: any work
    // that DID complete (a recommendation, a proposal card) still reaches
    // them, and the message tells them how to get unstuck. Logged as an
    // error so this stays visible as a bug to fix, not a normal path.
    console.error(
      `[ai-coach] Hit MAX_TOOL_TURNS (${MAX_TOOL_TURNS}) without a final reply. ` +
      `Last tool calls likely looping — check whether search_exercises is being ` +
      `called one-at-a-time instead of batched via \`queries\`.`
    );
    turnLog.outcome = "max_turns";
    await recordCost();
    send("final", {
      reply:
        "That took more steps than I could finish in one go — I didn't want to leave you hanging without saying so. Ask me again and I'll go straight at it; if it was a full program, telling me the split you want (e.g. \"4 days, pull/legs/push/weighted\") gets me there in one pass.",
      recommendations,
      programAction,
      blocks,
      suggestedReplies,
    });
  }, async (reply, error, finalPayload) => {
    const row = finalRow(finalPayload);
    await Promise.all([storeResult(row.status, row.payload), saveTurnForReview(reply, error), savePendingCard(reply)]);
  });
});
