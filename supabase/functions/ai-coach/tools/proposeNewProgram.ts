import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";
import { ToolDefinition } from "./types.ts";
import {
  BLOCKS_SCHEMA,
  BUILD_BRIEF_SCHEMA,
  AthleteFitContext,
  resolveExerciseIds,
  validateBlockStructure,
  validateBuildBrief,
  validateSplitCoverage,
  validateAthleteFit,
} from "./blockHelpers.ts";

// Direct build (2026-09-16): this replaced Match-Clone-Adapt as the main
// program-build path. propose_program_from_workouts still exists for an
// athlete who explicitly asks for one specific library workout as-is
// (system-prompt.ts §11) — everything else now goes through here, built
// fresh from the athlete's own data rather than cloned and patched after
// the fact. Real failure that motivated this: cloned library days kept
// reaching the athlete unadapted (wrong level, wrong numbers, skill holds
// above what they can actually do) because the required Adapt pass after
// confirm depended on the model reliably running two more tool calls on
// its own judgment — a control-flow bet that kept losing. A single
// same-call gate the athlete never sees content before it passes is safer
// than a promise to fix it after the fact.
//
// Fetches the athlete's real numbers itself (assessmentRaw + recent
// workout_set_logs) rather than trusting whatever the model reports in the
// brief — same principle as resolveExerciseIds not trusting a model-typed
// exercise id. A hallucinated "10 pull-ups" in the brief cannot become a
// false pass here; only what's actually in assessment_raw can.
async function fetchAthleteFitContext(
  userClient: SupabaseClient,
  brief: { skills: AthleteFitContext["skills"] }
): Promise<AthleteFitContext> {
  const { data: profile } = await userClient.rpc("get_my_profile").single();
  const raw = (profile as { assessment_raw?: Record<string, unknown> } | null)?.assessment_raw ?? {};

  // Only a strict/standard variant confirms real unassisted capability —
  // an assisted/banded/inverted-row number at any rep count doesn't mean
  // the athlete can do the unassisted movement at all (see spartanLogic.ts's
  // MovementVariant enum: strict_pullup vs assisted_pullup/inverted_row,
  // standard_dip vs bench_dip, standard_pushup vs knee_pushup, strict_mu vs
  // banded_mu/jumping_mu). Getting this wrong in the lenient direction
  // (crediting an assisted number as unassisted) is exactly the failure
  // mode these checks exist to prevent.
  const pullUpsMax = raw.pullup_variant === "strict_pullup" ? (raw.pullup_reps as number) ?? null : null;
  const dipsMax = raw.dip_variant === "standard_dip" ? (raw.dip_reps as number) ?? null : null;
  const pushUpsMax = raw.pushup_variant === "standard_pushup" ? (raw.pushup_reps as number) ?? null : null;
  const muscleUpsMax = raw.mu_variant === "strict_mu" ? (raw.mu_reps as number) ?? null : null;

  // Most-recent logged weight per exercise, across all history — not
  // scoped to one program, since a brand-new build may have no active
  // program yet and a prior, now-ended one still tells us what they lifted.
  // RLS ("Warriors manage own set logs") already scopes this to the caller.
  const { data: weightRows } = await userClient
    .from("workout_set_logs")
    .select("weight_used, created_at, block_exercises(exercise_library(name))")
    .not("weight_used", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);

  const loggedWeights: Record<string, number> = {};
  for (const row of (weightRows ?? []) as Array<{ weight_used: number; block_exercises?: { exercise_library?: { name?: string } } }>) {
    const name = row.block_exercises?.exercise_library?.name;
    if (!name) continue;
    const key = name.trim().toLowerCase();
    // First hit wins — rows are ordered most-recent-first.
    if (loggedWeights[key] === undefined) loggedWeights[key] = row.weight_used;
  }

  return { pullUpsMax, dipsMax, pushUpsMax, muscleUpsMax, skills: brief.skills, loggedWeights };
}

// Replaces the old create_program entirely — there is no tool left that
// writes a new program directly. This only signals a proposed action back
// to the client (same non-write "signal" pattern recommend_test already
// uses); index.ts captures the full input into the response's
// programAction field, transformed into the exact shape
// ai_coach_create_program expects, so CoachScreen.tsx can call that RPC
// directly once the athlete taps confirm — the AI never triggers the
// write itself.
export const proposeNewProgram: ToolDefinition = {
  name: "propose_new_program",
  description:
    "Propose a brand-new training program to the athlete — this does NOT create anything. It shows the athlete a confirmation card in the chat; the program is only actually created if they explicitly tap it. Requires the full build brief (see `brief`) — every field must already be a real, athlete-confirmed answer, not a guess. This checks the program you wrote against the athlete's own real numbers (assessment_raw, logged weights) before it will propose anything — an unrealistic block (a hold above their max, reps at or above what they tested, a band cue they no longer need) comes back as an error naming exactly what to fix, not a card the athlete sees unadapted.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short program name, e.g. 'Muscle-Up Focus B4'" },
      description: { type: "string" },
      reason: { type: "string", description: "One sentence shown to the athlete on the confirmation card explaining why you're proposing this." },
      brief: BUILD_BRIEF_SCHEMA,
      blocks: BLOCKS_SCHEMA,
    },
    required: ["name", "brief", "blocks", "reason"],
  },
  handler: async (userClient, input) => {
    const brief = validateBuildBrief(input.brief);

    // Structural ceiling, not a prompt hope: writing week 2+ upfront for a
    // program that hasn't been trained yet has no real performance data
    // behind it — the prompt already discourages this, but under enough
    // pressure ("just build all 10 weeks, don't ask questions") a model can
    // be talked past prose guidance. This makes the ceiling a hard tool
    // error instead, same pattern as resolveExerciseIds/validateBlockStructure
    // below — surfaced as a tool result the model must react to in this
    // turn, never silently truncated later by hitting max_tokens on an
    // oversized blocks array.
    const blocks = (input.blocks as Array<{ week_number?: number }>) ?? [];
    const weekNumbers = new Set(blocks.map((b) => b.week_number ?? 1));
    if (weekNumbers.size > 2) {
      throw new Error(
        `This proposes ${weekNumbers.size} weeks in one call, but at most 2 can be built at once. Programming further weeks before any training has actually happened isn't coaching, it's a guess. Resend with only weeks ${[...weekNumbers].sort((a, b) => a - b).slice(0, 2).join(" and ")} — the rest comes from append_week once the athlete has logged real training.`
      );
    }

    // Same reasoning as resolveExerciseIds below: reject here, as a tool
    // error the model can see and fix in this same turn, rather than
    // surfacing after the athlete already tapped Start on an incomplete card.
    validateBlockStructure((input.blocks as never[]) ?? [], { requireDayPhases: true });
    validateSplitCoverage((input.blocks as never[]) ?? [], brief.days_per_week);

    const fitContext = await fetchAthleteFitContext(userClient, brief);
    validateAthleteFit((input.blocks as never[]) ?? [], fitContext);

    // Resolve here so an unknown exercise name comes back as a tool error the
    // model can fix in this same turn, rather than surfacing after the athlete
    // has already tapped Start on a card that looked complete.
    await resolveExerciseIds(userClient, (input.blocks as never[]) ?? []);
    return { proposed: true };
  },
};
