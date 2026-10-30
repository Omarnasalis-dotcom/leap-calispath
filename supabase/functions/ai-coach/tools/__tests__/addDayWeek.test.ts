import { resolveAddDayWeek } from "../proposeAddDay";
import { daysMissingFromWeek } from "../blockHelpers";

// Fake client for the chains resolveAddDayWeek and isCurrentWeekComplete
// call: warrior_programs (.eq.eq.limit), program_blocks (.eq.eq),
// block_exercises (.in), workout_logs (.eq.in).
function makeClient(opts: {
  program: { id: string; template_id: string; current_week: number } | null;
  weekBlockIds?: string[];
  loggedBlockIds?: string[];
}) {
  const rows: Record<string, unknown[]> = {
    warrior_programs: opts.program ? [opts.program] : [],
    program_blocks: (opts.weekBlockIds ?? []).map((id) => ({ id })),
    block_exercises: (opts.weekBlockIds ?? []).map((id) => ({ block_id: id })),
    workout_logs: (opts.loggedBlockIds ?? []).map((id) => ({ block_id: id })),
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "athlete-1" } } }) },
    from: (table: string) => {
      const result = { data: rows[table] };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "limit"]) chain[method] = () => chain;
      (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
      return chain;
    },
  } as never;
}

describe("resolveAddDayWeek (2026-10-30)", () => {
  it("adds to the athlete's current week while it's in progress", async () => {
    const client = makeClient({
      program: { id: "wp-1", template_id: "t-1", current_week: 6 },
      weekBlockIds: ["b1", "b2"],
      loggedBlockIds: ["b1"],
    });
    await expect(resolveAddDayWeek(client, "WEIGHTED STRENGTH DAY")).resolves.toBe(6);
  });

  it("refuses a finished week and points to the next week build", async () => {
    const client = makeClient({
      program: { id: "wp-1", template_id: "t-1", current_week: 5 },
      weekBlockIds: ["b1", "b2"],
      loggedBlockIds: ["b1", "b2"],
    });
    await expect(resolveAddDayWeek(client, "WEIGHTED STRENGTH DAY")).rejects.toThrow(/Week 5 is finished.*propose_append_week/);
  });

  it("week 1 while a new program is being built (no logs yet)", async () => {
    const client = makeClient({ program: { id: "wp-1", template_id: "t-1", current_week: 1 }, weekBlockIds: ["b1"] });
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
