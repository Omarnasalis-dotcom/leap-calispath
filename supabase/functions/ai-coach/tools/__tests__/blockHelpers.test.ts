// Jest coverage for the pure logic in blockHelpers.ts — no Supabase client,
// no network, nothing Deno-specific. This file has zero imports of its own
// (confirmed before writing this), so it runs fine under the existing
// jest-expo setup even though it lives under supabase/functions/, not src/.
//
// What this does NOT cover, and can't without real Deno test infra:
// resolveExerciseIds (needs a live/mocked Supabase client), and anything in
// updateBlockStructure.ts's or the other tools' .handler functions that
// touches userClient directly. The pure metadata-merge logic those handlers
// use (parseConceptNotes + a shallow object spread) is covered below by
// testing parseConceptNotes directly and replicating the merge inline —
// that's the actual behavior at risk of a silent regression, not the
// network call around it.
import {
  validateBlockStructure,
  validateExerciseList,
  warnSplitCoverage,
  warnSkillCoverage,
  warnTimingMismatch,
  warnUneditedFromSource,
  validateAthleteFit,
  validateBuildBrief,
  getBlockParts,
  computeDayPosition,
  parseConceptNotes,
  normalizeBlockStructure,
  levelBandForTier,
  buildServerWarmUpCoolDown,
  assembleDayWithServerBlocks,
} from "../blockHelpers";

// Minimal always-valid block, overridable per test. Real shape mirrors what
// propose_new_program/append_week/update_block_structure all pass through
// validateBlockStructure with.
function makeBlock(overrides: {
  name?: string;
  metadata?: Record<string, unknown>;
  exercises?: Array<Record<string, unknown>>;
} = {}) {
  return {
    name: overrides.name ?? "PULL DAY 1 | Strength - 1",
    metadata: {
      timing_system: "straight_set",
      structure: "single",
      focus_tag: "PULL",
      is_weighted: false,
      ...overrides.metadata,
    },
    exercises: overrides.exercises ?? [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }],
  };
}

describe("validateBlockStructure — conditional metadata (added 2026-09-16)", () => {
  it("rejects a circuit block with no rounds", () => {
    expect(() =>
      validateBlockStructure([makeBlock({ metadata: { structure: "circuit" } })] as never, { requireDayPhases: false })
    ).toThrow(/no metadata\.rounds/);
  });

  it("accepts a circuit block once rounds is set and every exercise's sets is \"1\"", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "circuit", rounds: "3" }, exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "8" }] })] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });

  it("rejects a fortime block with no time_cap_min", () => {
    expect(() =>
      validateBlockStructure([makeBlock({ metadata: { timing_system: "fortime" } })] as never, { requireDayPhases: false })
    ).toThrow(/time_cap_min/);
  });

  it("rejects a tabata block missing some (not all) of its three fields", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { timing_system: "tabata", tabata_work_seconds: 20 } })] as never,
        { requireDayPhases: false }
      )
    ).toThrow(/tabata_rest_seconds, tabata_rounds/);
  });

  it("accepts a tabata block with all three fields present", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { timing_system: "tabata", tabata_work_seconds: 20, tabata_rest_seconds: 10, tabata_rounds: 8 } })] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });

  it("rejects a ladder structure missing ladder_start/ladder_sub/ladder_direction", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "ladder", rounds: "3" }, exercises: [{ name: "Pull Ups (Normal Grip)", reps: "10" }] })] as never,
        { requireDayPhases: false }
      )
    ).toThrow(/ladder_start, ladder_sub, ladder_direction/);
  });

  it("rejects a ladder block where an exercise has no reps", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({
          metadata: { structure: "ladder", rounds: "3", ladder_start: 10, ladder_sub: 2, ladder_direction: "down" },
          exercises: [{ name: "Pull Ups (Normal Grip)" }],
        })] as never,
        { requireDayPhases: false }
      )
    ).toThrow(/ladder block with an exercise missing reps/);
  });

  it("accepts a fully-specified fortime ladder block", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({
          metadata: {
            structure: "ladder", timing_system: "fortime", rounds: "3", time_cap_min: 12,
            ladder_start: 22, ladder_sub: 4, ladder_direction: "down",
          },
          exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "22" }],
        })] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });

  it("skips every conditional-metadata check for a REST block, even one with no exercises", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ name: "REST DAY 4 | Rest", metadata: { focus_tag: "REST", structure: "circuit" }, exercises: [] })] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });

  it("rejects a \"single\" structure block that also carries a stray metadata.rounds (added 2026-09-16)", () => {
    expect(() =>
      validateBlockStructure([makeBlock({ metadata: { structure: "single", rounds: "3" } })] as never, { requireDayPhases: false })
    ).toThrow(/structure "single" but also metadata\.rounds/);
  });

  it("accepts a \"single\" structure block with no rounds at all", () => {
    expect(() =>
      validateBlockStructure([makeBlock({ metadata: { structure: "single" } })] as never, { requireDayPhases: false })
    ).not.toThrow();
  });
});

describe("levelBandForTier (added 2026-09-17, auto-repair)", () => {
  it("maps tiers 0-2 to beginner, 3-5 to intermediate, 6-9 to advanced", () => {
    expect(levelBandForTier(0)).toBe("beginner");
    expect(levelBandForTier(2)).toBe("beginner");
    expect(levelBandForTier(3)).toBe("intermediate");
    expect(levelBandForTier(5)).toBe("intermediate");
    expect(levelBandForTier(6)).toBe("advanced");
    expect(levelBandForTier(9)).toBe("advanced");
  });

  it("defaults to beginner for a missing/non-numeric tier", () => {
    expect(levelBandForTier(undefined)).toBe("beginner");
    expect(levelBandForTier(null)).toBe("beginner");
  });
});

// Minimal stub of the duck-typed client normalizeBlockStructure/
// resolveExerciseIds expect — real shape is `.from(table).select(cols).in(col, values)`
// resolving `{ data }`. `resolvableNames` simulates exercise_library's real
// rows; anything not listed behaves exactly like a name that doesn't
// resolve live, same as a stale/renamed library row would.
function makeMockClient(resolvableNames: string[]) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: (_col: string, values: string[]) =>
          Promise.resolve({ data: values.filter((v) => resolvableNames.includes(v)).map((name) => ({ name })) }),
      }),
    }),
  };
}

const ALL_PAD_NAMES_RESOLVABLE = [
  "Banded Arm Circles", "Inchworm", "banded Shoulder External Rotation", "wrist pressure", "Scapula Push Ups",
  "Reverse Lunges", "Hip Flexors Stretch",
  "Childe Pose", "Shoulder stretch", "Child Pose Sided", "Lat Stretch SH Opener",
  "Pancake Stretch", "Laying Hamstring Stretch", "Adductor Stretch",
  "Tuck Overhead Reach Foam roller", "Prone Shoulder opener", "Pike Walk out",
];
const REAL_CLIENT = makeMockClient(ALL_PAD_NAMES_RESOLVABLE);

