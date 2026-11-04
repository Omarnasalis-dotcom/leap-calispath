// Equipment heads-up (2026-11-04, owner): seen live, an athlete with rings
// and low parallettes (no bar, no band) got Band Apart, bar pull-ups and
// inverted rows. Owner rule: the coach keeps room to choose, so the server
// only notes a mismatch and never changes a pick. Library rows below are the
// real prod category/difficulty.
import { buildServerWarmUpCoolDown } from "../blockHelpers";
import { equipmentFlags, equipmentNotes, ringVersion } from "../equipmentFit";

const LIBRARY: Record<string, { category: string; difficulty: string }> = {
  "Banded Arm Circles": { category: "mobility,mobility", difficulty: "beginner" },
  "banded Shoulder External Rotation": { category: "mobility,mobility", difficulty: "beginner" },
  "Band Apart": { category: "pull,mobility", difficulty: "beginner" },
  "wrist pressure": { category: "mobility,mobility", difficulty: "beginner" },
  "Scapula Pulls": { category: "pull,mobility", difficulty: "beginner" },
  "Scapula Push Ups": { category: "push,mobility", difficulty: "beginner" },
  "Inchworm": { category: "push,skill", difficulty: "beginner" },
  "I, Y, T Rasies": { category: "pull,mobility", difficulty: "beginner" },
  "In out Circles": { category: "mobility,mobility", difficulty: "beginner" },
  "rotator cuff Rotations": { category: "mobility,mobility", difficulty: "beginner" },
  "Wrist swings": { category: "mobility,mobility", difficulty: "beginner" },
};

const client = {
  from: () => ({
    select: () => ({
      in: (_col: string, names: string[]) =>
        Promise.resolve({ data: names.filter((n) => LIBRARY[n]).map((name) => ({ name, ...LIBRARY[name] })) }),
    }),
  }),
};

const warmUpNames = async (opts: Parameters<typeof buildServerWarmUpCoolDown>[7]) => {
  const blocks = await buildServerWarmUpCoolDown(client, "PULL DAY 1", "PULL", undefined, undefined, true, false, opts);
  return blocks.find((b) => b.block_name === "Warm-Up")!.exercises.map((e) => e.name);
};

describe("equipmentFlags", () => {
  it("reads setup ids and plain words", () => {
    expect(equipmentFlags(["rings", "parallettes"])).toEqual({ band: false, rings: true, pullBar: false, dipBar: false });
    expect(equipmentFlags(["pull_up_bar", "dip_bar", "resistance_bands", "low_parallettes"])).toEqual({ band: true, rings: false, pullBar: true, dipBar: true });
    expect(equipmentFlags(["bar", "bands"])).toMatchObject({ band: true, pullBar: true });
    expect(equipmentFlags(["parallel bars"])).toMatchObject({ pullBar: false, dipBar: true });
    expect(equipmentFlags([])).toEqual({ band: false, rings: false, pullBar: false, dipBar: false });
    expect(equipmentFlags(undefined)).toEqual({ band: false, rings: false, pullBar: false, dipBar: false });
    expect(equipmentFlags(["full setup"])).toEqual({ band: true, rings: true, pullBar: true, dipBar: true });
    expect(equipmentFlags(["Everything"])).toEqual({ band: true, rings: true, pullBar: true, dipBar: true });
    expect(equipmentFlags(["gym"])).toEqual({ band: true, rings: true, pullBar: true, dipBar: true });
  });
});

describe("ringVersion", () => {
  it("names the ring version, and bench dips for a beginner", () => {
    expect(ringVersion("Pull Ups (Normal Grip)", "intermediate")).toBe("Ring Pull ups");
    expect(ringVersion("Inverted Row", "beginner")).toBe("Ring Row");
    expect(ringVersion("Dips", "intermediate")).toBe("Ring Dips");
    expect(ringVersion("Dips", "beginner")).toBe("Triceps box dips");
    expect(ringVersion("Muscle Up", "intermediate")).toBeNull();
  });
});

