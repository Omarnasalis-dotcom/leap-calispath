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

  it("accepts a circuit block once rounds is set", () => {
    expect(() =>
      validateBlockStructure([makeBlock({ metadata: { structure: "circuit", rounds: "3" } })] as never, { requireDayPhases: false })
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
          exercises: [{ name: "Pull Ups (Normal Grip)", reps: "22" }],
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

  // Confirmed gap, not a regression: BLOCKS_SCHEMA's own description says
  // "when rounds is set, every exercise's sets is '1'", but nothing in this
  // function actually checks it — schema prose only. Documenting the real
  // current behavior (accepts it) rather than a rule that doesn't exist,
  // so this test breaks loudly the day someone adds that check without
  // updating this comment.
  it("does NOT currently reject a rounds-based block whose exercise sets isn't \"1\" (known gap)", () => {
    expect(() =>
      validateBlockStructure(
        [makeBlock({ metadata: { structure: "circuit", rounds: "3" }, exercises: [{ name: "Push Ups", sets: "3", reps: "10" }] })] as never,
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
    exercises: [{ name: "Banded Arm Circles" }, { name: "Inchworm" }, { name: "Scapula Push Ups" }, { name: "Wrist Pressure" }],
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
      exercises: [{ name: "Pull Ups (Normal Grip)", reps: "22" }],
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
        [{ name: "PULL DAY 1 | Strength - 1", metadata: merged, exercises: [{ reps: "22" }] }] as never,
        { requireDayPhases: false }
      )
    ).not.toThrow();
  });
});
