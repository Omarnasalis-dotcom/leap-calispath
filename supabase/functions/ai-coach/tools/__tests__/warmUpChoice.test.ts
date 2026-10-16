// Jest coverage for the coach-chosen Warm-Up and need-based Mobility
// (2026-10-16, owner): the coach sends exercise names only, the server sets
// the volume by level, and nothing the coach picks can reject a day.
// Library rows below are the real prod category/difficulty values.
import {
  assembleDayWithServerBlocks,
  buildServerWarmUpCoolDown,
  normalizeBlockStructure,
  validateAthleteFit,
  validateBlockStructure,
} from "../blockHelpers";

const LIBRARY: Record<string, { category: string; difficulty: string }> = {
  "Banded Arm Circles": { category: "mobility,mobility", difficulty: "beginner" },
  "banded Shoulder External Rotation": { category: "mobility,mobility", difficulty: "beginner" },
  "wrist pressure": { category: "mobility,mobility", difficulty: "beginner" },
  "Inchworm": { category: "push,skill", difficulty: "beginner" },
  "Scapula Push Ups": { category: "push,mobility", difficulty: "beginner" },
  "Scapula Pulls": { category: "pull,mobility", difficulty: "beginner" },
  "Band Apart": { category: "pull,mobility", difficulty: "beginner" },
  "I, Y, T Rasies": { category: "pull,mobility", difficulty: "beginner" },
  "Reverse Lunges": { category: "legs,strength", difficulty: "beginner" },
  "Hip Flexors Stretch": { category: "flexibility,flexibility", difficulty: "beginner" },
  "Air Squat": { category: "legs,strength", difficulty: "beginner" },
  "Glutes Bridge": { category: "legs,strength", difficulty: "beginner" },
  "Hip CARs": { category: "mobility,mobility", difficulty: "intermediate" },
  "Pike Walk out": { category: "mobility,mobility", difficulty: "intermediate" },
  "Prone Shoulder opener": { category: "mobility,mobility", difficulty: "intermediate" },
  "Pull Ups (Normal Grip)": { category: "pull,strength", difficulty: "intermediate" },
  "Push Ups": { category: "push,strength", difficulty: "beginner" },
  "Tuck Front Lever Hold": { category: "pull,skill", difficulty: "beginner" },
  "Jumping Lunges": { category: "legs,strength", difficulty: "intermediate" },
  "Childe Pose": { category: "flexibility,flexibility", difficulty: "beginner" },
  "Shoulder stretch": { category: "flexibility,flexibility", difficulty: "beginner" },
  "Child Pose Sided": { category: "flexibility,flexibility", difficulty: "beginner" },
  "Lat Stretch SH Opener": { category: "push,flexibility", difficulty: "beginner" },
  "Pancake Stretch": { category: "flexibility,flexibility", difficulty: "intermediate" },
  "Laying Hamstring Stretch": { category: "flexibility,flexibility", difficulty: "beginner" },
  "Adductor Stretch": { category: "flexibility,flexibility", difficulty: "beginner" },
};

const client = {
  from: () => ({
    select: () => ({
      in: (_col: string, names: string[]) =>
        Promise.resolve({ data: names.filter((n) => LIBRARY[n]).map((name) => ({ name, ...LIBRARY[name] })) }),
    }),
  }),
};

const names = (b: { exercises: Array<{ name?: string }> }) => b.exercises.map((e) => e.name);
const strengthBlock = (day: string, focus: string) => ({
  name: `${day} | Strength - 1`,
  metadata: { timing_system: "straight_set", structure: "single", focus_tag: focus },
  exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: "6" }],
});

describe("warm-up volume by level", () => {
  it("beginners get 1 round of 8, at most 4 exercises, no rest_after_round", async () => {
    const [warmUp] = await buildServerWarmUpCoolDown(client, "PULL DAY", "PULL", undefined, undefined, true, false, { levelBand: "beginner" });
    expect(warmUp.metadata).toMatchObject({ structure: "circuit", rounds: "1" });
    expect(warmUp.metadata).not.toHaveProperty("rest_after_round");
    expect(warmUp.exercises).toHaveLength(4);
    expect(warmUp.exercises.every((e) => e.reps === "8" && e.sets === "1")).toBe(true);
  });

  it("intermediate and advanced keep 2 rounds of 10 with 60s after the round", async () => {
    for (const levelBand of ["intermediate", "advanced"] as const) {
      const [warmUp] = await buildServerWarmUpCoolDown(client, "PULL DAY", "PULL", undefined, undefined, true, false, { levelBand });
      expect(warmUp.metadata).toMatchObject({ rounds: "2", rest_after_round: 60 });
      expect(warmUp.exercises.every((e) => e.reps === "10")).toBe(true);
    }
  });

  it("a beginner's fallback legs warm-up has no Inchworm or Reverse Lunges", async () => {
    const [warmUp] = await buildServerWarmUpCoolDown(client, "LEGS DAY", "LEGS", undefined, undefined, true, false, { levelBand: "beginner" });
    expect(names(warmUp)).toEqual(["Air Squat", "Glutes Bridge", "Hip Flexors Stretch", "Banded Arm Circles"]);
  });
});

