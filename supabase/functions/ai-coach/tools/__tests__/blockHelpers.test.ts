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
  validateSplitCoverage,
  validateAthleteFit,
  validateBuildBrief,
  resolveProgramBlocks,
  getBlockParts,
  parseConceptNotes,
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

describe("validateSplitCoverage (added 2026-09-16, direct build)", () => {
  const day = (name: string, focusTag: string) => makeBlock({ name: `${name} | Strength - 1`, metadata: { focus_tag: focusTag } });

  it("rejects a 1-2 day split where a day isn't FULL_BODY", () => {
    expect(() =>
      validateSplitCoverage([day("DAY 1", "PULL"), day("DAY 2", "PUSH")] as never, 2)
    ).toThrow(/no FULL_BODY block/);
  });

  it("accepts a 1-2 day split where every day is FULL_BODY", () => {
    expect(() =>
      validateSplitCoverage([day("DAY 1", "FULL_BODY"), day("DAY 2", "FULL_BODY")] as never, 2)
    ).not.toThrow();
  });

  it("rejects a 4-day split with no Legs day", () => {
    expect(() =>
      validateSplitCoverage(
        [day("DAY 1", "PULL"), day("DAY 2", "PUSH"), day("DAY 3", "PULL"), day("DAY 4", "PUSH")] as never,
        4
      )
    ).toThrow(/No day in this 4-day split trains Legs/);
  });

  it("accepts a 4-day split with a real Legs day", () => {
    expect(() =>
      validateSplitCoverage(
        [day("DAY 1", "PULL"), day("DAY 2", "LEGS"), day("DAY 3", "PUSH"), day("DAY 4", "FULL_BODY")] as never,
        4
      )
    ).not.toThrow();
  });

  it("also accepts a Legs day recognized by name alone, e.g. \"Lower Body\"", () => {
    expect(() =>
      validateSplitCoverage(
        [day("DAY 1", "PULL"), day("Lower Body", "FULL_BODY"), day("DAY 3", "PUSH")] as never,
        3
      )
    ).not.toThrow();
  });

  it("ignores REST blocks entirely — for coverage AND for the day-count check below", () => {
    const restDay = makeBlock({ name: "REST DAY | Rest", metadata: { focus_tag: "REST" }, exercises: [] });
    expect(() =>
      validateSplitCoverage([day("DAY 1", "PULL"), day("DAY 2", "LEGS"), day("DAY 3", "PUSH"), restDay] as never, 3)
    ).not.toThrow();
  });

  it("rejects brief.days_per_week not matching the real distinct day count (added 2026-09-16)", () => {
    expect(() =>
      validateSplitCoverage([day("DAY 1", "PULL"), day("DAY 2", "LEGS"), day("DAY 3", "PUSH")] as never, 4)
    ).toThrow(/brief\.days_per_week says 4, but the program actually has 3/);
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

  it("rejects a program that never uses the confirmed skill checkpoint exercise", () => {
    const block = makeBlock({ exercises: [{ name: "Wall Handstand hold", sets: "3", hold_seconds: "20" }] });
    expect(() =>
      validateAthleteFit([block] as never, {
        ...baseFit,
        skills: [{ skill: "handstand", checkpointExercise: "Free Handstand", maxHoldSeconds: 30 }],
      })
    ).toThrow(/No block uses "Free Handstand"/);
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

  it("rejects reps well below the athlete's tested max — the wrong level band's numbers (added 2026-09-16)", () => {
    // The real live bug: tier 7, 30 real pull-ups, got a 6/8/10 ladder —
    // the beginner band's own row (§16), not this athlete's.
    const block = makeBlock({
      metadata: { structure: "ladder", timing_system: "fortime", rounds: "3", time_cap_min: 10, ladder_start: 6, ladder_sub: 2, ladder_direction: "up" },
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "1", reps: "6" }],
    });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 30 })
    ).toThrow(/well below this athlete's tested max of 30/);
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

  it("still applies the floor check to an UNWEIGHTED instance of the same pattern in the same program", () => {
    const block = makeBlock({
      exercises: [{ name: "Pull Ups (Normal Grip)", sets: "3", reps: "6" }],
    });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, pullUpsMax: 30 })
    ).toThrow(/well below this athlete's tested max of 30/);
  });

  it("rejects weighted work with a known logged weight but no number written anywhere", () => {
    const block = makeBlock({ exercises: [{ name: "Dips", sets: "3", reps: "8", is_weighted: true, notes: "focus on control" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, loggedWeights: { dips: 20 } })
    ).toThrow(/no weight number appears/);
  });

  it("accepts weighted work once a real number is written", () => {
    const block = makeBlock({ exercises: [{ name: "Dips", sets: "3", reps: "8", is_weighted: true, notes: "last week 20kg felt good, hold at 20kg" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit, loggedWeights: { dips: 20 } })
    ).not.toThrow();
  });

  it("rejects weighted work with NO logged history and no number either (tightened 2026-09-16)", () => {
    const block = makeBlock({ exercises: [{ name: "Goblet Squat", sets: "3", reps: "8", is_weighted: true, notes: "" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit })
    ).toThrow(/no logged history and no weight number/);
  });

  it("accepts weighted work with no logged history once a real starting estimate is written", () => {
    const block = makeBlock({ exercises: [{ name: "Goblet Squat", sets: "3", reps: "8", is_weighted: true, notes: "start around 10kg added, adjust from feel" }] });
    expect(() =>
      validateAthleteFit([block] as never, { ...baseFit })
    ).not.toThrow();
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

describe("resolveProgramBlocks (added 2026-09-16, Direct Build incremental staging)", () => {
  it("uses input.blocks directly when a non-empty array is provided", () => {
    const inputBlocks = [{ name: "PULL DAY 1 | Strength - 1" }];
    expect(resolveProgramBlocks(inputBlocks, new Map())).toBe(inputBlocks);
  });

  it("ignores a populated draft when blocks are provided directly", () => {
    const inputBlocks = [{ name: "from input" }];
    const draft = new Map([["PULL DAY 1", [{ name: "from draft" }]]]);
    expect(resolveProgramBlocks(inputBlocks, draft)).toBe(inputBlocks);
  });

  it("assembles from the draft when blocks is omitted", () => {
    const draft = new Map([
      ["PULL DAY 1", [{ name: "PULL DAY 1 | Warm-Up" }, { name: "PULL DAY 1 | Strength - 1" }]],
      ["LEGS DAY 2", [{ name: "LEGS DAY 2 | Warm-Up" }]],
    ]);
    expect(resolveProgramBlocks(undefined, draft)).toEqual([
      { name: "PULL DAY 1 | Warm-Up" },
      { name: "PULL DAY 1 | Strength - 1" },
      { name: "LEGS DAY 2 | Warm-Up" },
    ]);
  });

  it("assembles from the draft when blocks is an empty array", () => {
    const draft = new Map([["PULL DAY 1", [{ name: "PULL DAY 1 | Warm-Up" }]]]);
    expect(resolveProgramBlocks([], draft)).toEqual([{ name: "PULL DAY 1 | Warm-Up" }]);
  });

  it("throws a clear error when blocks is omitted and nothing was staged", () => {
    expect(() => resolveProgramBlocks(undefined, new Map())).toThrow(/nothing staged yet via add_program_day/);
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
