import { resolveAddDayWeek } from "../proposeAddDay";
import { computeAddBlockOrder, daysMissingFromWeek, phaseRank, withExistingDaySpelling } from "../blockHelpers";

// Fake client for the chains resolveAddDayWeek and isCurrentWeekComplete
// call: warrior_programs (.eq.eq.limit), program_blocks (.eq.eq),
// block_exercises (.in), workout_logs (.eq.in).
function makeClient(opts: {
  program: { id: string; template_id: string; current_week: number } | null;
  weekBlocks?: Array<{ id: string; name: string }>;
  loggedBlockIds?: string[];
}) {
  const rows: Record<string, unknown[]> = {
    warrior_programs: opts.program ? [opts.program] : [],
    program_blocks: opts.weekBlocks ?? [],
    block_exercises: (opts.weekBlocks ?? []).map((b) => ({ block_id: b.id })),
    workout_logs: (opts.loggedBlockIds ?? []).map((id) => ({ block_id: id })),
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "athlete-1" } } }) },
    from: (table: string) => {
      let data = rows[table] as Array<Record<string, unknown>>;
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "limit"]) chain[method] = () => chain;
      chain.in = (column: string, values: unknown[]) => {
        data = data.filter((row) => values.includes(row[column]));
        return chain;
      };
      (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data });
      return chain;
    },
  } as never;
}

const program = (current_week: number) => ({ id: "wp-1", template_id: "t-1", current_week });
const week6 = [
  { id: "b1", name: "LEGS DAY | Strength" },
  { id: "b2", name: "WEIGHTED STRENGTH DAY | Strength" },
];

describe("resolveAddDayWeek (2026-10-30)", () => {
  it("adds a new day to the athlete's current week while it's in progress", async () => {
    const client = makeClient({ program: program(6), weekBlocks: week6, loggedBlockIds: ["b1"] });
    await expect(resolveAddDayWeek(client, "MOBILITY DAY")).resolves.toBe(6);
  });

  it("replaces a day of the current week that isn't logged yet", async () => {
    const client = makeClient({ program: program(6), weekBlocks: week6, loggedBlockIds: ["b1"] });
    await expect(resolveAddDayWeek(client, "Weighted Strength Day")).resolves.toBe(6);
  });

  it("refuses to replace a day with a logged block, pointing to the next week build", async () => {
    const client = makeClient({ program: program(6), weekBlocks: week6, loggedBlockIds: ["b1"] });
    await expect(resolveAddDayWeek(client, "LEGS DAY")).rejects.toThrow(/already logged.*propose_append_week/);
  });

  it("refuses a finished week and points to the next week build", async () => {
    const client = makeClient({ program: program(5), weekBlocks: week6, loggedBlockIds: ["b1", "b2"] });
    await expect(resolveAddDayWeek(client, "WEIGHTED STRENGTH DAY")).rejects.toThrow(/Week 5 is finished.*propose_append_week/);
  });

  it("week 1 while a new program is being built (no logs yet)", async () => {
    const client = makeClient({ program: program(1), weekBlocks: [{ id: "b1", name: "PULL DAY | Strength" }] });
    await expect(resolveAddDayWeek(client, "LEGS DAY")).resolves.toBe(1);
  });

  it("week 1 when there is no active program", async () => {
    await expect(resolveAddDayWeek(makeClient({ program: null }), "LEGS DAY")).resolves.toBe(1);
  });
});

describe("daysMissingFromWeek (2026-10-30)", () => {
  const week = ["PULL DAY | Warm-Up", "PULL DAY | Strength", "LEGS DAY | Strength"];

  it("a block for an existing day passes, matched ignoring case and spacing", () => {
    expect(daysMissingFromWeek([{ day_name: "Pull  Day", block_name: "Skills", exercises: [] }] as never, week)).toEqual([]);
  });

  it("a block for a day the week doesn't have is reported once", () => {
    const blocks = [
      { day_name: "WEIGHTED STRENGTH DAY", block_name: "Warm-Up", exercises: [] },
      { day_name: "WEIGHTED STRENGTH DAY", block_name: "Cool-Down", exercises: [] },
    ];
    expect(daysMissingFromWeek(blocks as never, week)).toEqual(["WEIGHTED STRENGTH DAY"]);
  });
});

describe("block positions in a written week (2026-10-30)", () => {
  it("an unrecognised phase sorts after Finisher and before Cool-Down", () => {
    expect(phaseRank("Core")).toBeGreaterThan(phaseRank("Finisher"));
    expect(phaseRank("Core")).toBeLessThan(phaseRank("Cool-Down"));
  });

  it("a Skills block added to an existing day lands inside it, after its Warm-Up", () => {
    const week = [
      { name: "PULL DAY | Warm-Up", order_index: 0 },
      { name: "PULL DAY | Strength", order_index: 1 },
      { name: "PULL DAY | Cool-Down", order_index: 2 },
      { name: "WEIGHTED STRENGTH DAY | Warm-Up", order_index: 3 },
      { name: "WEIGHTED STRENGTH DAY | Strength - 1", order_index: 4 },
      { name: "WEIGHTED STRENGTH DAY | Cool-Down", order_index: 5 },
    ];
    const order: Record<string, number> = computeAddBlockOrder(week, ["WEIGHTED STRENGTH DAY | Skills"]);
    const sorted = Object.keys(order).sort((a, b) => order[a] - order[b]);
    expect(sorted).toEqual([
      "PULL DAY | Warm-Up",
      "PULL DAY | Strength",
      "PULL DAY | Cool-Down",
      "WEIGHTED STRENGTH DAY | Warm-Up",
      "WEIGHTED STRENGTH DAY | Skills",
      "WEIGHTED STRENGTH DAY | Strength - 1",
      "WEIGHTED STRENGTH DAY | Cool-Down",
    ]);
    expect(Object.values(order).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("a new block uses the week's own spelling of its day", () => {
    const existing = ["PULL DAY | Warm-Up", "PULL DAY | Strength"];
    expect(withExistingDaySpelling("Pull  Day | Skills", existing)).toBe("PULL DAY | Skills");
    expect(withExistingDaySpelling("PULL DAY | Skills", existing)).toBe("PULL DAY | Skills");
  });
});
