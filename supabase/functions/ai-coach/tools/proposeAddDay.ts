import { ToolDefinition } from "./types.ts";
import {
  BLOCKS_SCHEMA,
  BUILD_BRIEF_SCHEMA,
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
  warnSkillCoverage,
  warnSplitCoverage,
  warnTimingMismatch,
  warnUneditedFromSource,
} from "./blockHelpers.ts";

const AI_COACH_SYSTEM_PROFILE_ID = "00000000-0000-0000-0000-000000000002";

// Day-by-day build (2026-09-17): proposes day 2+ of a program day 1's
// propose_new_program already created. Never call this before day 1 has
// actually been added (tap confirmed) — get_program_structure throws on a
// week with zero blocks, and there is no program to add a day to yet.
//
// Non-write "signal" tool, same pattern as propose_new_program: this only
// validates and signals; index.ts turns the input into the response's
// programAction (type "add_day"), doing its own trusted, fresh check of
// whether `day_name` already exists in week 1 of the athlete's active
// program — never trusting this tool's own claim about what's already
// there, same "re-fetch before writing" principle as everywhere else in
// this codebase. That check decides whether the athlete's confirm tap
// calls ai_coach_add_block_to_week (new day) or ai_coach_replace_day_in_week
// (redoing a day already added) — this tool doesn't need to know which.
//
// `brief` is required on every call, not just day 1's — nothing persists
// between turns (system-prompt.ts §2), so the confirmed plan (skills,
// split, equipment) has to be resent here the same way propose_new_program
// needed it, for warnSplitCoverage and the skill-checkpoint athlete-fit
// checks to have anything to check against.
export const proposeAddDay: ToolDefinition = {
  name: "propose_add_day",
  description:
    "Propose the NEXT day of a program currently being built, one day at a time — this does NOT write anything until the athlete taps the card. Only call this after day 1 was already added (propose_new_program's card was tapped) — never before, and never to build more than one day per call. `day_name` must exactly match this day's blocks' own day_name (e.g. \"LEGS DAY\"). `brief` is the same full confirmed plan sent with propose_new_program, resent here since nothing carries over between turns. Runs the same checks as propose_new_program: an unknown exercise name or a number at/above the athlete's confirmed max is a hard error naming what to fix; other issues come back as non-fatal `warnings` in the result to use judgment on, not a blocker. If this day_name was already added earlier and the athlete asked to redo it, call this again with the corrected blocks — the confirm step handles replacing it, not you.",
  input_schema: {
    type: "object",
    properties: {
      day_name: { type: "string", description: 'e.g. "LEGS DAY" — must exactly match what every block in `blocks` claims as its own day (day_name field or the part before "|" in a combined name).' },
      day_number: { type: "integer", description: "This day's position in the confirmed structure (e.g. 2, if this is the second day the athlete agreed to). Only affects the card's label — never whether this adds a new day or redoes one already added, which is always decided server-side from the real program state. Fill it in from the confirmed structure when you know it, e.g. when redoing an earlier day so the card still reads its real position instead of the current total day count. Omit it if genuinely unsure; the label falls back to a day count." },
      reason: { type: "string", description: "One sentence shown to the athlete on the confirmation card explaining why you're proposing this day." },
      brief: BUILD_BRIEF_SCHEMA,
      blocks: { ...BLOCKS_SCHEMA, description: "Exactly this one day's blocks." },
      source_workout_id: { type: "string", description: "The id of the library workout this day was matched from (from search_workouts/get_workout_detail), if any. Optional — omit for a from-scratch day. When present, the day is checked against that workout's real blocks; if it comes back effectively unedited, the result names what to check before proposing again." },
    },
    required: ["day_name", "brief", "blocks", "reason"],
  },
  handler: async (userClient, input) => {
    const dayName = typeof input.day_name === "string" ? input.day_name.trim() : "";
    if (!dayName) {
      throw new Error(`"day_name" is required and must be a non-empty string.`);
    }
    const brief = validateBuildBrief(input.brief);
    const blocks = input.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new Error(`"blocks" is required and must be this one day's blocks.`);
    }

    // Same day-name cross-check addProgramDay.ts used to run: every block
    // sent here must claim the SAME day internally as the day_name argument,
    // or a typo/mismatch would silently create an orphaned or wrongly-named
    // block once inserted — caught here, same-turn, rather than surfacing
    // later as a confusing week-structure bug with no clear cause.
    const mismatched = (blocks as never[]).filter((block) => getBlockParts(block).day !== dayName);
    if (mismatched.length > 0) {
      throw new Error(
        `"day_name" is "${dayName}", but ${mismatched.length} of the blocks you sent claim a different day internally (check each block's day_name/name field). Every block in this call must belong to "${dayName}".`
      );
    }

    const badWeek = (blocks as Array<{ week_number?: number }>).find((b) => b.week_number !== undefined && b.week_number !== 1);
    if (badWeek) {
      throw new Error(`propose_add_day only ever builds into week 1 — got week_number ${badWeek.week_number}. Omit week_number or set it to 1.`);
    }

    const { data: profile } = await userClient.rpc("get_my_profile").single();
    const levelBand = levelBandForTier((profile as { strength_tier?: number } | null)?.strength_tier);
    const autoFixed = await normalizeBlockStructure(blocks as never[], levelBand, userClient);

    validateBlockStructure(blocks as never[], { requireDayPhases: true });

    const warnings = warnSplitCoverage(brief.split_days, brief.days_per_week);
    warnings.push(...warnTimingMismatch(blocks as never[]));

    if (typeof input.source_workout_id === "string" && input.source_workout_id) {
      const sourceBlocks = await fetchSourceWorkoutBlocks(userClient, input.source_workout_id);
      warnings.push(...warnUneditedFromSource(blocks as never[], sourceBlocks));
    }

    const fitContext = await fetchAthleteFitContext(userClient, brief, profile as { assessment_raw?: Record<string, unknown> } | null);
    warnings.push(...validateAthleteFit(blocks as never[], fitContext));

    // Skill-coverage warning (2026-09-17): a separate, read-only query from
    // the trusted collision check index.ts's buildProgramAction runs — that
    // one exists to decide which RPC the athlete's confirm tap calls and
    // must never trust anything this tool claims; this one only informs a
    // warning the MODEL reads in its own tool result, so it's fine for it
    // to live here instead. Not gated behind "is this definitely the last
    // day" with certainty — isLastDay is a best-effort read of the athlete's
    // own active program, cheap enough to run on every call and simply a
    // no-op (empty warnings) until the day count actually reaches the
    // confirmed plan's length.
    const { data: activeProgram } = await userClient
      .from("warrior_programs")
      .select("template_id")
      .eq("status", "active")
      .eq("coach_id", AI_COACH_SYSTEM_PROFILE_ID)
      .maybeSingle();
    if (activeProgram?.template_id) {
      const { data: existingBlocks } = await userClient
        .from("program_blocks")
        .select("name, block_exercises(exercise_library(name))")
        .eq("template_id", activeProgram.template_id)
        .eq("week_number", 1);

      const daySkillNames = new Map<string, Set<string>>();
      for (const row of (existingBlocks ?? []) as Array<{ name: string; block_exercises?: Array<{ exercise_library?: { name?: string } }> }>) {
        const { day } = getBlockParts({ name: row.name, exercises: [] });
        const set = daySkillNames.get(day) ?? new Set<string>();
        for (const be of row.block_exercises ?? []) {
          const n = be.exercise_library?.name;
          if (n) set.add(n.trim().toLowerCase());
        }
        daySkillNames.set(day, set);
      }
      // Fold in THIS call's day too — it isn't in program_blocks yet, but
      // "including the day being proposed" is exactly what was asked for.
      const thisDaySet = daySkillNames.get(dayName) ?? new Set<string>();
      for (const block of blocks as never[]) {
        for (const ex of (block as { exercises?: Array<{ name?: string }> }).exercises ?? []) {
          if (ex.name) thisDaySet.add(ex.name.trim().toLowerCase());
        }
      }
      daySkillNames.set(dayName, thisDaySet);

      const isLastDay = daySkillNames.size >= (brief.split_days?.length ?? Infinity);
      if (isLastDay) {
        warnings.push(...warnSkillCoverage(daySkillNames, brief.skills));
      }
    }

    const idMap = await resolveExerciseIds(userClient, blocks as never[]);
    return {
      proposed: true,
      day_name: dayName,
      resolved_blocks: transformBlocksForInsert(blocks as never[], idMap),
      ...(autoFixed.length > 0 ? { auto_fixed: autoFixed } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};