describe("coach-chosen warm-up names", () => {
  it("uses the coach's picks in order", async () => {
    const [warmUp] = await buildServerWarmUpCoolDown(client, "PULL DAY", "PULL", undefined, undefined, true, false, {
      levelBand: "intermediate",
      warmUpNames: ["Scapula Pulls", "I, Y, T Rasies", "Band Apart", "wrist pressure"],
    });
    expect(names(warmUp)).toEqual(["Scapula Pulls", "I, Y, T Rasies", "Band Apart", "wrist pressure"]);
  });

  it("drops unknown, main-lift, skill-checkpoint, too-hard and repeated picks, and notes each one", async () => {
    const notes: string[] = [];
    const [warmUp] = await buildServerWarmUpCoolDown(client, "PULL DAY", "PULL", undefined, undefined, true, false, {
      levelBand: "intermediate",
      warmUpNames: ["Scapula Pulls", "Dumbbell Thing", "Pull Ups (Normal Grip)", "Tuck Front Lever Hold", "Jumping Lunges", "scapula pulls", "Band Apart", "Inchworm"],
      excludeNames: ["Tuck Front Lever Hold"],
      notes,
    });
    expect(names(warmUp)).toEqual(["Scapula Pulls", "Band Apart", "Inchworm"]);
    expect(notes).toEqual([
      'Warm-Up: dropped "Dumbbell Thing" (not an exact library name).',
      'Warm-Up: dropped "Pull Ups (Normal Grip)" (a main movement checked against the athlete\'s max, not a warm-up).',
      'Warm-Up: dropped "Tuck Front Lever Hold" (a main movement checked against the athlete\'s max, not a warm-up).',
      'Warm-Up: dropped "Jumping Lunges" (not a beginner, mobility or flexibility exercise).',
      'Warm-Up: dropped "scapula pulls" (listed twice).',
    ]);
  });

  it("tops up to 3 from the fallback list when too few picks survive", async () => {
    const notes: string[] = [];
    const [warmUp] = await buildServerWarmUpCoolDown(client, "PULL DAY", "PULL", undefined, undefined, true, false, {
      warmUpNames: ["Scapula Pulls", "Nope"],
      notes,
    });
    expect(names(warmUp)).toEqual(["Scapula Pulls", "Banded Arm Circles", "banded Shoulder External Rotation"]);
    expect(notes).toContain("Warm-Up: topped up to 3 exercises from the standard list.");
  });

  it("caps a beginner at 4 picks", async () => {
    const [warmUp] = await buildServerWarmUpCoolDown(client, "PULL DAY", "PULL", undefined, undefined, true, false, {
      levelBand: "beginner",
      warmUpNames: ["Scapula Pulls", "Band Apart", "I, Y, T Rasies", "wrist pressure", "Banded Arm Circles"],
    });
    expect(warmUp.exercises).toHaveLength(4);
  });

  it("ignores picks when the coach wrote its own Warm-Up block", async () => {
    const blocks = await buildServerWarmUpCoolDown(client, "PULL DAY", "PULL", undefined, undefined, false, true, {
      warmUpNames: ["Scapula Pulls", "Band Apart", "wrist pressure"],
    });
    expect(blocks.map((b) => b.block_name)).toEqual(["Cool-Down"]);
  });
});

