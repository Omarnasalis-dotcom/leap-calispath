// The athlete's newer numbers (2026-11-04, owner): the coach is told to
// trust maxes the athlete gives in chat over the onboarding assessment, so
// the build's safety check has to use them too, or it rejects the day.
import { fetchAthleteFitContext, newerMax, validateAthleteFit } from "../blockHelpers";
import { saveAthleteUpdate } from "../saveAthleteUpdate";

const noLogs = {
  rpc: () => Promise.resolve({ data: null }),
  from: () => ({ select: () => ({ not: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }) }),
};

const ASSESSED = {
  assessed_at: "2026-11-02T17:00:00Z",
  assessment_raw: { pullup_variant: "strict_pullup", pullup_reps: 5, dip_variant: "standard_dip", dip_reps: 10, mu_variant: "jumping_mu", mu_reps: 0 },
};

const pullUps = (reps: number) => [{ day_name: "PULL DAY", block_name: "Strength", exercises: [{ name: "Pull Ups (Normal Grip)", sets: "4", reps: String(reps) }] }];

describe("newerMax", () => {
  it("prefers this build's numbers, then saved numbers newer than the assessment", () => {
    expect(newerMax("pull_ups", { pull_ups: 15 }, { current_maxes: { pull_ups: 12, updated_at: "2026-11-03T00:00:00Z" }, assessed_at: ASSESSED.assessed_at })).toBe(15);
    expect(newerMax("pull_ups", undefined, { current_maxes: { pull_ups: 12, updated_at: "2026-11-03T00:00:00Z" }, assessed_at: ASSESSED.assessed_at })).toBe(12);
  });
  it("ignores saved numbers older than the assessment, and junk values", () => {
    expect(newerMax("pull_ups", undefined, { current_maxes: { pull_ups: 12, updated_at: "2026-10-01T00:00:00Z" }, assessed_at: ASSESSED.assessed_at })).toBeNull();
    expect(newerMax("pull_ups", { pull_ups: "lots" }, null)).toBeNull();
    expect(newerMax("pull_ups", { pull_ups: -3 }, null)).toBeNull();
  });
});

describe("fetchAthleteFitContext with newer numbers", () => {
  it("uses the assessment when nothing newer exists (unchanged behaviour)", async () => {
    const fit = await fetchAthleteFitContext(noLogs, { skills: [] }, ASSESSED);
    expect(fit.pullUpsMax).toBe(5);
    expect(() => validateAthleteFit(pullUps(10) as never, fit)).toThrow("at or above this athlete's tested max of 5");
  });
  it("lets a day built on the athlete's newer pull-ups through", async () => {
    const fit = await fetchAthleteFitContext(noLogs, { skills: [], current_maxes: { pull_ups: 15 } }, ASSESSED);
    expect(fit.pullUpsMax).toBe(15);
    expect(() => validateAthleteFit(pullUps(10) as never, fit)).not.toThrow();
    expect(() => validateAthleteFit(pullUps(15) as never, fit)).toThrow("tested max of 15");
  });
  it("uses saved numbers from an earlier chat", async () => {
    const fit = await fetchAthleteFitContext(noLogs, { skills: [] }, { ...ASSESSED, current_maxes: { dips: 20, muscle_ups: 4, updated_at: "2026-11-04T10:00:00Z" } });
    expect(fit.dipsMax).toBe(20);
    expect(fit.muscleUpsMax).toBe(4);
    expect(fit.pullUpsMax).toBe(5);
  });
});

describe("save_athlete_update", () => {
  it("sends equipment and numbers to the RPC", async () => {
    const calls: unknown[] = [];
    const client = { rpc: (fn: string, args: unknown) => { calls.push([fn, args]); return Promise.resolve({ data: { equipment: ["rings"], current_maxes: { muscle_ups: 4 } }, error: null }); } };
    const r = await saveAthleteUpdate.handler(client as never, { equipment: ["rings"], current_maxes: { muscle_ups: 4 } });
    expect(calls).toEqual([["ai_coach_save_athlete_update", { p_equipment: ["rings"], p_current_maxes: { muscle_ups: 4 } }]]);
    expect(r).toEqual({ saved: true, equipment: ["rings"], current_maxes: { muscle_ups: 4 } });
  });
  it("needs something to save, and passes an RPC error on", async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: { message: 'Unknown equipment "bar"' } }) };
    await expect(saveAthleteUpdate.handler(client as never, {})).rejects.toThrow("Nothing to save");
    await expect(saveAthleteUpdate.handler(client as never, { equipment: ["bar"] })).rejects.toThrow('Unknown equipment "bar"');
  });
  it("only offers CoachSetup's equipment ids", () => {
    const items = (saveAthleteUpdate.input_schema.properties as any).equipment.items.enum;
    expect(items.sort()).toEqual(["dip_bar", "free_weights", "low_parallettes", "pull_up_bar", "resistance_bands", "rings", "weight_belt"]);
  });
});
