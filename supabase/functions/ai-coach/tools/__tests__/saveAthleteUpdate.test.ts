jest.mock("https://esm.sh/@supabase/supabase-js@2.112.0", () => ({}), { virtual: true });
import { saveAthleteUpdate } from "../saveAthleteUpdate";

const client = (answers: Record<string, unknown> = {}) => {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      const answer = answers[name];
      return answer instanceof Error ? { data: null, error: answer } : { data: answer ?? {}, error: null };
    },
  };
};
const run = (c: ReturnType<typeof client>, input: Record<string, unknown>) =>
  saveAthleteUpdate.handler(c as never, input) as Promise<Record<string, unknown>>;

describe("save_athlete_update", () => {
  it("saves notes alone, without touching equipment or maxes", async () => {
    const c = client({ ai_coach_save_training_notes: ["Football covers legs"] });
    const out = await run(c, { training_notes: ["Football covers legs"] });
    expect(c.calls.map((x) => x[0])).toEqual(["ai_coach_save_training_notes"]);
    expect(out).toEqual({ saved: true, training_notes: ["Football covers legs"] });
  });

  it("still saves equipment and maxes the old way, with no notes call", async () => {
    const c = client({ ai_coach_save_athlete_update: { equipment: ["rings"], current_maxes: null } });
    await run(c, { equipment: ["rings"] });
    expect(c.calls).toEqual([["ai_coach_save_athlete_update", { p_equipment: ["rings"], p_current_maxes: null }]]);
  });

  it("saves both together", async () => {
    const c = client({ ai_coach_save_athlete_update: { equipment: ["rings"] }, ai_coach_save_training_notes: ["x"] });
    const out = await run(c, { equipment: ["rings"], training_notes: ["x"] });
    expect(out).toEqual({ saved: true, equipment: ["rings"], training_notes: ["x"] });
  });

  it("clears the notes with an empty list", async () => {
    const c = client({ ai_coach_save_training_notes: [] });
    await run(c, { training_notes: [] });
    expect(c.calls[0]).toEqual(["ai_coach_save_training_notes", { p_notes: [] }]);
  });

  it("refuses an empty save and reports a failed one", async () => {
    await expect(run(client(), {})).rejects.toThrow("Nothing to save");
    const c = client({ ai_coach_save_training_notes: new Error("Keep training_notes to 10 short notes") });
    await expect(run(c, { training_notes: ["x"] })).rejects.toThrow("10 short notes");
  });
});