describe("normalizeBlockStructure (added 2026-09-17): auto-repairs trivial structure gaps instead of rejecting", () => {
  it("defaults a circuit block's missing rounds to \"3\" and forces every exercise's sets to \"1\"", async () => {
    const block = makeBlock({
      metadata: { structure: "circuit" },
      exercises: [
        { name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" },
        { name: "Dips", sets: "3", reps: "10" },
      ],
    });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", REAL_CLIENT);
    expect((block.metadata as Record<string, unknown>).rounds).toBe("3");
    expect(block.exercises.every((ex) => ex.sets === "1")).toBe(true);
    expect(fixes).toEqual([expect.stringContaining("no rounds set")]);
    expect(() => validateBlockStructure([block] as never, { requireDayPhases: false })).not.toThrow();
  });

  it("leaves an already-specified rounds value untouched", async () => {
    const block = makeBlock({
      metadata: { structure: "superset", rounds: "5" },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "8" }],
    });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", REAL_CLIENT);
    expect((block.metadata as Record<string, unknown>).rounds).toBe("5");
    expect(fixes).toEqual([]);
  });

  it("2026-09-18 (per-day-latency pass): when the model supplies rounds itself but gets an exercise's sets wrong, corrects it instead of leaving it for a hard reject", async () => {
    const block = makeBlock({
      metadata: { structure: "circuit", rounds: "3" },
      exercises: [
        { name: "Pull Ups (Normal Grip)", sets: "3", reps: "8" }, // wrong — rounds drives repetition
        { name: "Dips", sets: "1", reps: "10" }, // already correct
      ],
    });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", REAL_CLIENT);
    expect(block.exercises.every((ex) => ex.sets === "1")).toBe(true);
    expect(fixes).toEqual([expect.stringContaining('metadata.rounds is "3", so every exercise\'s sets must be "1"')]);
    expect(() => validateBlockStructure([block] as never, { requireDayPhases: false })).not.toThrow();
  });

  it("model-supplied rounds with every exercise already at sets \"1\" — no fix needed, no note", async () => {
    const block = makeBlock({
      metadata: { structure: "circuit", rounds: "3" },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "8" }],
    });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", REAL_CLIENT);
    expect(fixes).toEqual([]);
  });

  it("defaults amrap/fortime time_cap_min by level band", async () => {
    const beginnerBlock = makeBlock({ metadata: { timing_system: "amrap" } });
    await normalizeBlockStructure([beginnerBlock] as never, "beginner", REAL_CLIENT);
    expect((beginnerBlock.metadata as Record<string, unknown>).time_cap_min).toBe(6);

    const intermediateBlock = makeBlock({ metadata: { timing_system: "fortime" } });
    await normalizeBlockStructure([intermediateBlock] as never, "intermediate", REAL_CLIENT);
    expect((intermediateBlock.metadata as Record<string, unknown>).time_cap_min).toBe(10);

    const advancedBlock = makeBlock({ metadata: { timing_system: "amrap" } });
    await normalizeBlockStructure([advancedBlock] as never, "advanced", REAL_CLIENT);
    expect((advancedBlock.metadata as Record<string, unknown>).time_cap_min).toBe(12);
  });

  it("does not override an already-specified time_cap_min", async () => {
    const block = makeBlock({ metadata: { timing_system: "amrap", time_cap_min: 20 } });
    const fixes = await normalizeBlockStructure([block] as never, "beginner", REAL_CLIENT);
    expect((block.metadata as Record<string, unknown>).time_cap_min).toBe(20);
    expect(fixes).toEqual([]);
  });

  it("defaults a ladder block's missing ladder_sub/ladder_direction, leaving ladder_start alone", async () => {
    const block = makeBlock({
      metadata: { structure: "ladder", rounds: "3", ladder_start: 10 },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "10" }],
    });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", REAL_CLIENT);
    const meta = block.metadata as Record<string, unknown>;
    expect(meta.ladder_sub).toBe(2);
    expect(meta.ladder_direction).toBe("down");
    expect(meta.ladder_start).toBe(10);
    expect(fixes).toEqual([
      expect.stringContaining("no ladder_sub"),
      expect.stringContaining("no ladder_direction"),
    ]);
    // Still rejects for real: ladder_start was never auto-filled by this pass.
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "ladder", rounds: "3" }, exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "10" }] })] as never,
        { requireDayPhases: false }
      )
    ).toThrow(/missing ladder_start/);
  });

  it("tops up a non-LEGS Cool-Down with only 2 exercises to 4, using the standard pad list, no duplicates", async () => {
    const block = makeBlock({
      name: "PULL DAY 1 | Cool-Down",
      metadata: { focus_tag: "PULL" },
      exercises: [{ name: "Lat Stretch SH Opener", hold_seconds: "30" }, { name: "Dips" }],
    });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", REAL_CLIENT);
    // Lat Stretch SH Opener is already present — must not be added twice.
    const names = block.exercises.map((ex) => ex.name);
    expect(names.filter((n) => n === "Lat Stretch SH Opener")).toHaveLength(1);
    expect(block.exercises.length).toBe(4); // COOLDOWN_PAD_TARGET
    expect(names).toEqual(["Lat Stretch SH Opener", "Dips", "Childe Pose", "Shoulder stretch"]);
    expect(block.exercises.slice(2).every((ex) => ex.hold_seconds === "30" && ex.sets === "1")).toBe(true);
    expect(fixes).toEqual([expect.stringContaining("topped up with")]);
    expect(() => validateBlockStructure([block] as never, { requireDayPhases: false })).not.toThrow();
  });

  it("tops up a LEGS Warm-Up using the LEGS-specific pad list, reps-based", async () => {
    const block = makeBlock({
      name: "LEGS DAY | Warm-Up",
      metadata: { focus_tag: "LEGS" },
      exercises: [{ name: "Jump Rope", sets: "1", reps: "30" }],
    });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", REAL_CLIENT);
    const names = block.exercises.map((ex) => ex.name);
    expect(names).toEqual(["Jump Rope", "Inchworm", "Reverse Lunges"]);
    expect(block.exercises.slice(1).every((ex) => ex.reps === "10" && ex.sets === "1" && ex.rest_seconds === "0")).toBe(true);
    expect(fixes).toEqual([expect.stringContaining("topped up with")]);
  });

  it("still hard-rejects when the pad list's names don't resolve live (stale/renamed library rows)", async () => {
    const emptyClient = makeMockClient([]); // nothing resolves
    const block = makeBlock({ name: "PULL DAY 1 | Cool-Down", metadata: { focus_tag: "PULL" }, exercises: [{ name: "Dips" }] });
    const fixes = await normalizeBlockStructure([block] as never, "intermediate", emptyClient);
    expect(fixes).toEqual([]);
    expect(block.exercises.length).toBe(1);
    expect(() => validateBlockStructure([block] as never, { requireDayPhases: false })).toThrow(/only 1 exercise/);
  });

  it("day-variety repair (2026-09-17): converts the Accessories block to superset when every block on a day is straight_set + single", async () => {
    const warmUp = makeBlock({
      name: "PULL DAY 1 | Warm-Up",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
      exercises: [{ name: "Banded Arm Circles" }, { name: "Inchworm" }, { name: "Scapula Push Ups" }],
    });
    const strength = makeBlock({
      name: "PULL DAY 1 | Strength",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }],
    });
    const accessories = makeBlock({
      name: "PULL DAY 1 | Accessories",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
      exercises: [{ name: "Dips", sets: "3", reps: "10" }, { name: "High Pull Ups", sets: "3", reps: "10" }],
    });
    const coolDown = makeBlock({
      name: "PULL DAY 1 | Cool-Down",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
      exercises: [{ name: "Childe Pose", hold_seconds: "30" }, { name: "Shoulder stretch", hold_seconds: "30" }, { name: "Child Pose Sided", hold_seconds: "30" }],
    });
    const blocks = [warmUp, strength, accessories, coolDown];
    const fixes = await normalizeBlockStructure(blocks as never, "intermediate", REAL_CLIENT);
    expect((accessories.metadata as Record<string, unknown>).structure).toBe("superset");
    // Warm-Up/Strength untouched — only the Accessories block was varied.
    expect((warmUp.metadata as Record<string, unknown>).structure).toBe("single");
    expect((strength.metadata as Record<string, unknown>).structure).toBe("single");
    expect(fixes).toEqual(expect.arrayContaining([expect.stringContaining("converted this one to a superset")]));
    // The superset conversion left rounds missing — the very next repair
    // pass in the same call must catch that too, same call, same result.
    expect(fixes).toEqual(expect.arrayContaining([expect.stringContaining("no rounds set for a superset block")]));
    expect(() => validateBlockStructure(blocks as never, { requireDayPhases: true })).not.toThrow();
  });

  it("day-variety repair: falls back to the last non-Warm-Up/Cool-Down block when there's no block literally named Accessories", async () => {
    const warmUp = makeBlock({
      name: "PUSH DAY | Warm-Up",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PUSH" },
      exercises: [{ name: "Banded Arm Circles" }, { name: "Inchworm" }, { name: "Scapula Push Ups" }],
    });
    const strength = makeBlock({
      name: "PUSH DAY | Strength",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PUSH" },
      exercises: [{ name: "Pike Push Ups", sets: "4", reps: "8" }],
    });
    const blocks = [warmUp, strength];
    await normalizeBlockStructure(blocks as never, "intermediate", REAL_CLIENT);
    expect((strength.metadata as Record<string, unknown>).structure).toBe("superset");
  });

  it("day-variety repair: leaves a single-block day alone — nothing to vary against, falls to validateBlockStructure's own backstop only if ever reached another way", async () => {
    const onlyBlock = makeBlock({
      name: "REST DAY | Rest",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
      exercises: [{ name: "Pull Ups (Normal Grip)" }],
    });
    const fixes = await normalizeBlockStructure([onlyBlock] as never, "intermediate", REAL_CLIENT);
    expect(fixes.some((f) => f.includes("converted"))).toBe(false);
    expect((onlyBlock.metadata as Record<string, unknown>).structure).toBe("single");
  });
});

