import { ToolDefinition } from "./types.ts";
import {
  assembleDayWithServerBlocks,
  BLOCKS_SCHEMA,
  BUILD_BRIEF_SCHEMA,
  CoolDownMarker,
  fetchAthleteFitContext,
  fetchSourceWorkoutBlocks,
  getBlockParts,
  levelBandForTier,
  normalizeBlockStructure,
  resolveExerciseIds,
  transformBlocksForInsert,
  validateBlockStructure,
  validateBuildBrief,
  validateAthleteFit,
  warnSplitCoverage,
  warnTimingMismatch,
  warnUneditedFromSource,
  WarmUpMarker,
} from "./blockHelpers.ts";

// Day-by-day build (2026-09-17): proposes DAY 1 ONLY of a brand-new
// program — never a whole week. `blocks` always carries exactly one day's
// worth of blocks; `brief` still carries the FULL planned split (goal,
// skills, days_per_week, split_days, equipment, pacing) so warnSplitCoverage
// can sanity-check the declared plan and the athlete's confirmed intent
// survives to append_week/weekly-review later. Day 2 onward goes through
// propose_add_day instead, once this call's confirm has created the program
// — see that file's own comment for why it's a separate tool rather than
// this one reused with an existing warrior_program_id.
//
// Non-write "signal" tool, same pattern as recommend_test/propose_end_program:
// index.ts captures the input into the response's programAction field,
// transformed into the exact shape ai_coach_create_program expects, so
// CoachScreen.tsx can call that RPC directly once the athlete taps confirm —
// the AI never triggers the write itself.
export const proposeNewProgram: ToolDefinition = {
  name: "propose_new_program",
  description:
    "Propose DAY 1 of a brand-new training program — this does NOT create anything until the athlete taps the card. `blocks` is exactly one day's blocks (the first day of the confirmed week structure); every day after this one goes through propose_add_day instead, once this day is added. Don't write Warm-Up, Mobility or Cool-Down blocks: pick 3-5 warm-up exercise names for this athlete and day in `warm_up_exercises` (the server sets rounds and reps by level and builds the block), add `mobility_exercises` only when they need mobility, and the server builds the Cool-Down. `brief` carries the FULL confirmed plan (goal, skills, days_per_week, the real split_days in order, equipment, pacing), even though blocks here is just day 1 — the rest of the plan is what propose_add_day's later days build toward. Requires every brief field to already be a real, athlete-confirmed answer, never a guess. Checks this day against the athlete's own real numbers (assessment_raw, logged weights) before proposing — some issues (a hold or reps at/above their confirmed max, a band cue they no longer need, a missing checkpoint) are hard errors naming exactly what to fix; others (reps that look low for their level, a split-structure mismatch) come back as non-fatal `warnings` in the result — read those and use judgment, they don't block the card.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short program name, e.g. 'Muscle-Up Focus B4'" },
      description: { type: "string" },
      reason: { type: "string", description: "One sentence shown to the athlete on the confirmation card explaining why you're proposing this day." },
      brief: BUILD_BRIEF_SCHEMA,
      blocks: { ...BLOCKS_SCHEMA, description: "This day's non-standard blocks — Skills/Strength/Accessories/Finisher etc. Omit Warm-Up, Mobility and Cool-Down; use warm_up_exercises and mobility_exercises instead. Never more than one day; propose_add_day builds every day after this." },
      warm_up: { type: "string", enum: ["default", "push", "legs"], description: "Fallback only, used when warm_up_exercises is omitted: which standard Warm-Up list to build. Omit to infer from this day's own focus_tag." },
      warm_up_exercises: { type: "array", items: { type: "string" }, description: "3-5 exact library names for this athlete's Warm-Up today: easy, rep-based moves that prepare what this day trains, within their level and equipment (system-prompt.ts §11). Names only, the server sets rounds and reps by level. Never main lifts (Pull Ups (Normal Grip), Dips, Push Ups, Muscle Up)." },
      mobility_exercises: { type: "array", items: { type: "string" }, description: "Only when the athlete needs mobility (a mobility goal, a skill that needs range, a limitation they mentioned): 2-4 exact library mobility or flexibility names. Omit otherwise, and no Mobility block is added." },
      cool_down: { type: "string", enum: ["default", "legs"], description: "Which standard Cool-Down list to build server-side. Omit to infer from this day's own focus_tag. Ignored if `blocks` already includes a Cool-Down block." },
      source_workout_id: { type: "string", description: "The id of the library workout this day was matched from (from search_workouts/get_workout_detail), if any. Optional — omit for a from-scratch day. When present, the day is checked against that workout's real blocks; if it comes back effectively unedited, the result names what to check before proposing again." },
    },
    required: ["name", "brief", "blocks", "reason"],
  },
  handler: async (userClient, input) => {
    const brief = validateBuildBrief(input.brief);
    let blocks = input.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new Error(`"blocks" is required and must be day 1's blocks — propose_new_program builds one day at a time now, never a whole week.`);
    }

    // Trivial safety net (2026-09-17, kept deliberately even though every
    // call is day 1 of week 1 today): reject anything but week_number 1 or
    // omitted, rather than silently accepting a stray week_number a future
    // change or a confused model might send. Not the old 2-week ceiling —
    // there is no multi-week case left in this tool at all.
    const badWeek = (blocks as Array<{ week_number?: number }>).find((b) => b.week_number !== undefined && b.week_number !== 1);
    if (badWeek) {
      throw new Error(`propose_new_program only ever builds week 1 — got week_number ${badWeek.week_number}. Omit week_number or set it to 1.`);
    }

    // Server-built Warm-Up/Cool-Down (2026-09-18, per-day-latency pass): if
    // the model didn't already write one itself (the escape hatch for a day
    // that genuinely needs something different), build it here from the
    // verified standard lists instead — before normalize/validate ever see
    // this day, so both run against the real assembled day either way.
    // Day 1's own name comes from whatever block the model DID write
    // (there's always at least one, checked above), not a separate input —
    // this tool never asked for a day_name field.
    const day1Name = getBlockParts(blocks[0] as never).day;
    const { data: profile } = await userClient.rpc("get_my_profile").single();
    const levelBand = levelBandForTier((profile as { strength_tier?: number } | null)?.strength_tier);
    const warmUpNotes: string[] = [];
    blocks = await assembleDayWithServerBlocks(
      userClient,
      blocks as never[],
      day1Name,
      input.warm_up as WarmUpMarker | undefined,
      input.cool_down as CoolDownMarker | undefined,
      {
        levelBand,
        warmUpNames: Array.isArray(input.warm_up_exercises) ? (input.warm_up_exercises as string[]) : undefined,
        mobilityNames: Array.isArray(input.mobility_exercises) ? (input.mobility_exercises as string[]) : undefined,
        excludeNames: brief.skills.map((s) => s.checkpointExercise),
        notes: warmUpNotes,
      }
    );

    // Fetched once, reused below for both the auto-repair level band and
    // fetchAthleteFitContext's real numbers — avoids a second get_my_profile
    // round trip for the same row.
    const autoFixed = [...warmUpNotes, ...(await normalizeBlockStructure(blocks as never[], levelBand, userClient))];

    // Same reasoning as resolveExerciseIds below: reject here, as a tool
    // error the model can see and fix in this same turn, rather than
    // surfacing after the athlete already tapped Add on an incomplete card.
    validateBlockStructure(blocks as never[], { requireDayPhases: true });

    const warnings = warnSplitCoverage(brief.split_days, brief.days_per_week);
    warnings.push(...warnTimingMismatch(blocks as never[]));

    if (typeof input.source_workout_id === "string" && input.source_workout_id) {
      const sourceBlocks = await fetchSourceWorkoutBlocks(userClient, input.source_workout_id);
      warnings.push(...warnUneditedFromSource(blocks as never[], sourceBlocks));
    }

    const fitContext = await fetchAthleteFitContext(userClient, brief, profile as { assessment_raw?: Record<string, unknown> } | null);
    warnings.push(...validateAthleteFit(blocks as never[], fitContext));

    // Resolve here so an unknown exercise name comes back as a tool error the
    // model can fix in this same turn, rather than surfacing after the athlete
    // has already tapped Add on a card that looked complete. Returned as
    // resolved_blocks (2026-09-17) so index.ts's card-payload builder can
    // reuse this exact resolution instead of re-querying exercise_library a
    // second time for the same names — the old double-resolution this
    // collapses is called out in this file's git history.
    const idMap = await resolveExerciseIds(userClient, blocks as never[]);
    return {
      proposed: true,
      resolved_blocks: transformBlocksForInsert(blocks as never[], idMap),
      ...(autoFixed.length > 0 ? { auto_fixed: autoFixed } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};
