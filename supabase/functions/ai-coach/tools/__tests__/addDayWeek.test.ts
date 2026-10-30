import { resolveAddDayWeek } from "../proposeAddDay";
import { computeAddBlockOrder, computeAppendWeekOrdering, daysMissingFromWeek, fetchLoggedWeights, findRenameDuplicates, phaseRank, warnMissingWeights, withExistingDaySpelling } from "../blockHelpers";

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

describe("rename duplicates in a week build (2026-10-30)", () => {
  const carried = [
    { name: "WEIGHTED STRENGTH DAY | Strength - 1", exerciseNames: ["Pull Ups (Normal Grip)"] },
    { name: "WEIGHTED STRENGTH DAY | Strength - 2", exerciseNames: ["Dips"] },
    { name: "WEIGHTED STRENGTH DAY | Warm-Up", exerciseNames: ["Inchworm"] },
  ];

  it("flags the live case: a new Strength block repeating both old Strength blocks", () => {
    const found = findRenameDuplicates(
      [{ name: "WEIGHTED STRENGTH DAY | Strength", exerciseNames: ["Pull Ups (Normal Grip)", "Dips"] }],
      carried
    );
    expect(found.map((d) => d.oldName)).toEqual(["WEIGHTED STRENGTH DAY | Strength - 1", "WEIGHTED STRENGTH DAY | Strength - 2"]);
  });

  it("never flags the same exercise in a different phase", () => {
    expect(findRenameDuplicates([{ name: "WEIGHTED STRENGTH DAY | Finisher", exerciseNames: ["Inchworm"] }], carried)).toEqual([]);
  });

  it("never flags a different day or a block with no shared exercise", () => {
    expect(findRenameDuplicates([{ name: "PULL DAY | Strength", exerciseNames: ["Dips"] }], carried)).toEqual([]);
    expect(findRenameDuplicates([{ name: "WEIGHTED STRENGTH DAY | Strength - 3", exerciseNames: ["Weighted Chin Ups"] }], carried)).toEqual([]);
  });

  function weekClient() {
    const rows: Record<string, Array<Record<string, unknown>>> = {
      warrior_programs: [{ template_id: "t-1" }],
      program_blocks: [
        { id: "s1", name: "WEIGHTED STRENGTH DAY | Strength - 1", order_index: 0, week_number: 6 },
        { id: "s2", name: "WEIGHTED STRENGTH DAY | Strength - 2", order_index: 1, week_number: 6 },
      ],
      block_exercises: [
        { block_id: "s1", exercise_library: { name: "Pull Ups (Normal Grip)" } },
        { block_id: "s2", exercise_library: { name: "Dips" } },
      ],
    };
    return {
      from: (table: string) => {
        let data = rows[table];
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = (column: string, values: unknown[]) => {
          data = data.filter((row) => values.includes(row[column]));
          return chain;
        };
        (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data });
        return chain;
      },
    } as never;
  }
  const rebuilt = [{ name: "WEIGHTED STRENGTH DAY | Strength", exercises: [{ name: "Pull Ups (Normal Grip)" }, { name: "Dips" }] }];

  it("the week build refuses it, naming both fixes", async () => {
    await expect(computeAppendWeekOrdering(weekClient(), "wp-1", rebuilt as never, undefined)).rejects.toThrow(
      /repeats Pull Ups \(Normal Grip\) from last week's "WEIGHTED STRENGTH DAY \| Strength - 1".*removed_block_names/
    );
  });

  it("passes once the old blocks are listed in removed_block_names", async () => {
    const result = await computeAppendWeekOrdering(weekClient(), "wp-1", rebuilt as never, [
      "WEIGHTED STRENGTH DAY | Strength - 1",
      "WEIGHTED STRENGTH DAY | Strength - 2",
    ]);
    expect(result.carryOrderOverrides).toEqual({});
  });
});

describe("weights in week builds (2026-10-30)", () => {
  it("top set of the most recent session, not just its newest row", async () => {
    const rows = [
      { weight_used: 20, workout_log_id: "w6", exercise_library: { name: "Dips" } },
      { weight_used: 22.5, workout_log_id: "w6", exercise_library: { name: "Dips" } },
      { weight_used: 30, workout_log_id: "w5", exercise_library: { name: "Dips" } },
    ];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "not", "order", "limit"]) chain[m] = () => chain;
    (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: rows });
    await expect(fetchLoggedWeights({ from: () => chain } as never)).resolves.toEqual({ dips: 22.5 });
  });

  it("reminds about a rewritten weighted exercise with no weight, never blocks", () => {
    const blocks = [{ name: "LEGS DAY | Strength", exercises: [
      { name: "Goblet Squat", is_weighted: true, notes: "" },
      { name: "Bulgarian Split Squat", is_weighted: true, notes: "" },
      { name: "Dips", is_weighted: true, notes: "27.5 kg" },
      { name: "Glutes Bridge", is_weighted: false, notes: "" },
    ] }];
    const warnings = warnMissingWeights(blocks as never, { "goblet squat": 27.5 });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/Goblet Squat.*top set was 27.5kg/);
    expect(warnings[1]).toMatch(/Bulgarian Split Squat.*rep range and RPE/);
  });
});