describe("Day-by-day build offline fixtures (2026-09-17): day 1 alone must not misfire whole-plan checks", () => {
  it("warnSplitCoverage sees no problem building only day 1's blocks, as long as the FULL declared split_days still has a Legs day elsewhere", () => {
    // This is the exact bug the old validateSplitCoverage would have hit:
    // fed only day 1's blocks, "distinct day count" would be 1 against a
    // brief of 4, and "no Legs day" would fire on every non-Legs day 1.
    // warnSplitCoverage is fed the DECLARED plan (brief.split_days), never
    // the current call's blocks, so it doesn't have that problem.
    const fullyDeclaredSplit = ["PULL", "LEGS", "PUSH", "FULL_BODY"];
    expect(warnSplitCoverage(fullyDeclaredSplit, 4)).toEqual([]);
  });

  it("validateBlockStructure and validateAthleteFit both pass for a single day's blocks even though the brief describes a 4-day plan", () => {
    const day1Blocks = [
      makeBlock({
        name: "PULL & MUSCLE-UP DAY | Warm-Up",
        metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
        exercises: [{ name: "Banded Arm Circles" }, { name: "Inchworm" }, { name: "Scapula Push Ups" }],
      }),
      makeBlock({
        name: "PULL & MUSCLE-UP DAY | Strength",
        metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "PULL", rounds: "3" },
        exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "20" }],
      }),
      makeBlock({
        name: "PULL & MUSCLE-UP DAY | Cool-Down",
        metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
        exercises: [{ name: "Childe Pose", hold_seconds: "30" }, { name: "Shoulder stretch", hold_seconds: "30" }, { name: "Child Pose Sided", hold_seconds: "30" }],
      }),
    ];
    expect(() => validateBlockStructure(day1Blocks as never, { requireDayPhases: true })).not.toThrow();
    const fit = { pullUpsMax: 30, dipsMax: null, pushUpsMax: null, muscleUpsMax: null, skills: [], loggedWeights: {} };
    expect(validateAthleteFit(day1Blocks as never, fit as never)).toEqual([]);
  });
});

describe("validateBlockStructure — rounds implies sets \"1\" (added 2026-09-16, direct build)", () => {
  it("rejects a rounds-based block whose exercise sets isn't \"1\"", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "circuit", rounds: "3" }, exercises: [{ name: "Push Ups", sets: "3", reps: "10" }] })] as never,
        { requireDayPhases: false }
      )
    ).toThrow(/every exercise's own sets must be exactly "1"/);
  });

  it("rejects a rounds-based block whose exercise has no sets field at all", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "circuit", rounds: "3" }, exercises: [{ name: "Push Ups", reps: "10" }] })] as never,
        { requireDayPhases: false }
      )
    ).toThrow(/every exercise's own sets must be exactly "1"/);
  });

  it("accepts a rounds-based block once every exercise's sets is \"1\"", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "circuit", rounds: "3" }, exercises: [{ name: "Push Ups", sets: "1", reps: "10" }] })] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });

  it("never fires when rounds isn't set — sets can be anything", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "single" }, exercises: [{ name: "Push Ups", sets: "4", reps: "10" }] })] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });
});

describe("validateBlockStructure — per-day variety (requireDayPhases only, added 2026-09-16)", () => {
  const dayName = "PULL DAY 1";
  const warmUp = () => makeBlock({
    name: `${dayName} | Warm-Up`,
    metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "PULL", rounds: "2" },
    exercises: [
      { name: "Banded Arm Circles", sets: "1" },
      { name: "Inchworm", sets: "1" },
      { name: "Scapula Push Ups", sets: "1" },
      { name: "Wrist Pressure", sets: "1" },
    ],
  });
  const coolDown = () => makeBlock({
    name: `${dayName} | Cool-Down`,
    metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
    exercises: [{ name: "Child Pose" }, { name: "Shoulder Stretch" }, { name: "Child Pose Sided" }],
  });

  it("passes a day with real variety across its blocks", () => {
    const strength = makeBlock({
      name: `${dayName} | Strength - 1`,
      metadata: {
        structure: "ladder", timing_system: "fortime", rounds: "3", time_cap_min: 12,
        ladder_start: 22, ladder_sub: 4, ladder_direction: "down",
      },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "22" }],
    });
    expect(() =>
      validateBlockStructure([warmUp(), strength, coolDown()] as never, { requireDayPhases: true })
    ).not.toThrow();
  });

  it("rejects a day where every non-rest block is straight_set + single, once there are 2+", () => {
    const allStraightSetSingle = [
      makeBlock({ name: `${dayName} | Warm-Up`, exercises: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }] }),
      makeBlock({ name: `${dayName} | Strength - 1` }),
      makeBlock({ name: `${dayName} | Cool-Down`, exercises: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }] }),
    ];
    expect(() =>
      validateBlockStructure(allStraightSetSingle as never, { requireDayPhases: true })
    ).toThrow(/no real variety across the day/);
  });

  it("flags the minimal 2-block case too — Warm-Up + Cool-Down alone, both straight_set + single", () => {
    // The nonRestBlockCount>=2 guard in the code is really a defensive
    // floor, not a meaningful exemption in this call path: a day can only
    // pass the phase-completeness check above with at least one Warm-Up-
    // phase block and one Cool-Down-phase block, i.e. always >=2 non-rest
    // blocks by the time this runs. A genuinely single-block day is not
    // reachable here (requireDayPhases:true always needs both phases), so
    // this exercises the real minimum instead of an unreachable one. Uses
    // plain straight_set/single blocks, not the warmUp()/coolDown() helpers
    // above (those are realistic, circuit-based warm-ups — genuinely varied
    // on their own, which is the wrong fixture for a "zero variety" case).
    const flatWarmUp = makeBlock({ name: `${dayName} | Warm-Up`, exercises: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }] });
    const flatCoolDown = makeBlock({ name: `${dayName} | Cool-Down`, exercises: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }] });
    expect(() =>
      validateBlockStructure([flatWarmUp, flatCoolDown] as never, { requireDayPhases: true })
    ).toThrow(/no real variety across the day/);
  });

  it("ignores an all-REST day entirely, no variety or phase check applies", () => {
    const restDay = makeBlock({ name: "REST DAY 4 | Rest", metadata: { focus_tag: "REST" }, exercises: [] });
    expect(() =>
      validateBlockStructure([restDay] as never, { requireDayPhases: true })
    ).not.toThrow();
  });

  it("still rejects a day missing Warm-Up or Cool-Down, independent of variety", () => {
    const strengthOnly = makeBlock({ name: `${dayName} | Strength - 1` });
    expect(() =>
      validateBlockStructure([strengthOnly] as never, { requireDayPhases: true })
    ).toThrow(/missing a Warm-Up and Cool-Down block/);
  });

  it("never applies the variety check when requireDayPhases is false (append_week/add_block_to_week)", () => {
    const allStraightSetSingle = [
      makeBlock({ name: `${dayName} | Strength - 1` }),
      makeBlock({ name: `${dayName} | Accessories` }),
    ];
    expect(() =>
      validateBlockStructure(allStraightSetSingle as never, { requireDayPhases: false })
    ).not.toThrow();
  });
});

describe("validateExerciseList", () => {
  it("rejects an empty exercise list", () => {
    expect(() => validateExerciseList([], "PULL DAY 1 | Strength - 1")).toThrow(/no exercises/);
  });

  it("rejects the same exercise name listed twice", () => {
    expect(() =>
      validateExerciseList(
        [{ name: "Dips" }, { name: "Dips" }] as never,
        "PULL DAY 1 | Strength - 1"
      )
    ).toThrow(/lists "Dips" twice/);
  });

  it("accepts a normal, non-empty, non-duplicated list", () => {
    expect(() =>
      validateExerciseList([{ name: "Dips" }, { name: "Pull Ups (Normal Grip)" }] as never, "PULL DAY 1 | Strength - 1")
    ).not.toThrow();
  });
});