describe("equipmentNotes", () => {
  const liveDay = () => [
    { block_name: "Warm-Up", exercises: [{ name: "Band Apart" }, { name: "Scapula Pulls" }] },
    { block_name: "Strength", exercises: [{ name: "Pull Ups (Normal Grip)" }] },
    { block_name: "Accessories", exercises: [{ name: "Inverted Row" }, { name: "Hanging Leg Rasies" }] },
    { block_name: "Skills", exercises: [{ name: "Muscle Up" }] },
  ];
  it("notes the live 2026-11-04 mismatches and changes nothing", () => {
    const blocks = liveDay();
    const notes = equipmentNotes(blocks, equipmentFlags(["rings", "parallettes"]), "beginner");
    expect(blocks).toEqual(liveDay());
    expect(notes).toHaveLength(5);
    expect(notes.join(" ")).toContain('"Muscle Up" has no ring entry');
    expect(notes.join(" ")).toContain('"Hanging Leg Rasies" has no ring entry');
    expect(notes.join(" ")).toContain('"Band Apart" needs a band');
    expect(notes.join(" ")).toContain('"Ring Pull ups" is the version for their rings');
    expect(notes.join(" ")).toContain('"Ring Row" is the version for their rings');
    // Bar and band notes leave the choice to the coach.
    expect(notes.filter((n) => /needs a/.test(n)).every((n) => /Keep it/.test(n))).toBe(true);
    // Server-built warm-up exercises get no "on rings" reminder (no note to add there).
    expect(notes.join(" ")).not.toContain('"Scapula Pulls" has no ring entry');
  });
  it("stays quiet once the note already says rings", () => {
    const notes = equipmentNotes([{ block_name: "Skills", exercises: [{ name: "Muscle Up", notes: "On rings" }] }], equipmentFlags(["rings"]), "intermediate");
    expect(notes).toEqual([]);
  });
  it("without rings, notes the bar but suggests no ring version", () => {
    const notes = equipmentNotes([{ block_name: "Strength", exercises: [{ name: "Pull Ups (Normal Grip)" }] }], equipmentFlags(["low_parallettes"]), "intermediate");
    expect(notes).toHaveLength(1);
    expect(notes[0]).not.toContain("version for their rings");
  });
  it("says nothing for full equipment", () => {
    expect(equipmentNotes(liveDay(), equipmentFlags(["pull_up_bar", "dip_bar", "rings", "resistance_bands"]), "intermediate")).toEqual([]);
    expect(equipmentNotes(liveDay(), equipmentFlags(["full setup"]), "intermediate")).toEqual([]);
  });
});

describe("warm-up without a band", () => {
  it("keeps the coach's own band pick (the coach decides)", async () => {
    const names = await warmUpNames({ levelBand: "beginner", warmUpNames: ["Band Apart", "Scapula Pulls", "I, Y, T Rasies"], noBand: true });
    expect(names).toEqual(["Band Apart", "Scapula Pulls", "I, Y, T Rasies"]);
  });
  it("tops up a short pick list without band work", async () => {
    const names = await warmUpNames({ levelBand: "beginner", warmUpNames: ["Scapula Pulls"], noBand: true });
    expect(names.some((n) => /band/i.test(n))).toBe(false);
    expect(names.length).toBeGreaterThanOrEqual(3);
  });
  it("builds the fallback warm-up with no band work", async () => {
    const names = await warmUpNames({ levelBand: "intermediate", noBand: true });
    expect(names.some((n) => /band/i.test(n))).toBe(false);
    expect(names.length).toBeGreaterThanOrEqual(3);
  });
  it("keeps band work for an athlete who has a band", async () => {
    const names = await warmUpNames({ levelBand: "intermediate", warmUpNames: ["Band Apart", "Scapula Pulls", "I, Y, T Rasies"] });
    expect(names).toContain("Band Apart");
  });
});