describe("Mobility only when asked for", () => {
  it("no mobility names, no Mobility block, even on a push day", async () => {
    const blocks = await buildServerWarmUpCoolDown(client, "PUSH DAY", "PUSH", "push", undefined, true, false, {});
    expect(blocks.map((b) => b.block_name)).toEqual(["Warm-Up"]);
  });

  it("builds Mobility from mobility/flexibility picks only", async () => {
    const notes: string[] = [];
    const blocks = await buildServerWarmUpCoolDown(client, "PUSH DAY", "PUSH", undefined, undefined, true, false, {
      levelBand: "advanced",
      mobilityNames: ["Pike Walk out", "Prone Shoulder opener", "Air Squat"],
      notes,
    });
    const mobility = blocks.find((b) => b.block_name === "Mobility")!;
    expect(names(mobility)).toEqual(["Pike Walk out", "Prone Shoulder opener"]);
    expect(mobility.metadata).toMatchObject({ structure: "circuit", rounds: "2" });
    expect(notes).toEqual(['Mobility: dropped "Air Squat" (not a beginner, mobility or flexibility exercise).']);
  });

  it("adds no Mobility block when no pick is usable", async () => {
    const notes: string[] = [];
    const blocks = await buildServerWarmUpCoolDown(client, "PUSH DAY", "PUSH", undefined, undefined, true, false, { mobilityNames: ["Nope"], notes });
    expect(blocks.map((b) => b.block_name)).toEqual(["Warm-Up"]);
    expect(notes).toContain("Mobility: no usable exercise, so no Mobility block was added.");
  });
});

describe("assembled day", () => {
  it("orders Warm-Up, Mobility, the coach's blocks, Cool-Down", async () => {
    const day = await assembleDayWithServerBlocks(client, [strengthBlock("PUSH DAY", "PUSH")] as never, "PUSH DAY", undefined, undefined, {
      mobilityNames: ["Pike Walk out", "Hip CARs"],
    });
    expect(day.map((b) => (b.block_name ?? b.name))).toEqual(["Warm-Up", "Mobility", "PUSH DAY | Strength - 1", "Cool-Down"]);
    expect(day.map((b) => b.order_index)).toEqual([0, 1, 2, 3]);
  });

  it("puts Mobility right after a Warm-Up the coach wrote itself", async () => {
    const ownWarmUp = {
      name: "PUSH DAY | Warm-Up",
      metadata: { timing_system: "straight_set", structure: "circuit", focus_tag: "PUSH", rounds: "2" },
      exercises: [{ name: "Banded Arm Circles", sets: "1", reps: "10" }, { name: "wrist pressure", sets: "1", reps: "10" }, { name: "Inchworm", sets: "1", reps: "10" }],
    };
    const day = await assembleDayWithServerBlocks(client, [ownWarmUp, strengthBlock("PUSH DAY", "PUSH")] as never, "PUSH DAY", undefined, undefined, {
      mobilityNames: ["Pike Walk out"],
    });
    expect(day.map((b) => (b.block_name ?? b.name))).toEqual(["PUSH DAY | Warm-Up", "Mobility", "PUSH DAY | Strength - 1", "Cool-Down"]);
  });

  it("a Mobility block the coach wrote wins over its mobility names", async () => {
    const ownMobility = {
      name: "PUSH DAY | Mobility",
      metadata: { timing_system: "straight_set", structure: "circuit", focus_tag: "PUSH", rounds: "2" },
      exercises: [{ name: "Hip CARs", sets: "1", reps: "10" }],
    };
    const day = await assembleDayWithServerBlocks(client, [ownMobility, strengthBlock("PUSH DAY", "PUSH")] as never, "PUSH DAY", undefined, undefined, {
      mobilityNames: ["Pike Walk out"],
    });
    expect(day.filter((b) => (b.block_name ?? b.name ?? "").includes("Mobility"))).toHaveLength(1);
  });

  it.each([["beginner"], ["intermediate"], ["advanced"]] as const)(
    "a %s day with picks and mobility passes normalize + validate + athlete fit",
    async (levelBand) => {
      const day = await assembleDayWithServerBlocks(client, [strengthBlock("PULL DAY", "PULL")] as never, "PULL DAY", undefined, undefined, {
        levelBand,
        warmUpNames: ["Scapula Pulls", "Pull Ups (Normal Grip)", "Band Apart", "wrist pressure"],
        mobilityNames: ["Hip CARs"],
      });
      await normalizeBlockStructure(day as never, levelBand, client);
      expect(() => validateBlockStructure(day as never, { requireDayPhases: true })).not.toThrow();
      // An athlete with 0 strict pull-ups: the picked "Pull Ups (Normal Grip)"
      // was dropped, so only the coach's own Strength block can trip this.
      const warmUpOnly = day.filter((b) => !(b.name ?? "").includes("Strength"));
      expect(() => validateAthleteFit(warmUpOnly as never, { pullUpsMax: 0, dipsMax: 2, pushUpsMax: 5, muscleUpsMax: 0, skills: [] })).not.toThrow();
    }
  );
});