describe("parseConceptNotes — the metadata-merge logic update_block_structure relies on", () => {
  it("round-trips a real [CONCEPT:{...}] notes string", () => {
    const raw = '[CONCEPT:{"timing_system":"straight_set","structure":"single","focus_tag":"PULL","is_weighted":false}] Some coach note';
    const { metadata, coach_notes } = parseConceptNotes(raw);
    expect(metadata).toEqual({ timing_system: "straight_set", structure: "single", focus_tag: "PULL", is_weighted: false });
    expect(coach_notes).toBe("Some coach note");
  });

  it("returns empty metadata and the raw text for notes with no CONCEPT tag", () => {
    const { metadata, coach_notes } = parseConceptNotes("just a plain note");
    expect(metadata).toEqual({});
    expect(coach_notes).toBe("just a plain note");
  });

  it("returns empty metadata for null/undefined notes, never throws", () => {
    expect(parseConceptNotes(null)).toEqual({ metadata: {}, coach_notes: "" });
    expect(parseConceptNotes(undefined)).toEqual({ metadata: {}, coach_notes: "" });
  });

  it("degrades gracefully on a CONCEPT tag that isn't valid JSON, instead of throwing", () => {
    const { metadata, coach_notes } = parseConceptNotes("[CONCEPT:{not valid json}] a note");
    expect(metadata).toEqual({});
    expect(coach_notes).toBe("a note");
  });

  it("shallow-merges the way update_block_structure's handler does: new fields win, untouched fields survive", () => {
    const raw = '[CONCEPT:{"timing_system":"straight_set","structure":"single","focus_tag":"PULL","is_weighted":false}] ';
    const { metadata: currentMetadata } = parseConceptNotes(raw);
    const requestedChange = { timing_system: "fortime", structure: "ladder", ladder_start: 22, ladder_sub: 4, ladder_direction: "down", time_cap_min: 12, rounds: "3" };
    const merged = { ...currentMetadata, ...requestedChange };
    // Untouched fields survive the merge...
    expect(merged.focus_tag).toBe("PULL");
    expect(merged.is_weighted).toBe(false);
    // ...and every requested field actually took effect.
    expect(merged.timing_system).toBe("fortime");
    expect(merged.structure).toBe("ladder");
    expect(merged.ladder_start).toBe(22);
    // The merged result is exactly what validateBlockStructure needs to
    // pass for this to be a legal ladder+fortime block — the same
    // pre-flight check update_block_structure's handler actually runs.
    expect(() =>
      validateBlockStructure(
        [{ name: "PULL DAY 1 | Strength - 1", metadata: merged, exercises: [{ sets: "1", reps: "22" }] }] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });
});

describe("warnSplitCoverage (rewritten 2026-09-17, day-by-day build): non-throwing, checks declared categories not blocks", () => {
  it("warns on a 1-2 day split where a day isn't FULL_BODY", () => {
    const warnings = warnSplitCoverage(["PULL", "PUSH"], 2);
    expect(warnings).toEqual([expect.stringContaining("FULL_BODY")]);
  });

  it("no warning for a 1-2 day split where every day is FULL_BODY", () => {
    expect(warnSplitCoverage(["FULL_BODY", "FULL_BODY"], 2)).toEqual([]);
  });

  it("warns on a 4-day split with no Legs day", () => {
    const warnings = warnSplitCoverage(["PULL", "PUSH", "PULL", "PUSH"], 4);
    expect(warnings).toEqual([expect.stringContaining("No day in this 4-day split trains Legs")]);
  });

  it("no warning for a 4-day split with a real Legs day", () => {
    expect(warnSplitCoverage(["PULL", "LEGS", "PUSH", "FULL_BODY"], 4)).toEqual([]);
  });

  it("also accepts a Legs day recognized by name alone, e.g. \"Lower Body\"", () => {
    expect(warnSplitCoverage(["PULL", "Lower Body", "PUSH"], 3)).toEqual([]);
  });

  it("warns when brief.days_per_week doesn't match split_days' own length", () => {
    const warnings = warnSplitCoverage(["PULL", "LEGS", "PUSH"], 4);
    expect(warnings).toEqual([expect.stringContaining("brief.days_per_week says 4, but split_days lists 3")]);
  });

  it("returns no warnings for an empty split_days (nothing declared yet)", () => {
    expect(warnSplitCoverage([], 4)).toEqual([]);
  });
});

describe("warnSkillCoverage (added 2026-09-17): non-fatal, checked only on the last day", () => {
  const skills = [
    { skill: "handstand", checkpointExercise: "Free Handstand", maxHoldSeconds: 25, maxReps: null },
    { skill: "front_lever", checkpointExercise: "Tuck Front Lever Hold", maxHoldSeconds: 15, maxReps: null },
  ];

  it("warns for a skill trained on only one day", () => {
    const daySkillNames = new Map<string, Set<string>>([
      ["PUSH DAY", new Set(["free handstand", "pike push ups"])],
      ["LEGS DAY", new Set(["goblet squat"])],
    ]);
    const warnings = warnSkillCoverage(daySkillNames, skills);
    expect(warnings).toEqual([
      expect.stringContaining('"handstand" (checkpoint "Free Handstand") only appears in 1 day'),
      expect.stringContaining('"front_lever" (checkpoint "Tuck Front Lever Hold") only appears in 0 day'),
    ]);
  });

  it("no warning once a skill is trained on 2+ days, case-insensitively", () => {
    const daySkillNames = new Map<string, Set<string>>([
      ["PUSH DAY", new Set(["free handstand"])],
      ["PULL DAY", new Set(["free handstand", "pull ups (normal grip)"])],
    ]);
    expect(warnSkillCoverage(daySkillNames, [skills[0]])).toEqual([]);
  });

  it("returns no warnings when no skills were named", () => {
    expect(warnSkillCoverage(new Map(), [])).toEqual([]);
  });
});

describe("validateAthleteFit (added 2026-09-16, direct build)", () => {
  const baseFit = {
    pullUpsMax: null as number | null,
    dipsMax: null as number | null,
    pushUpsMax: null as number | null,
    muscleUpsMax: null as number | null,
    skills: [] as Array<{ skill: string; checkpointExercise: string; maxHoldSeconds?: number | null; maxReps?: number | null }>,
  };

  it("rejects a band cue on Muscle Up when the athlete already has 3+ strict reps", () => {
    const block = makeBlock({ exercises: [{ name: "Muscle Up", sets: "3", reps: "5", notes: "use a light band to assist" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, muscleUpsMax: 10 })
    ).toThrow(/cues a band on Muscle Up/);
  });

  it("allows a band cue on Muscle Up when the athlete has fewer than 3 strict reps", () => {
    const block = makeBlock({ exercises: [{ name: "Muscle Up", sets: "3", reps: "1", notes: "use a light band to assist" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, muscleUpsMax: 2 })
    ).not.toThrow();
  });

  it("rejects unassisted Pull Ups (Normal Grip) when the athlete has 0 strict pull-ups", () => {
    const block = makeBlock({ exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "5" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 0 })
    ).toThrow(/0 strict pull-ups/);
  });

  it("allows Pull Ups (Normal Grip) once the athlete has at least 1", () => {
    const block = makeBlock({ exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "5" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 8 })
    ).not.toThrow();
  });

  it("day-by-day build (2026-09-17): a day that doesn't use a confirmed skill's checkpoint is fine, not an error — a Legs day legitimately has no handstand content", () => {
    const block = makeBlock({ exercises: [{ name: "Wall Handstand hold", sets: "3", hold_seconds: "20" }] });
    expect(
      validateAthleteFit([block] as never, {
        ...baseFit,
        skills: [{ skill: "handstand", checkpointExercise: "Free Handstand", maxHoldSeconds: 30 }],
      })
    ).toEqual([]);
  });

  it("rejects a skill hold target above the athlete's confirmed max hold", () => {
    const block = makeBlock({ exercises: [{ name: "Free Handstand", sets: "3", hold_seconds: "45" }] });
    expect(() =>
      validateAthleteFit([block] as never, {
        ...baseFit,
        skills: [{ skill: "handstand", checkpointExercise: "Free Handstand", maxHoldSeconds: 30 }],
      })
    ).toThrow(/above this athlete's confirmed max of 30s/);
  });

  it("accepts a skill hold target at or below the athlete's confirmed max hold", () => {
    const block = makeBlock({ exercises: [{ name: "Free Handstand", sets: "3", hold_seconds: "25" }] });
    expect(() =>
      validateAthleteFit([block] as never, {
        ...baseFit,
        skills: [{ skill: "handstand", checkpointExercise: "Free Handstand", maxHoldSeconds: 30 }],
      })
    ).not.toThrow();
  });

  it("rejects a skill rep target at or above the athlete's confirmed max reps", () => {
    const block = makeBlock({ exercises: [{ name: "Tuck Front Lever Hold", sets: "3", reps: "8" }] });
    expect(() =>
      validateAthleteFit([block] as never, {
        ...baseFit,
        skills: [{ skill: "front_lever", checkpointExercise: "Tuck Front Lever Hold", maxReps: 8 }],
      })
    ).toThrow(/at or above this athlete's confirmed max of 8/);
  });

  it("rejects reps at or above the athlete's tested max for a tracked pattern", () => {
    const block = makeBlock({ exercises: [{ name: "Dips", sets: "3", reps: "10" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, dipsMax: 10 })
    ).toThrow(/at or above this athlete's tested max of 10/);
  });

  it("accepts reps below the athlete's tested max for a tracked pattern", () => {
    const block = makeBlock({ exercises: [{ name: "Dips", sets: "3", reps: "8" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, dipsMax: 10 })
    ).not.toThrow();
  });

  it("warns (does not reject) on reps well below the athlete's tested max — demoted 2026-09-17 after real false positives against legitimate low-rep skill/trial/weighted-adjacent work", () => {
    // The real live bug this originally caught: tier 7, 30 real pull-ups,
    // got a 6/8/10 ladder — the beginner band's own row (§16), not this
    // athlete's. Still surfaced, just as a warning the model can act on
    // rather than a hard reject that costs a whole retry.
    const block = makeBlock({
      metadata: { structure: "ladder", timing_system: "fortime", rounds: "3", time_cap_min: 10, ladder_start: 6, ladder_sub: 2, ladder_direction: "up" },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "6" }],
    });
    const warnings = validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 30 });
    expect(warnings).toEqual([expect.stringContaining("well below this athlete's tested max of 30")]);
  });

  it("accepts reps right at the 50% floor for a tracked pattern", () => {
    const block = makeBlock({ exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "15" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 30 })
    ).not.toThrow();
  });

  it("never applies the floor check inside Warm-Up or Cool-Down", () => {
    const warmUp = makeBlock({
      name: "PULL DAY 1 | Warm-Up",
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "3" }],
    });
    expect(() =>
      validateAthleteFit([warmUp] as never, { ...baseFit, pullUpsMax: 30 })
    ).not.toThrow();
  });

  it("REGRESSION (2026-09-16): never applies the floor check to a WEIGHTED instance of a tracked pattern", () => {
    // The real live bug, found on the very next test after fixing the
    // checkpointExercise crash: 6 reps of WEIGHTED Pull Ups (Normal Grip)
    // was rejected as "well below" a 30-rep BODYWEIGHT tested max — but
    // bodyweight max-rep testing has no bearing on what's reasonable once
    // external load changes the whole stimulus. 6 reps of a heavily
    // weighted pull-up is completely normal programming.
    const block = makeBlock({
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "6", is_weighted: true, notes: "start around 20kg added, adjust from feel" }],
    });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 30 })
    ).not.toThrow();
  });

  it("REGRESSION (2026-09-16): never applies the ceiling check to a WEIGHTED instance of a tracked pattern either", () => {
    const block = makeBlock({
      exercises: [{ name: "Dips", sets: "3", reps: "40", is_weighted: true, notes: "start around 20kg added, adjust from feel" }],
    });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, dipsMax: 40 })
    ).not.toThrow();
  });

  it("still warns for the floor case on an UNWEIGHTED instance of the same pattern in the same program", () => {
    const block = makeBlock({
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "6" }],
    });
    const warnings = validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 30 });
    expect(warnings).toEqual([expect.stringContaining("well below this athlete's tested max of 30")]);
  });

  it("REGRESSION (2026-09-16): also exempts via the BLOCK-level is_weighted flag, not just the exercise-level one", () => {
    // Belt-and-suspenders: the live failure happened on a block literally
    // named "WEIGHTED STRENGTH DAY" — trusting only the exercise-level flag
    // leaves this exposed to the model forgetting to also set it there.
    const block = makeBlock({
      metadata: { is_weighted: true },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "6" }],
    });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 30 })
    ).not.toThrow();
  });

  it("warns (does not reject) on weighted work with a known logged weight but no number written anywhere — demoted 2026-09-18, per-day-latency pass", () => {
    const block = makeBlock({ exercises: [{ name: "Dips", sets: "3", reps: "8", is_weighted: true, notes: "focus on control" }] });
    const warnings = validateAthleteFit([block] as never, { ...baseFit, loggedWeights: { dips: 20 } });
    expect(warnings).toEqual([expect.stringContaining("no weight number appears")]);
  });

  it("accepts weighted work once a real number is written, no warning", () => {
    const block = makeBlock({ exercises: [{ name: "Dips", sets: "3", reps: "8", is_weighted: true, notes: "last week 20kg felt good, hold at 20kg" }] });
    expect(validateAthleteFit([block] as never, { ...baseFit, loggedWeights: { dips: 20 } })).toEqual([]);
  });

  it("warns (does not reject) on weighted work with NO logged history and no number either", () => {
    const block = makeBlock({ exercises: [{ name: "Goblet Squat", sets: "3", reps: "8", is_weighted: true, notes: "" }] });
    const warnings = validateAthleteFit([block] as never, { ...baseFit });
    expect(warnings).toEqual([expect.stringContaining("no logged history and no weight number")]);
  });

  it("accepts weighted work with no logged history once a real starting estimate is written, no warning", () => {
    const block = makeBlock({ exercises: [{ name: "Goblet Squat", sets: "3", reps: "8", is_weighted: true, notes: "start around 10kg added, adjust from feel" }] });
    expect(validateAthleteFit([block] as never, { ...baseFit })).toEqual([]);
  });
});

