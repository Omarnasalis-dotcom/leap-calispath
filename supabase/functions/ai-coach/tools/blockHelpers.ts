// Shared block-shape transform for propose_new_program / append_week / add_block_to_week. Claude
// sends structured blocks (day_name + block_name + a metadata object +
// plain coach_notes) rather than hand-producing the app's stored
// "[CONCEPT:{...}] notes" string — far more reliable than asking a model to
// get bracket/JSON string-escaping exactly right. This ports
// BlockConceptParser.stringify's exact format (src/lib/BlockConceptParser.ts)
// so the app's UI parses it back out identically to a human-built block.
interface ClaudeBlock {
  day_name?: string;
  block_name?: string;
  name?: string;
  order_index?: number;
  week_number?: number;
  metadata?: Record<string, unknown>;
  coach_notes?: string;
  exercises: Array<{
    // `name` is now the primary reference and exercise_id is optional —
    // see resolveExerciseIds below for why.
    name?: string;
    exercise_id?: string;
    sets?: number | string;
    reps?: number | string;
    rest_seconds?: number | string;
    hold_seconds?: number | string;
    is_weighted?: boolean;
    notes?: string;
    order_index?: number;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Same "DAY {n} | {name}" split every consumer of program_blocks.name uses
// (see transformBlocksForInsert below) — resolves whichever of
// name/day_name/block_name the model actually sent into a (day, phase) pair
// for grouping, without requiring day_name/block_name specifically.
function getBlockParts(block: ClaudeBlock): { day: string; phase: string } {
  if (block.day_name) {
    return { day: block.day_name.trim(), phase: (block.block_name ?? block.name ?? "").trim() };
  }
  const combined = (block.name ?? block.block_name ?? "").trim();
  const pipeIndex = combined.indexOf("|");
  if (pipeIndex === -1) return { day: combined || "?", phase: combined };
  return { day: combined.slice(0, pipeIndex).trim(), phase: combined.slice(pipeIndex + 1).trim() };
}

// Real bug found live (2026-08-26): the model left blocks with zero
// exercises and whole days missing Warm-Up/Cool-Down. Prompt wording alone
// did not hold up in practice, so this is enforced here — same
// pre-flight-reject-with-a-clear-message pattern as resolveExerciseIds,
// so a violation surfaces as a tool error the model can see and fix in the
// same turn, never a card that renders incomplete.
//
// `requireDayPhases` only applies to propose_new_program: it defines whole
// new days from scratch, so every day needs both phases. append_week and
// add_block_to_week send deliberately partial block sets (carry-forward,
// one supplementary block) where this would be a false positive — the
// empty-block check alone still applies to them.
const MIN_WARMUP_COOLDOWN_EXERCISES = 3;

// The empty-list and duplicate-name checks, factored out so
// replaceBlockExercises.ts (4.4) — which edits one block's flat exercise
// list in isolation, with no day_name/block_name/metadata to derive a
// phase from — can run the same two checks validateBlockStructure runs
// per-block below, instead of silently allowing the exact bug class
// already found live in the other three write tools (a swap that empties
// a block, or a substitution that duplicates the old exercise instead of
// replacing it).
export function validateExerciseList(
  exercises: ClaudeBlock["exercises"],
  label: string
): void {
  if ((exercises ?? []).length === 0) {
    throw new Error(`"${label}" would have no exercises. A block's exercise list can't be emptied out — every block needs at least one.`);
  }
  const seenNames = new Map<string, number>();
  (exercises ?? []).forEach((ex, i) => {
    const key = (ex.name ?? ex.exercise_id ?? "").trim().toLowerCase();
    if (!key) return;
    if (seenNames.has(key)) {
      throw new Error(
        `"${label}" lists "${ex.name ?? ex.exercise_id}" twice (positions ${seenNames.get(key)! + 1} and ${i + 1}). If you swapped an exercise and this block already had the replacement, remove the duplicate instead of adding a second entry — pick a genuinely different substitute if that exercise is already being trained here.`
      );
    }
    seenNames.set(key, i);
  });
}

export function validateBlockStructure(
  blocks: ClaudeBlock[],
  opts: { requireDayPhases: boolean }
): void {
  for (const block of blocks ?? []) {
    const isRest = block.metadata?.focus_tag === "REST";
    const exercises = block.exercises ?? [];
    const { day, phase } = getBlockParts(block);

    if (!isRest) {
      validateExerciseList(exercises, `${day} | ${phase}`);
    }

    // Found live: a 1-2 exercise Warm-Up/Cool-Down is not a real warm-up —
    // applies whenever one of these is actually sent (any tool), never a
    // false positive against carry-forward since an omitted block never
    // reaches here at all.
    const phaseLower = phase.toLowerCase();
    if ((phaseLower === "warm-up" || phaseLower === "cool-down") && exercises.length < MIN_WARMUP_COOLDOWN_EXERCISES) {
      throw new Error(
        `"${day} | ${phase}" has only ${exercises.length} exercise(s) — a real Warm-Up/Cool-Down needs at least ${MIN_WARMUP_COOLDOWN_EXERCISES} (4-5 is the real target). Add more before resending.`
      );
    }

    // Found live: a ladder block with no reps means the athlete has nothing
    // to log — ladder_start/ladder_sub only drive the preview subtitle,
    // nothing reads them back into a per-set target during actual logging.
    if (block.metadata?.structure === "ladder") {
      const missingReps = exercises.some((ex) => ex.reps === undefined || ex.reps === null || String(ex.reps).trim() === "");
      if (missingReps) {
        throw new Error(
          `"${day} | ${phase}" is a ladder block with an exercise missing reps. Every exercise needs reps even in a ladder — use the block's ladder_start value.`
        );
      }
    }

    // BLOCKS_SCHEMA's own field descriptions document several
    // conditionally-required metadata fields (rounds/time_cap_min/tabata_*/
    // ladder_*), but a description is only prose the model has to notice and
    // follow — the JSON schema's `required` array only covers the four
    // always-required fields, so nothing actually stopped a block from
    // omitting them. That mattered in practice: BlockConceptParser.ts (the
    // client's own reader of this data) doesn't error on a missing one —
    // it silently falls back to generic defaults (`tabata_work_seconds || 20`
    // and friends) or returns an empty ladder preview — so a dropped field
    // never surfaced as a visible bug, just a quietly wrong or blank
    // prescription. Enforced here the same way the ladder-reps check above
    // is, so a smaller model dropping one of these under a dense schema gets
    // a same-turn retry instead of shipping a silently generic block.
    if (!isRest) {
      const meta = (block.metadata ?? {}) as Record<string, unknown>;
      const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

      if ((meta.structure === "circuit" || meta.structure === "superset" || meta.structure === "ladder") && isBlank(meta.rounds)) {
        throw new Error(`"${day} | ${phase}" has structure "${meta.structure}" but no metadata.rounds — required for circuit/superset/ladder blocks (the round count, as a string, e.g. "3").`);
      }
      // Inverse of the check above, found while auditing Direct Build
      // (2026-09-16): nothing stopped a "single" structure block from also
      // carrying a stray metadata.rounds — which would then wrongly trip
      // the rounds-implies-sets-"1" check below on what should be a normal
      // multi-set exercise (e.g. 4 sets of 8 reps).
      if (meta.structure === "single" && !isBlank(meta.rounds)) {
        throw new Error(`"${day} | ${phase}" has structure "single" but also metadata.rounds set to "${meta.rounds}" — rounds only applies to circuit/superset/ladder. Remove rounds, or use a real multi-exercise structure if repetition across a group is what's intended.`);
      }
      if ((meta.timing_system === "fortime" || meta.timing_system === "amrap") && isBlank(meta.time_cap_min)) {
        throw new Error(`"${day} | ${phase}" has timing_system "${meta.timing_system}" but no metadata.time_cap_min — required for fortime/amrap blocks (the time cap in minutes).`);
      }
      if (meta.timing_system === "tabata") {
        const missingTabata = (["tabata_work_seconds", "tabata_rest_seconds", "tabata_rounds"] as const).filter((k) => isBlank(meta[k]));
        if (missingTabata.length > 0) {
          throw new Error(`"${day} | ${phase}" is a tabata block missing ${missingTabata.join(", ")} — all three are required for tabata timing.`);
        }
      }
      if (meta.structure === "ladder") {
        const missingLadder = (["ladder_start", "ladder_sub", "ladder_direction"] as const).filter((k) => isBlank(meta[k]));
        if (missingLadder.length > 0) {
          throw new Error(`"${day} | ${phase}" is a ladder block missing ${missingLadder.join(", ")} — all three are required for a ladder structure.`);
        }
      }

      // Direct build (2026-09-16): every block is now freshly authored, so
      // BLOCKS_SCHEMA's own long-standing rule — "when rounds is set, each
      // exercise's own sets is '1'" — is finally enforced, not just
      // documented prose. Previously a known, confirmed gap (see this
      // file's test suite before this change). A block with rounds:"3" AND
      // an exercise at sets:"3" double-counts the repetition: the block
      // structure already repeats the whole thing 3 times, so 3 sets on
      // top of that is 9x, not 3x, and BlockConceptParser's UI has no way
      // to show that mismatch to the athlete — it just renders both
      // numbers as if they were independent.
      if (!isBlank(meta.rounds)) {
        const badSets = exercises.filter((ex) => {
          const setsVal = ex.sets;
          return isBlank(setsVal) || String(setsVal).trim() !== "1";
        });
        if (badSets.length > 0) {
          const names = badSets.map((ex) => ex.name ?? "?").join(", ");
          throw new Error(
            `"${day} | ${phase}" has metadata.rounds set to "${meta.rounds}", so every exercise's own sets must be exactly "1" — the block's rounds field drives the repetition, not each exercise's sets. Fix: ${names}.`
          );
        }
      }
    }
  }

  if (!opts.requireDayPhases) return;

  const byDay = new Map<string, { phases: Set<string>; allRest: boolean; nonRestBlockCount: number; allStraightSetSingle: boolean }>();
  for (const block of blocks ?? []) {
    const { day, phase } = getBlockParts(block);
    const entry = byDay.get(day) ?? { phases: new Set<string>(), allRest: true, nonRestBlockCount: 0, allStraightSetSingle: true };
    entry.phases.add(phase.toLowerCase());
    const isRestBlock = block.metadata?.focus_tag === "REST";
    entry.allRest = entry.allRest && isRestBlock;
    if (!isRestBlock) {
      entry.nonRestBlockCount += 1;
      const isStraightSetSingle = block.metadata?.timing_system === "straight_set" && block.metadata?.structure === "single";
      entry.allStraightSetSingle = entry.allStraightSetSingle && isStraightSetSingle;
    }
    byDay.set(day, entry);
  }
  for (const [day, entry] of byDay) {
    if (entry.allRest) continue;
    const missing = ["warm-up", "cool-down"].filter((p) => !entry.phases.has(p));
    if (missing.length > 0) {
      throw new Error(
        `"${day}" is missing a ${missing.map((m) => (m === "warm-up" ? "Warm-Up" : "Cool-Down")).join(" and ")} block — every day needs both, non-negotiable. Add it and resend the whole program.`
      );
    }
    // Found live (2026-09-16): a from-scratch day with zero structural
    // variety — every block straight_set + single — is a sign the role
    // table (system-prompt.ts §16) was never actually consulted, not a
    // valid minimalist day. Only fires with 2+ non-rest blocks: a single-
    // block day has nothing to vary against, so it's not a real violation.
    if (entry.nonRestBlockCount >= 2 && entry.allStraightSetSingle) {
      throw new Error(
        `"${day}" has every block set to timing_system straight_set + structure single — no real variety across the day. Vary by block role (system-prompt.ts §16's role table): a Warm-Up circuit, a superset or circuit somewhere in Strength/Accessories, or an amrap/fortime finisher are the usual fixes.`
      );
    }
  }
}

// Direct build (2026-09-16): propose_new_program-only, mirroring
// system-prompt.ts §15's two hard rules rather than its whole per-day-count
// table (replicating every band's exact category list here would risk
// rejecting legitimate variation the prompt already handles — e.g. §15's
// 5/6-day splits name skill-combined days like "Push & Handstand", whose
// focus_tag is still PUSH). The two rules below are the ones with a real,
// live-reproduced failure behind them (§15: "Push+Pull, or Pull alone, both
// silently drop Legs for the whole week").
export function validateSplitCoverage(blocks: ClaudeBlock[], daysPerWeek: number): void {
  const dayFocusTags = new Map<string, Set<string>>();
  for (const block of blocks ?? []) {
    if ((block.metadata?.focus_tag as string | undefined) === "REST") continue;
    const { day } = getBlockParts(block);
    const tags = dayFocusTags.get(day) ?? new Set<string>();
    if (block.metadata?.focus_tag) tags.add(block.metadata.focus_tag as string);
    dayFocusTags.set(day, tags);
  }
  const days = [...dayFocusTags.keys()];
  if (days.length === 0) return;

  // Found while auditing Direct Build (2026-09-16): brief.days_per_week and
  // the actual distinct day count in blocks were never cross-checked —
  // nothing stopped a brief claiming 4 while the program itself had 3 or 5
  // real training days.
  if (days.length !== daysPerWeek) {
    throw new Error(
      `brief.days_per_week says ${daysPerWeek}, but the program actually has ${days.length} distinct training day(s) (${days.join(", ")}). These must match — fix whichever one is wrong.`
    );
  }

  if (daysPerWeek <= 2) {
    for (const day of days) {
      if (!dayFocusTags.get(day)!.has("FULL_BODY")) {
        throw new Error(
          `"${day}" has no FULL_BODY block. At ${daysPerWeek} day(s)/week, system-prompt.ts §15 requires every session to be FULL_BODY — an isolated split at this frequency silently drops whole patterns for the week (a real bug this caused live).`
        );
      }
    }
    return;
  }

  const hasLegs = days.some((day) => {
    const tags = dayFocusTags.get(day)!;
    return tags.has("LEGS") || /\bleg|lower body/i.test(day);
  });
  if (!hasLegs) {
    throw new Error(
      `No day in this ${daysPerWeek}-day split trains Legs. Per system-prompt.ts §15, every split of 3+ days/week includes a real Legs day (folded into Pull day at 3 days/week is the one exception, still present as content, not skipped) — this program silently drops the whole pattern.`
    );
  }
}

// Direct build (2026-09-16): the athlete-fit checks that only make sense
// once every block is freshly authored rather than cloned. These take the
// athlete's REAL numbers as an argument rather than fetching them —
// deliberately: the caller (proposeNewProgram.ts's handler) fetches
// assessment_raw/get_workout_logs itself via userClient, the authoritative
// source, and never trusts a model-reported number for these checks. That
// split is also what keeps this function pure and Jest-testable without a
// database, same as everything else in this file.
export interface SkillFitCheckpoint {
  skill: string;
  checkpointExercise: string;
  maxHoldSeconds?: number | null;
  maxReps?: number | null;
}

export interface AthleteFitContext {
  pullUpsMax: number | null;
  dipsMax: number | null;
  pushUpsMax: number | null;
  muscleUpsMax: number | null;
  skills: SkillFitCheckpoint[];
  // Lowercase exercise name -> last logged weight_used. Only exercises with
  // real logged history appear here — a brand-new athlete's map is empty,
  // which is exactly why this check only fires when a real number exists to
  // compare against (see below); "no history yet" is the prompt's "ask ONE
  // question" case, which nothing here can verify mechanically.
  loggedWeights?: Record<string, number>;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

const TRACKED_PATTERNS: Array<{ key: keyof AthleteFitContext; exerciseName: string }> = [
  { key: "pullUpsMax", exerciseName: "Pull Ups (Normal Grip)" },
  { key: "dipsMax", exerciseName: "Dips" },
  { key: "pushUpsMax", exerciseName: "Push Ups" },
  { key: "muscleUpsMax", exerciseName: "Muscle Up" },
];

export function validateAthleteFit(blocks: ClaudeBlock[], fit: AthleteFitContext): void {
  const all: Array<{ ex: ClaudeBlock["exercises"][number]; day: string; phase: string }> = [];
  for (const block of blocks ?? []) {
    const { day, phase } = getBlockParts(block);
    for (const ex of block.exercises ?? []) all.push({ ex, day, phase });
  }
  const nameIs = (name: string | undefined, target: string) => (name ?? "").trim().toLowerCase() === target.toLowerCase();

  // muscle_ups >= 3: no band cue on Muscle Up. §8: band assistance is
  // "Muscle Up" plus a note, never a separate exercise name — so the cue
  // lives in the exercise's own notes field, checked as free text here.
  if (fit.muscleUpsMax !== null && fit.muscleUpsMax >= 3) {
    for (const { ex, day, phase } of all) {
      if (nameIs(ex.name, "Muscle Up") && /\bband\b/i.test(ex.notes ?? "")) {
        throw new Error(
          `"${day} | ${phase}" cues a band on Muscle Up, but this athlete's assessment_raw shows ${fit.muscleUpsMax} strict muscle-ups — band assistance is for someone who can't yet do the movement unassisted. Remove the band cue.`
        );
      }
    }
  }

  // pull_ups = 0: no unassisted Pull Ups (Normal Grip) as programmed work
  // anywhere — they can't do the movement yet, full stop.
  if (fit.pullUpsMax === 0) {
    for (const { ex, day, phase } of all) {
      if (nameIs(ex.name, "Pull Ups (Normal Grip)")) {
        throw new Error(
          `"${day} | ${phase}" programs Pull Ups (Normal Grip), but this athlete's assessment_raw shows 0 strict pull-ups. Use Banded Pull Ups or another step from system-prompt.ts §9's ladder instead.`
        );
      }
    }
  }

  // Skill checkpoints: the confirmed checkpoint exercise must actually
  // appear, and its own hold/reps target must respect the confirmed max.
  for (const skill of fit.skills ?? []) {
    const matches = all.filter(({ ex }) => nameIs(ex.name, skill.checkpointExercise));
    if (matches.length === 0) {
      throw new Error(
        `No block uses "${skill.checkpointExercise}", the confirmed checkpoint for the ${skill.skill} goal. Use the exact checkpoint the athlete confirmed, not a different step in that skill line.`
      );
    }
    for (const { ex, day, phase } of matches) {
      if (skill.maxHoldSeconds != null) {
        const holdVal = toNumberOrNull(ex.hold_seconds);
        if (holdVal !== null && holdVal > skill.maxHoldSeconds) {
          throw new Error(
            `"${day} | ${phase}" sets ${skill.checkpointExercise} to a ${holdVal}s hold, above this athlete's confirmed max of ${skill.maxHoldSeconds}s. Start at or below their real max, never above it.`
          );
        }
      }
      if (skill.maxReps != null) {
        const repsVal = toNumberOrNull(ex.reps);
        if (repsVal !== null && repsVal >= skill.maxReps) {
          throw new Error(
            `"${day} | ${phase}" sets ${skill.checkpointExercise} to ${repsVal} reps, at or above this athlete's confirmed max of ${skill.maxReps}. Program below their tested max, never at or above it.`
          );
        }
      }
    }
  }

  // Reps per set below the athlete's tested max, for every pattern
  // assessment_raw actually tracks. Mirrors the skill-checkpoint rule
  // above, generalized to the four core patterns rather than a named goal.
  for (const { key, exerciseName } of TRACKED_PATTERNS) {
    const max = fit[key] as number | null;
    if (max === null || max === undefined) continue;
    for (const { ex, day, phase } of all) {
      if (!nameIs(ex.name, exerciseName)) continue;
      const repsVal = toNumberOrNull(ex.reps);
      if (repsVal !== null && repsVal >= max) {
        throw new Error(
          `"${day} | ${phase}" sets ${exerciseName} to ${repsVal} reps, at or above this athlete's tested max of ${max}. Program below their real max — that's the whole point of testing it.`
        );
      }
    }
  }

  // Weighted work needs a real number somewhere, once one is known. Only
  // fires when loggedWeights actually has this exact exercise — a
  // brand-new weighted exercise with no logged history is the prompt's
  // "ask ONE question" case, which no structural check here can verify.
  if (fit.loggedWeights) {
    for (const { ex, day, phase } of all) {
      const key = (ex.name ?? "").trim().toLowerCase();
      const logged = fit.loggedWeights[key];
      if (ex.is_weighted && logged !== undefined && !/\d/.test(ex.notes ?? "")) {
        throw new Error(
          `"${day} | ${phase}"'s ${ex.name} is weighted and this athlete last logged ${logged}kg, but no weight number appears in its notes. Write the real target weight following system-prompt.ts §18's weighted-progress phrase bank — never a bare "+load".`
        );
      }
    }
  }
}

// Direct build (2026-09-16): the build brief propose_new_program requires
// before it will write anything. Shared between propose_new_program.ts
// (the real gate — every field re-checked there, every time) and the
// optional save_build_brief.ts (a "here's what I'll build" confirmation
// step, NOT itself the gate — see that file's own comment for why a
// separate tool call can't be trusted as the enforcement point under
// system-prompt.ts §2's "each turn is fresh" rule).
export interface BuildBrief {
  goal: string;
  skills: SkillFitCheckpoint[];
  trial_focus: boolean;
  days_per_week: number;
  split_days: string[];
  equipment: string[];
  pacing: "day_by_day" | "direct";
}

export const BUILD_BRIEF_SCHEMA = {
  type: "object" as const,
  description:
    "The confirmed build brief. Required, in full, before this will build anything — every field here must already be a real, athlete-confirmed answer (system-prompt.ts §11), never a guess written just to satisfy this schema. If something genuinely isn't known yet, go ask for it first; don't call this tool until it is.",
  properties: {
    goal: { type: "string", description: 'The athlete\'s stated goal for this program, in their own terms, e.g. "handstand and front lever, keep progressing to the trial".' },
    skills: {
      type: "array",
      description: "One entry per named skill goal. Empty array if no skill goal was named.",
      items: {
        type: "object",
        properties: {
          skill: { type: "string", description: 'e.g. "handstand", "front_lever".' },
          checkpoint_exercise: { type: "string", description: "The exact library exercise name confirmed as this athlete's current checkpoint in that skill line (system-prompt.ts §8). Pre-fill your own guess from get_user_context's static_pbs, but only send it here after the athlete has actually confirmed it." },
          max_hold_seconds: { type: "integer", description: "The athlete's confirmed real max hold, for a hold-based checkpoint." },
          max_reps: { type: "integer", description: "The athlete's confirmed real max reps, for a rep-based checkpoint." },
        },
        required: ["skill", "checkpoint_exercise"],
      },
    },
    trial_focus: { type: "boolean", description: "Whether the athlete also wants to keep progressing toward their tier trial alongside any skill work (system-prompt.ts §8)." },
    days_per_week: { type: "integer", description: "Confirmed training days per week." },
    split_days: { type: "array", items: { type: "string" }, description: 'The real category per day, in order, e.g. ["PULL", "LEGS", "PUSH", "FULL_BODY"] — system-prompt.ts §15.' },
    equipment: { type: "array", items: { type: "string" }, description: 'Confirmed equipment, e.g. ["bar", "rings", "bands"].' },
    pacing: { type: "string", enum: ["day_by_day", "direct"], description: "Which pacing the athlete chose (system-prompt.ts §11)." },
  },
  required: ["goal", "skills", "trial_focus", "days_per_week", "split_days", "equipment", "pacing"],
};

// Manual, runtime enforcement of BUILD_BRIEF_SCHEMA's `required` list.
// JSON-schema `required` shapes what the model is prompted to send; it is
// not a guarantee about what actually arrives in `input` — this codebase's
// established pattern (validateBlockStructure, resolveExerciseIds) is to
// never trust that alone, so this re-checks every field itself and names
// the exact one missing, same-turn, same as everywhere else in this file.
export function validateBuildBrief(brief: unknown): BuildBrief {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    throw new Error(
      `Missing "brief" — propose_new_program requires the full build brief (goal, skills, trial_focus, days_per_week, split_days, equipment, pacing) before it will build anything. See system-prompt.ts §11.`
    );
  }
  const b = brief as Record<string, unknown>;
  const missing = (["goal", "skills", "trial_focus", "days_per_week", "split_days", "equipment", "pacing"] as const).filter(
    (field) => b[field] === undefined || b[field] === null
  );
  if (missing.length > 0) {
    throw new Error(`brief is missing: ${missing.join(", ")}. Ask the athlete for whatever you genuinely don't have yet (system-prompt.ts §11) — never guess a value just to fill this schema.`);
  }

  const skills = b.skills;
  if (!Array.isArray(skills)) {
    throw new Error(`brief.skills must be an array (empty if no skill goal was named).`);
  }
  for (const [i, raw] of skills.entries()) {
    const skill = (raw ?? {}) as Record<string, unknown>;
    if (!skill.skill || !skill.checkpoint_exercise) {
      throw new Error(`brief.skills[${i}] is missing "skill" or "checkpoint_exercise" — every named skill needs both, confirmed with the athlete.`);
    }
    if (skill.max_hold_seconds == null && skill.max_reps == null) {
      throw new Error(`brief.skills[${i}] ("${skill.skill}") has no max_hold_seconds or max_reps — every named skill needs a confirmed real max (pre-fill from static_pbs, then confirm with the athlete; never omit it).`);
    }
  }

  if (!Array.isArray(b.split_days) || (b.split_days as unknown[]).length === 0) {
    throw new Error(`brief.split_days must be a non-empty array of the real category per day (system-prompt.ts §15).`);
  }
  if (!Array.isArray(b.equipment)) {
    throw new Error(`brief.equipment must be an array (can be empty for bodyweight-only).`);
  }
  if (b.pacing !== "day_by_day" && b.pacing !== "direct") {
    throw new Error(`brief.pacing must be "day_by_day" or "direct" — whichever the athlete actually chose (system-prompt.ts §11).`);
  }
  if (typeof b.days_per_week !== "number" || b.days_per_week < 1 || b.days_per_week > 7) {
    throw new Error(`brief.days_per_week must be a real number between 1 and 7.`);
  }

  return b as unknown as BuildBrief;
}

// Resolve exercise NAMES to real library ids, server-side.
//
// Why names and not ids: routing UUIDs through the model was expensive and
// fragile. `"exercise_id": "5b677e6b-73eb-44e8-98f5-e0dd3a581604"` is ~20
// output tokens against ~3 for `"name": "Dips"`, and a full program carries
// ~80 of them — well over a thousand tokens of pure identifier, generated
// slowly and billed on every turn it is re-sent. Worse, it forced a whole
// search_exercises round trip whose only purpose was fetching ids, and that
// result then rode along in the message array for the rest of the exchange.
// It also created a bug class that actually shipped: the model inventing an
// id-shaped string, or writing a name into the id field.
//
// Resolving here removes all of that. The model writes names it already
// knows; the server decides what is real. A hallucinated exercise cannot
// become a bad id — it simply fails to resolve.
//
// This never creates library rows. The human-coach import path does
// (ProgramImportParser auto-inserts on a name miss), which is correct for a
// coach authoring their own content and wrong for an athlete chat — it
// would let a typo write junk into a library 188 curated exercises depend
// on, one row per affected athlete. Unresolved names throw, with near-miss
// suggestions so the model can fix itself in one retry.
export async function resolveExerciseIds(
  userClient: { from: (t: string) => any },
  blocks: ClaudeBlock[]
): Promise<Map<string, string>> {
  const wanted = new Set<string>();
  for (const block of blocks ?? []) {
    for (const ex of block.exercises ?? []) {
      const name = typeof ex.name === "string" ? ex.name.trim() : "";
      if (name) wanted.add(name);
      else if (!isUuid(ex.exercise_id)) {
        throw new Error(
          `An exercise in block "${block.day_name ?? block.name ?? "?"}" has no usable "name". Every exercise needs its exact library name.`
        );
      }
    }
  }
  const resolved = new Map<string, string>();
  if (wanted.size === 0) return resolved;

  const names = [...wanted];
  const { data: exact, error } = await userClient
    .from("exercise_library")
    .select("id, name")
    .in("name", names);
  if (error) throw new Error(`Exercise lookup failed: ${error.message}`);
  for (const row of exact ?? []) resolved.set(row.name.toLowerCase(), row.id);

  // Case/whitespace-tolerant second pass. The library holds deliberate
  // misspellings ("Pesudo Push Ups", "Elvated Pike Push Ups") that the model
  // is told to copy verbatim; a casing slip should not fail a whole program.
  const misses = names.filter((n) => !resolved.has(n.toLowerCase()));
  if (misses.length > 0) {
    const retried = await Promise.all(
      misses.map(async (n) => {
        const { data } = await userClient
          .from("exercise_library")
          .select("id, name")
          .ilike("name", n)
          .limit(1);
        return { n, row: data?.[0] ?? null };
      })
    );
    for (const { n, row } of retried) if (row) resolved.set(n.toLowerCase(), row.id);
  }

  const unresolved = names.filter((n) => !resolved.has(n.toLowerCase()));
  if (unresolved.length > 0) {
    const suggestions = await Promise.all(
      unresolved.slice(0, 5).map(async (n) => {
        const token = n.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? n;
        const { data } = await userClient
          .from("exercise_library")
          .select("name")
          .ilike("name", `%${token}%`)
          .limit(3);
        const near = (data ?? []).map((r: { name: string }) => r.name);
        return near.length ? `"${n}" — did you mean: ${near.join(", ")}?` : `"${n}" — no close match`;
      })
    );
    throw new Error(
      `These exercises are not in the library, so the program was not built: ${suggestions.join(" | ")}. ` +
      `Use an exact library name (search_exercises to browse). Never invent one — substitute the nearest real exercise and tell the athlete you substituted.`
    );
  }
  return resolved;
}

// Every numeric field here reaches Postgres through a raw cast in
// _insert_client_program_blocks — `(v_exercise->>'hold_seconds')::int` and
// friends. An empty string is the app's own stored convention for "not
// applicable" (see warrior-program-week-export-import-format.md, and the
// schema descriptions below used to instruct exactly that), but `''::int`
// raises "invalid input syntax for type integer" — which surfaced to the
// athlete as a raw Postgres error AFTER they tapped Start, on a card that
// looked perfect. COALESCE does not rescue it either: the cast is evaluated
// before COALESCE sees it, so block order_index/week_number carry the same
// hazard, not just the exercise fields.
//
// Normalising here (the AI path's own boundary) rather than in the shared
// SQL keeps the human-coach import path, which already handles "" in JS,
// completely untouched. Anything unparseable becomes NULL rather than an
// exception, so a stray "AMRAP" or "10-12" degrades to an empty cell
// instead of destroying the whole write.
export function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// Shared by transformBlocksForInsert below and replaceBlockExercises.ts
// (4.4) — the latter replaces one block's exercise list in isolation, with
// no block-level name/notes/CONCEPT wrapper to build, just this same
// per-exercise id-resolution + numeric-field normalization.
export function transformExercisesForInsert(
  exercises: ClaudeBlock["exercises"],
  idMap: Map<string, string>
): Record<string, unknown>[] {
  return (exercises ?? []).map((ex) => ({
    // Server-resolved id wins over anything the model supplied. A
    // model-written id is only trusted when no name was given at all.
    exercise_id: idMap.get((ex.name ?? "").trim().toLowerCase()) ?? ex.exercise_id,
    sets: toIntOrNull(ex.sets),
    reps: toIntOrNull(ex.reps),
    rest_seconds: toIntOrNull(ex.rest_seconds),
    hold_seconds: toIntOrNull(ex.hold_seconds),
    is_weighted: ex.is_weighted ?? false,
    notes: ex.notes,
    order_index: toIntOrNull(ex.order_index) ?? 0,
  }));
}

// Inverse of transformBlocksForInsert's CONCEPT-tag construction below —
// parses a stored block's `notes` column back into the same
// {metadata, coach_notes} shape BLOCKS_SCHEMA uses, so get_workout_detail
// can hand the AI back exactly the structure it would have written itself
// (timing_system/structure/etc, never previously surfaced — see
// getWorkoutDetail.ts). Mirrors BlockConceptParser.parse
// (src/lib/BlockConceptParser.ts) rather than importing it: that file lives
// in the RN app, this runs in a Deno edge function, different runtimes,
// same stored string format.
export function parseConceptNotes(rawNotes: string | null | undefined): { metadata: Record<string, unknown>; coach_notes: string } {
  if (!rawNotes) return { metadata: {}, coach_notes: "" };
  const match = rawNotes.match(/^\[CONCEPT:(.*?)\](.*)$/s);
  if (!match) return { metadata: {}, coach_notes: rawNotes.trim() };
  try {
    const parsed = JSON.parse(match[1]);
    const metadata = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return { metadata, coach_notes: match[2] ? match[2].trim() : "" };
  } catch {
    return { metadata: {}, coach_notes: rawNotes.replace(/^\[CONCEPT:.*?\]/, "").trim() };
  }
}

export function transformBlocksForInsert(
  blocks: ClaudeBlock[],
  idMap: Map<string, string>
): Record<string, unknown>[] {
  return blocks.map((block) => {
    const name = block.name ?? (block.day_name && block.block_name
      ? `${block.day_name} | ${block.block_name}`
      : block.day_name ?? block.block_name ?? "WORKOUT ROUTINE");

    const metadata = block.metadata ?? {};
    const cleanNotes = block.coach_notes ?? "";
    const notes = `[CONCEPT:${JSON.stringify(metadata)}] ${cleanNotes}`.trim();

    return {
      name,
      notes,
      order_index: toIntOrNull(block.order_index) ?? 0,
      week_number: toIntOrNull(block.week_number) ?? 1,
      exercises: transformExercisesForInsert(block.exercises, idMap),
    };
  });
}

// Shared JSON schema fragment for the "blocks" tool parameter — used by
// propose_new_program, append_week, and add_block_to_week so their
// input_schema stays in sync.
//
// The CONCEPT metadata contract lives here, in the schema, not as a prose
// table in the system prompt. Two failure classes this closes: (1) a field
// existing in BlockConceptParser.ts (src/lib/BlockConceptParser.ts) but
// missing from prompt prose, so the model never sends it — reproduced for
// time_cap_min/ladder_start/ladder_sub/ladder_direction, which the prompt
// text used to omit entirely; (2) prompt prose drifting from the schema
// over separate edits — reproduced for timing_system, where prose once
// listed "ladder" as a valid value alongside straight_set/amrap/fortime/
// tabata, when it's actually a `structure` value per BlockConceptParser.ts,
// not a `timing_system` one. The schema is the only place these values are
// enumerated now, so that specific class of drift can't happen again.
//
// sets/reps/rest_seconds/hold_seconds are strings, matching the real
// warrior-program-week-export-import-format.md convention (human-authored
// templates already store "4"/"15"/"60", not 4/15/60) — both the DB write
// (`(v_exercise->>'sets')::int`) and BlockConceptParser's own metadata
// types (`string | number` unions) tolerate either form, so this won't
// break a write either way; it's for AI-written and human-written blocks
// to store the same shape in the same column, not a correctness fix.
export const BLOCKS_SCHEMA = {
  type: "array" as const,
  items: {
    type: "object" as const,
    properties: {
      day_name: { type: "string", description: 'e.g. "PULL DAY 1"' },
      block_name: { type: "string", description: 'e.g. "Strength"' },
      order_index: { type: "integer", description: "Unique within this week only" },
      week_number: { type: "integer", description: "Only meaningful for propose_new_program — defaults to 1, and should stay 1 unless the athlete explicitly asked for multiple weeks written upfront. append_week always writes the next week automatically; add_block_to_week ignores this and always lands in the week you specified." },
      metadata: {
        type: "object",
        description: "The CONCEPT block tag. timing_system + structure + focus_tag + is_weighted are always required; the rest are conditional — see each field.",
        properties: {
          timing_system: {
            type: "string",
            enum: ["straight_set", "amrap", "fortime", "tabata"],
            description: "Required. NOT ladder — ladder is a structure value, never a timing_system value. A ladder block pairs structure:\"ladder\" with one of these four, usually fortime.",
          },
          structure: {
            type: "string",
            enum: ["single", "superset", "circuit", "ladder"],
            description: "Required.",
          },
          focus_tag: {
            type: "string",
            enum: ["PULL", "PUSH", "LEGS", "CORE", "SKILLS", "FULL_BODY", "REST"],
            description: "Required. SKILLS for dedicated skill days, REST for rest-day blocks (empty exercises array).",
          },
          is_weighted: {
            type: "boolean",
            description: "Required. Whether the block as a whole is weighted-strength-focused — can be true even if some individual exercises in it are bodyweight, but if ANY exercise in the block is weighted, this must be true.",
          },
          rounds: {
            type: "string",
            description: "Required when structure is circuit, superset, or ladder — the round count as a string, e.g. \"3\". When a block has rounds, each exercise's own sets is \"1\": the block's rounds drive the repetition, not the exercise's sets.",
          },
          rest_after_round: {
            type: "integer",
            description: "Seconds of rest after each full round, when rounds is set.",
          },
          time_cap_min: {
            type: "integer",
            description: "Required when timing_system is fortime or amrap. The time cap in minutes.",
          },
          ladder_start: {
            type: "integer",
            description: "Required when structure is ladder — the starting rep count.",
          },
          ladder_sub: {
            type: "integer",
            description: "Required when structure is ladder — how much the rep count changes each round.",
          },
          ladder_direction: {
            type: "string",
            enum: ["up", "down"],
            description: "Required when structure is ladder. down: start highest, drop each round — best for bodyweight moves that fatigue fast. up: start low, build — best for weighted/accessory work.",
          },
          tabata_work_seconds: { type: "integer", description: "Required when timing_system is tabata." },
          tabata_rest_seconds: { type: "integer", description: "Required when timing_system is tabata." },
          tabata_rounds: { type: "integer", description: "Required when timing_system is tabata." },
          is_tier_trial: {
            type: "boolean",
            description: "Almost never used — leave false/omitted. Setting this true replaces the ENTIRE block with a bare \"Start Official Trial\" button in the app; every exercise you wrote in this block becomes invisible to the athlete, permanently, not just during a preview. A trial-prep block (practising next_trial's real movements) is written as a completely normal block with real exercises/sets/reps and this field left false — the trial-relevant content is what you write, not this flag.",
          },
        },
        required: ["timing_system", "structure", "focus_tag", "is_weighted"],
      },
      coach_notes: { type: "string", description: "Freeform cue text for this block — Arabic for AMRAP/For Time/weighted-max-effort blocks per the system prompt's cue table, English elsewhere." },
      exercises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "REQUIRED. The exact library name, e.g. \"Pull Ups (Normal Grip)\". The server resolves this to the real exercise id — you do not need to look up or send an id. Copy library spellings verbatim, including deliberate misspellings like \"Pesudo Push Ups\". If a name does not exist you will get an error listing near matches; substitute a real exercise and tell the athlete, never invent one." },
            exercise_id: { type: "string", description: "Not needed — omit it. `name` is resolved server-side." },
            sets: { type: "string", description: 'e.g. "3". String, not integer — matches the app\'s stored format.' },
            reps: { type: "string", description: 'e.g. "10". String, not integer. For a rep-based exercise this is required, including inside a ladder block (structure: "ladder") — the block\'s ladder_start/ladder_sub/ladder_direction describe how the round-by-round rep count changes, but nothing else in the app reads that back into a rep target during logging, so put the block\'s ladder_start value here (the starting rep count); never leave reps blank on a rep-based exercise just because the block has a ladder. Does NOT apply to a hold-based exercise (a stretch, a plank, any static hold) — that exercise has hold_seconds instead and reps is correctly omitted, never set to "1" as a placeholder.' },
            rest_seconds: { type: "string", description: 'e.g. "60", or "0" inside a circuit/superset. Omit the field entirely if rest does not apply — do not send an empty string.' },
            hold_seconds: { type: "string", description: 'e.g. "30" for a static hold. Omit the field entirely for anything that is not a timed hold — do not send an empty string.' },
            is_weighted: { type: "boolean", description: "The source of truth for whether THIS exercise uses external load — independent of the block-level is_weighted." },
            notes: { type: "string" },
            order_index: { type: "integer" },
          },
          required: ["name"],
        },
      },
    },
    required: ["exercises"],
  },
};