describe("validateBuildBrief (added 2026-09-16, direct build — this is the real gate, not save_build_brief)", () => {
  const validBrief = () => ({
    goal: "handstand and front lever, keep progressing to the trial",
    skills: [
      { skill: "handstand", checkpoint_exercise: "Free Handstand", max_hold_seconds: 25 },
      { skill: "front_lever", checkpoint_exercise: "Tuck Front Lever Hold", max_hold_seconds: 15 },
    ],
    trial_focus: true,
    days_per_week: 4,
    split_days: ["PULL", "LEGS", "PUSH", "FULL_BODY"],
    equipment: ["bar", "rings"],
    pacing: "day_by_day" as const,
  });

  it("rejects a missing brief entirely, naming what's required", () => {
    expect(() => validateBuildBrief(undefined)).toThrow(/Missing "brief"/);
  });

  it("names every missing top-level field at once", () => {
    expect(() => validateBuildBrief({ goal: "strength" })).toThrow(
      /skills, trial_focus, days_per_week, split_days, equipment, pacing/
    );
  });

  it("accepts a fully-specified brief", () => {
    expect(() => validateBuildBrief(validBrief())).not.toThrow();
  });

  it("REGRESSION (2026-09-16): returned skills actually have camelCase fields the rest of the code reads, not just the raw snake_case input", () => {
    // The real live bug: validateBuildBrief used to `return b as unknown as
    // BuildBrief` — a type cast, not a transformation. skill.checkpointExercise
    // was silently undefined on every call (only skill.checkpoint_exercise,
    // the raw snake_case field, ever existed), and validateAthleteFit's
    // nameIs(ex.name, skill.checkpointExercise) crashed on undefined.toLowerCase()
    // on the FIRST propose_new_program attempt for any build with a skill
    // goal — every time, no exceptions. This test fails loudly if that
    // transformation is ever lost again.
    const brief = validateBuildBrief(validBrief());
    expect(brief.skills[0].checkpointExercise).toBe("Free Handstand");
    expect(brief.skills[0].maxHoldSeconds).toBe(25);
    expect(brief.skills[1].checkpointExercise).toBe("Tuck Front Lever Hold");
    expect(brief.skills[1].maxHoldSeconds).toBe(15);
  });

  it("REGRESSION (2026-09-16): the full validateBuildBrief -> validateAthleteFit path never crashes for a skill-goal build", () => {
    // The exact end-to-end path that crashed in production, reproduced
    // here without needing a live Supabase client or Anthropic call. Both
    // checkpoints from validBrief()'s two skills must appear, or the
    // (separate, legitimate) "no block uses this checkpoint" check fires
    // instead of exercising the crash path this test is actually for.
    const brief = validateBuildBrief(validBrief());
    const block = makeBlock({
      exercises: [
        { name: "Free Handstand", sets: "1", hold_seconds: "20" },
        { name: "Tuck Front Lever Hold", sets: "1", hold_seconds: "10" },
      ],
    });
    expect(() =>
      validateAthleteFit([block] as never, {
        pullUpsMax: null, dipsMax: null, pushUpsMax: null, muscleUpsMax: null,
        skills: brief.skills,
      })
    ).not.toThrow();
  });

  it("rejects a skill entry missing checkpoint_exercise", () => {
    const brief = validBrief();
    brief.skills = [{ skill: "handstand", checkpoint_exercise: "", max_hold_seconds: 25 }];
    expect(() => validateBuildBrief(brief)).toThrow(/skills\[0\] is missing "skill" or "checkpoint_exercise"/);
  });

  it("rejects a skill entry with neither max_hold_seconds nor max_reps", () => {
    const brief = validBrief();
    brief.skills = [{ skill: "handstand", checkpoint_exercise: "Free Handstand" }] as never;
    expect(() => validateBuildBrief(brief)).toThrow(/no max_hold_seconds or max_reps/);
  });

  it("accepts an empty skills array when no skill goal was named", () => {
    const brief = validBrief();
    brief.skills = [];
    expect(() => validateBuildBrief(brief)).not.toThrow();
  });

  it("rejects an empty split_days array", () => {
    const brief = validBrief();
    brief.split_days = [];
    expect(() => validateBuildBrief(brief)).toThrow(/split_days must be a non-empty array/);
  });

  it("rejects an invalid pacing value", () => {
    const brief = validBrief() as unknown as Record<string, unknown>;
    brief.pacing = "sometimes";
    expect(() => validateBuildBrief(brief)).toThrow(/pacing must be "day_by_day" or "direct"/);
  });

  it("rejects days_per_week out of the 1-7 range", () => {
    const brief = validBrief() as unknown as Record<string, unknown>;
    brief.days_per_week = 9;
    expect(() => validateBuildBrief(brief)).toThrow(/days_per_week must be a real number between 1 and 7/);
  });
});


describe("getBlockParts (exported 2026-09-16 for addProgramDay.ts's day_name cross-check)", () => {
  it("derives day/phase from day_name + block_name", () => {
    expect(getBlockParts({ day_name: "PULL DAY 1", block_name: "Strength - 1", exercises: [] })).toEqual({
      day: "PULL DAY 1", phase: "Strength - 1",
    });
  });

  it("derives day/phase from a combined name split on the pipe", () => {
    expect(getBlockParts({ name: "PULL DAY 1 | Strength - 1", exercises: [] })).toEqual({
      day: "PULL DAY 1", phase: "Strength - 1",
    });
  });

  it("falls back to the whole trimmed name as both day and phase when there's no pipe", () => {
    expect(getBlockParts({ name: "Warm-Up", exercises: [] })).toEqual({ day: "Warm-Up", phase: "Warm-Up" });
  });

  it("falls back to \"?\" for a block with no name info at all — a real, if unlikely, edge case", () => {
    expect(getBlockParts({ exercises: [] })).toEqual({ day: "?", phase: "" });
  });
});

describe("computeDayPosition (added 2026-09-17): the trusted collision/position check behind index.ts's add_day branch", () => {
  const existingNames = (days: string[]) => days.flatMap((d) => [`${d} | Warm-Up`, `${d} | Strength`, `${d} | Cool-Down`]);

  it("a genuinely new day: not replacing, gets the next number", () => {
    const week1 = existingNames(["PULL & MUSCLE-UP DAY"]); // day 1 already added
    expect(computeDayPosition(week1, "LEGS DAY")).toEqual({ replacing: false, dayNumber: 2 });
  });

  it("redoing an already-added day: replacing, dayNumber stays the current total day count, never bumps past it", () => {
    const week1 = existingNames(["PULL & MUSCLE-UP DAY", "LEGS DAY", "PUSH DAY"]);
    // dayNumber here is "how many distinct days exist so far, this one
    // included" — NOT this day's structural position in the confirmed
    // split. Redoing LEGS DAY (added 2nd) still reports dayNumber 3
    // (the current total), not 2 — a known, deliberate simplification:
    // getting the true ordinal right on a redo would need brief.split_days
    // (categories like "LEGS") matched against athlete-facing day names
    // like "LEGS DAY", which isn't a reliable string match. Flagged in the
    // Step 2 report rather than silently assumed correct.
    expect(computeDayPosition(week1, "LEGS DAY")).toEqual({ replacing: true, dayNumber: 3 });
  });

  it("first day ever (empty week): not replacing, day 1", () => {
    expect(computeDayPosition([], "PULL & MUSCLE-UP DAY")).toEqual({ replacing: false, dayNumber: 1 });
  });

  it("matches on the day prefix even when block names carry different phases, not exact block-name equality", () => {
    const week1 = ["LEGS DAY | Warm-Up", "LEGS DAY | Finisher"]; // no "Strength" block this time
    expect(computeDayPosition(week1, "LEGS DAY")).toEqual({ replacing: true, dayNumber: 1 });
  });
});

describe("warnTimingMismatch (added 2026-09-18): tabata suits a hold, not reps", () => {
  it("warns when a tabata block has an exercise with reps and no hold_seconds", () => {
    const block = makeBlock({
      name: "PULL & MUSCLE-UP DAY | Skills",
      metadata: { timing_system: "tabata", structure: "single", focus_tag: "PULL" },
      exercises: [{ name: "Muscle Up", sets: "1", reps: "5" }],
    });
    const warnings = warnTimingMismatch([block] as never);
    expect(warnings).toEqual([expect.stringContaining('"Muscle Up" has reps with no hold_seconds')]);
  });

  it("does not warn on a tabata block that's a real static hold (hold_seconds set, no reps)", () => {
    const block = makeBlock({
      name: "PULL & MUSCLE-UP DAY | Skills",
      metadata: { timing_system: "tabata", structure: "single", focus_tag: "CORE" },
      exercises: [{ name: "Tuck Front Lever Hold", hold_seconds: "20" }],
    });
    expect(warnTimingMismatch([block] as never)).toEqual([]);
  });

  it("catches the exact live bug: a Front Lever hold and Muscle Up reps mixed in one tabata block", () => {
    const block = makeBlock({
      name: "PULL & MUSCLE-UP DAY | Skills",
      metadata: { timing_system: "tabata", structure: "superset", focus_tag: "PULL" },
      exercises: [
        { name: "Tuck Front Lever Hold", hold_seconds: "20" },
        { name: "Muscle Up", sets: "1", reps: "5" },
      ],
    });
    const warnings = warnTimingMismatch([block] as never);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Muscle Up");
  });

  it("never warns on a non-tabata block, however it's structured", () => {
    const block = makeBlock({
      metadata: { timing_system: "straight_set", structure: "single", focus_tag: "PULL" },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "8" }],
    });
    expect(warnTimingMismatch([block] as never)).toEqual([]);
  });
});

describe("warnUneditedFromSource (added 2026-09-18): a day identical to the matched library workout", () => {
  const sourceBlocks = [
    { name: "Warm-Up", exercises: [{ name: "Inchworm", sets: "1", reps: "10" }] },
    { name: "Strength - 1", exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }] },
  ];

  it("warns when every real block matches the source exactly", () => {
    const proposed = [
      makeBlock({ name: "PULL DAY 1 | Warm-Up", exercises: [{ name: "Inchworm", sets: "1", reps: "10" }] }),
      makeBlock({ name: "PULL DAY 1 | Strength - 1", exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }] }),
    ];
    const warnings = warnUneditedFromSource(proposed as never, sourceBlocks);
    expect(warnings).toEqual([expect.stringContaining("identical to the matched library workout")]);
  });

  it("does not warn once at least one block was genuinely adapted", () => {
    const proposed = [
      makeBlock({ name: "PULL DAY 1 | Warm-Up", exercises: [{ name: "Inchworm", sets: "1", reps: "10" }] }),
      // Reps changed from the source's 8 to this athlete's real 20.
      makeBlock({ name: "PULL DAY 1 | Strength - 1", exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "20" }] }),
    ];
    expect(warnUneditedFromSource(proposed as never, sourceBlocks)).toEqual([]);
  });

  it("ignores REST blocks when deciding whether everything matched", () => {
    const proposed = [
      makeBlock({ name: "PULL DAY 1 | Warm-Up", exercises: [{ name: "Inchworm", sets: "1", reps: "10" }] }),
      makeBlock({ name: "PULL DAY 1 | Strength - 1", exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }] }),
      makeBlock({ name: "REST DAY | Rest", metadata: { focus_tag: "REST" }, exercises: [] }),
    ];
    const warnings = warnUneditedFromSource(proposed as never, sourceBlocks);
    expect(warnings).toEqual([expect.stringContaining("identical to the matched library workout")]);
  });

  it("does not match on exercise order alone — order-insensitive within a block", () => {
    const reorderedSource = [
      { name: "Strength - 1", exercises: [{ name: "Dips", sets: "3", reps: "10" }, { name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }] },
    ];
    const proposed = [
      makeBlock({ name: "PULL DAY 1 | Strength - 1", exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }, { name: "Dips", sets: "3", reps: "10" }] }),
    ];
    expect(warnUneditedFromSource(proposed as never, reorderedSource)).toEqual([expect.stringContaining("identical")]);
  });

  it("returns no warnings when there's no source (field omitted) — an empty source list is a no-op, not a false positive", () => {
    const proposed = [makeBlock({ name: "PULL DAY 1 | Warm-Up", exercises: [{ name: "Inchworm" }] })];
    expect(warnUneditedFromSource(proposed as never, [])).toEqual([]);
  });
});

describe("buildServerWarmUpCoolDown (added 2026-09-18, per-day-latency pass)", () => {
  it("builds the standard Warm-Up and Cool-Down with the fixed prescription (2 rounds, circuit, 60s after round)", async () => {
    const blocks = await buildServerWarmUpCoolDown(REAL_CLIENT, "PULL DAY 1", "PULL", undefined, undefined, true, true);
    const warmUp = blocks.find((b) => b.block_name === "Warm-Up")!;
    const coolDown = blocks.find((b) => b.block_name === "Cool-Down")!;
    expect(warmUp.metadata).toMatchObject({ timing_system: "straight_set", structure: "circuit", focus_tag: "PULL", rounds: "2", rest_after_round: 60 });
    expect(warmUp.exercises.map((e) => e.name)).toEqual(["Banded Arm Circles", "Inchworm", "banded Shoulder External Rotation", "wrist pressure", "Scapula Push Ups"]);
    expect(warmUp.exercises.every((e) => e.sets === "1" && e.reps === "10")).toBe(true);
    expect(coolDown.exercises.map((e) => e.name)).toEqual(["Childe Pose", "Shoulder stretch", "Child Pose Sided", "Lat Stretch SH Opener"]);
    expect(coolDown.exercises.every((e) => e.hold_seconds === "30")).toBe(true);
    expect(blocks).toHaveLength(2); // no Mobility block for a non-push day
  });

  it("uses the LEGS-specific lists, and 45s (not 30s) for Pancake Stretch specifically", async () => {
    const blocks = await buildServerWarmUpCoolDown(REAL_CLIENT, "LEGS DAY", "LEGS", undefined, undefined, true, true);
    const warmUp = blocks.find((b) => b.block_name === "Warm-Up")!;
    const coolDown = blocks.find((b) => b.block_name === "Cool-Down")!;
    expect(warmUp.exercises.map((e) => e.name)).toEqual(["Inchworm", "Reverse Lunges", "Hip Flexors Stretch", "Banded Arm Circles", "wrist pressure"]);
    const pancake = coolDown.exercises.find((e) => e.name === "Pancake Stretch")!;
    expect(pancake.hold_seconds).toBe("45");
    expect(coolDown.exercises.filter((e) => e.name !== "Pancake Stretch").every((e) => e.hold_seconds === "30")).toBe(true);
  });

  it("a \"push\" warm_up marker also builds a separate Mobility block", async () => {
    const blocks = await buildServerWarmUpCoolDown(REAL_CLIENT, "PUSH DAY", "PUSH", "push", undefined, true, false);
    expect(blocks.map((b) => b.block_name)).toEqual(["Warm-Up", "Mobility"]);
    const mobility = blocks.find((b) => b.block_name === "Mobility")!;
    expect(mobility.exercises.map((e) => e.name)).toEqual(["Tuck Overhead Reach Foam roller", "Prone Shoulder opener", "Pike Walk out"]);
  });

  it("infers legs from focus_tag when the marker is omitted", async () => {
    const blocks = await buildServerWarmUpCoolDown(REAL_CLIENT, "LEGS DAY", "LEGS", undefined, undefined, true, true);
    const warmUp = blocks.find((b) => b.block_name === "Warm-Up")!;
    expect(warmUp.exercises.map((e) => e.name)).toContain("Reverse Lunges"); // LEGS-only name
  });

  it("builds only what's needed — needsWarmUp false skips it even if focus_tag would suggest push", async () => {
    const blocks = await buildServerWarmUpCoolDown(REAL_CLIENT, "PUSH DAY", "PUSH", undefined, undefined, false, true);
    expect(blocks.map((b) => b.block_name)).toEqual(["Cool-Down"]);
  });

  it("returns [] when neither is needed", async () => {
    expect(await buildServerWarmUpCoolDown(REAL_CLIENT, "PULL DAY 1", "PULL", undefined, undefined, false, false)).toEqual([]);
  });

  it("skips a name that no longer resolves live rather than trusting the hardcoded list blindly", async () => {
    const partialClient = makeMockClient(["Inchworm", "Scapula Push Ups"]); // only 2 of the 5 warm-up names
    const blocks = await buildServerWarmUpCoolDown(partialClient, "PULL DAY 1", "PULL", undefined, undefined, true, false);
    const warmUp = blocks.find((b) => b.block_name === "Warm-Up")!;
    expect(warmUp.exercises.map((e) => e.name).sort()).toEqual(["Inchworm", "Scapula Push Ups"]);
  });
});

describe("assembleDayWithServerBlocks (added 2026-09-18)", () => {
  it("injects a missing Warm-Up first and Cool-Down last, renumbering order_index across the whole day", async () => {
    const strength = makeBlock({ name: "PULL DAY 1 | Strength", metadata: { focus_tag: "PULL" }, exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }] });
    (strength as { order_index?: number }).order_index = 0;
    const assembled = await assembleDayWithServerBlocks(REAL_CLIENT, [strength] as never, "PULL DAY 1", undefined, undefined);
    expect(assembled.map((b) => getBlockParts(b).phase)).toEqual(["Warm-Up", "Strength", "Cool-Down"]);
    expect(assembled.map((b) => (b as { order_index?: number }).order_index)).toEqual([0, 1, 2]);
  });

  it("the escape hatch: leaves a model-written Warm-Up untouched and doesn't inject a second one", async () => {
    const warmUp = makeBlock({ name: "PULL DAY 1 | Warm-Up", metadata: { focus_tag: "PULL" }, exercises: [{ name: "Jump Rope", sets: "1", reps: "30" }] });
    const strength = makeBlock({ name: "PULL DAY 1 | Strength", metadata: { focus_tag: "PULL" }, exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }] });
    const assembled = await assembleDayWithServerBlocks(REAL_CLIENT, [warmUp, strength] as never, "PULL DAY 1", undefined, undefined);
    // Only Cool-Down injected; the model's own Warm-Up (with its own exercise) survives unchanged.
    expect(assembled.map((b) => getBlockParts(b).phase)).toEqual(["Warm-Up", "Strength", "Cool-Down"]);
    expect(assembled[0].exercises.map((e) => e.name)).toEqual(["Jump Rope"]);
  });

  it("does nothing when the model already wrote both", async () => {
    const warmUp = makeBlock({ name: "PULL DAY 1 | Warm-Up", metadata: { focus_tag: "PULL" }, exercises: [{ name: "Jump Rope" }] });
    const coolDown = makeBlock({ name: "PULL DAY 1 | Cool-Down", metadata: { focus_tag: "PULL" }, exercises: [{ name: "Shoulder stretch", hold_seconds: "30" }] });
    const strength = makeBlock({ name: "PULL DAY 1 | Strength", metadata: { focus_tag: "PULL" }, exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "8" }] });
    const assembled = await assembleDayWithServerBlocks(REAL_CLIENT, [warmUp, strength, coolDown] as never, "PULL DAY 1", undefined, undefined);
    expect(assembled).toHaveLength(3);
    expect(assembled.map((b) => getBlockParts(b).phase)).toEqual(["Warm-Up", "Strength", "Cool-Down"]);
  });
});

describe("INTEGRATION (2026-09-16): the full validation pipeline against the exact real test case", () => {
  // Tier 7, 10 strict muscle-ups, full equipment, 4 days, goal handstand +
  // front lever + trial — the primary worked case this whole session's
  // fixes were chasing. Runs everything propose_new_program's handler runs
  // except the two DB-touching calls (fetchAthleteFitContext's own query,
  // resolveExerciseIds) — those need a live/mocked Supabase client and stay
  // out of Jest's reach by design (see this file's header comment); this
  // still exercises every pure check with realistic content shaped like
  // what a 4-day advanced build with a Weighted Strength day actually
  // looks like, including the exact "WEIGHTED STRENGTH DAY" pattern the
  // live failure was found on.
  const fit = {
    pullUpsMax: 30, dipsMax: 40, pushUpsMax: null, muscleUpsMax: 10,
    skills: [
      { skill: "handstand", checkpointExercise: "Free Handstand", maxHoldSeconds: 25, maxReps: null },
      { skill: "front_lever", checkpointExercise: "Tuck Front Lever Hold", maxHoldSeconds: 15, maxReps: null },
    ],
  };

  const pullDay = [
    makeBlock({
      name: "PULL & MUSCLE-UP DAY | Warm-Up",
      metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "PULL", rounds: "2" },
      exercises: ["Banded Arm Circles", "Inchworm", "Banded Shoulder External Rotation", "Wrist Pressure"].map((name) => ({ name, sets: "1" })),
    }),
    makeBlock({
      name: "PULL & MUSCLE-UP DAY | Skills",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "SKILLS", is_weighted: false },
      exercises: [
        { name: "Muscle Up", sets: "3", reps: "6", notes: "" },
        { name: "Tuck Front Lever Hold", sets: "3", hold_seconds: "10" },
      ],
    }),
    makeBlock({
      name: "PULL & MUSCLE-UP DAY | Strength - 1",
      metadata: {
        structure: "ladder", timing_system: "fortime", focus_tag: "PULL", is_weighted: false,
        rounds: "3", time_cap_min: 12, ladder_start: 22, ladder_sub: 4, ladder_direction: "down",
      },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "22" }],
    }),
    makeBlock({
      name: "PULL & MUSCLE-UP DAY | Cool-Down",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
      exercises: [{ name: "Childe Pose", hold_seconds: "30" }, { name: "Shoulder Stretch", hold_seconds: "30" }, { name: "Child Pose Sided", hold_seconds: "30" }],
    }),
  ];

  const legsDay = [
    makeBlock({
      name: "LEGS DAY | Warm-Up",
      metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "LEGS", rounds: "2" },
      exercises: ["Inchworm", "Reverse Lunges", "Hip Flexors Stretch"].map((name) => ({ name, sets: "1" })),
    }),
    makeBlock({
      name: "LEGS DAY | Strength - 1",
      metadata: { structure: "circuit", timing_system: "fortime", focus_tag: "LEGS", is_weighted: false, rounds: "4", time_cap_min: 15 },
      exercises: [{ name: "Air Squat", sets: "1", reps: "20" }, { name: "Reverse Lunges", sets: "1", reps: "16" }],
    }),
    makeBlock({
      name: "LEGS DAY | Cool-Down",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "LEGS" },
      exercises: [{ name: "Pancake Stretch", hold_seconds: "30" }, { name: "Laying Hamstring Stretch", hold_seconds: "30" }, { name: "Adductor Stretch", hold_seconds: "30" }],
    }),
  ];

  const pushDay = [
    makeBlock({
      name: "PUSH & HANDSTAND DAY | Warm-Up",
      metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "PUSH", rounds: "2" },
      exercises: ["Banded Arm Circles", "Inchworm", "Banded Shoulder External Rotation", "Wrist Pressure"].map((name) => ({ name, sets: "1" })),
    }),
    makeBlock({
      name: "PUSH & HANDSTAND DAY | Mobility",
      metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "PUSH", rounds: "2" },
      exercises: ["Tuck Overhead Reach Foam Roller", "Prone Shoulder Opener", "Pike Walk Out"].map((name) => ({ name, sets: "1" })),
    }),
    makeBlock({
      name: "PUSH & HANDSTAND DAY | Skills",
      metadata: { structure: "single", timing_system: "tabata", focus_tag: "SKILLS", is_weighted: false, tabata_work_seconds: 20, tabata_rest_seconds: 40, tabata_rounds: 6 },
      exercises: [{ name: "Free Handstand", sets: "1", hold_seconds: "20" }],
    }),
    makeBlock({
      name: "PUSH & HANDSTAND DAY | Strength - 1",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PUSH", is_weighted: false },
      exercises: [{ name: "Dips", sets: "4", reps: "22" }],
    }),
    makeBlock({
      name: "PUSH & HANDSTAND DAY | Cool-Down",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PUSH" },
      exercises: [{ name: "Childe Pose", hold_seconds: "30" }, { name: "Shoulder Stretch", hold_seconds: "30" }, { name: "Child Pose Sided", hold_seconds: "30" }],
    }),
  ];

  // The exact block name the live failure happened on — is_weighted at
  // BOTH the block level (metadata) and the exercise level, matching what
  // a compliant model send should look like now that either one exempts
  // the reps floor/ceiling check.
  const weightedDay = [
    makeBlock({
      name: "WEIGHTED STRENGTH DAY | Warm-Up",
      metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "PULL", rounds: "2" },
      exercises: ["Banded Arm Circles", "Inchworm", "Banded Shoulder External Rotation", "Wrist Pressure"].map((name) => ({ name, sets: "1" })),
    }),
    makeBlock({
      name: "WEIGHTED STRENGTH DAY | Strength - 1",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL", is_weighted: true },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "6", is_weighted: true, notes: "start around 20kg added, adjust from feel" }],
    }),
    makeBlock({
      name: "WEIGHTED STRENGTH DAY | Accessories",
      metadata: { structure: "circuit", timing_system: "straight_set", focus_tag: "PULL", is_weighted: true, rounds: "3" },
      exercises: [{ name: "Dips", sets: "1", reps: "6", is_weighted: true, notes: "start around 15kg added, adjust from feel" }],
    }),
    makeBlock({
      name: "WEIGHTED STRENGTH DAY | Cool-Down",
      metadata: { structure: "single", timing_system: "straight_set", focus_tag: "PULL" },
      exercises: [{ name: "Childe Pose", hold_seconds: "30" }, { name: "Shoulder Stretch", hold_seconds: "30" }, { name: "Child Pose Sided", hold_seconds: "30" }],
    }),
  ];

  const fullProgram = [...pullDay, ...legsDay, ...pushDay, ...weightedDay];

  it("passes validateBlockStructure for the whole 4-day program", () => {
    expect(() => validateBlockStructure(fullProgram as never, { requireDayPhases: true })).not.toThrow();
  });

  it("warnSplitCoverage: no warnings for the matching declared split (PULL/LEGS/PUSH/PULL, 4 days)", () => {
    expect(warnSplitCoverage(["PULL", "LEGS", "PUSH", "PULL"], 4)).toEqual([]);
  });

  it("passes validateAthleteFit for the whole 4-day program, including the weighted day (no warnings either)", () => {
    expect(validateAthleteFit(fullProgram as never, fit as never)).toEqual([]);
  });

  it("passes validateBuildBrief for the matching brief", () => {
    const brief = {
      goal: "handstand and front lever, keep progressing to the trial",
      skills: [
        { skill: "handstand", checkpoint_exercise: "Free Handstand", max_hold_seconds: 25 },
        { skill: "front_lever", checkpoint_exercise: "Tuck Front Lever Hold", max_hold_seconds: 15 },
      ],
      trial_focus: true,
      days_per_week: 4,
      split_days: ["PULL", "LEGS", "PUSH", "PULL"],
      equipment: ["bar", "rings", "bands", "weights"],
      pacing: "direct" as const,
    };
    expect(() => validateBuildBrief(brief)).not.toThrow();
  });
});
