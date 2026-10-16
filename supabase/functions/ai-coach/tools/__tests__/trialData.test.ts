// Jest coverage for trialData.ts: the coach's next_trial must be the exact
// trial the app gives the athlete (src/lib/trials.ts), and its hand-kept
// copy of the trial content must match the app's.
import { RITES_OF_PASSAGE as APP_TRIALS, getTrialForTier } from "../../../../../src/lib/trials";
import { getNextTrial, RITES_OF_PASSAGE as COACH_TRIALS } from "../trialData";

describe("getNextTrial", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])("tier %i gets the same trial the app opens", (tier) => {
    expect(getNextTrial(tier)?.name).toBe(getTrialForTier(tier)?.name);
  });

  it("a Helot is told the Helot Trial, not the Neos Trial", () => {
    expect(getNextTrial(0)?.name).toBe("Helot Trial");
  });

  it("clamps out-of-range tiers", () => {
    expect(getNextTrial(-1)?.tier).toBe(0);
    expect(getNextTrial(12)?.tier).toBe(9);
  });
});

// The coach copy abbreviates movement names ("MU", "+20kg", "BW") where the
// app spells them out, so names are not compared; tier, trial name, the
// number of movements and every rep count must match exactly.
describe("coach trial copy", () => {
  it("matches the app's trials: same trials, same movement count, same reps", () => {
    const shape = (trials: Array<{ tier: number; name: string; movements: Array<{ reps: number }> }>) =>
      trials.map((t) => ({ tier: t.tier, name: t.name, reps: t.movements.map((m) => m.reps) }));
    expect(shape(COACH_TRIALS)).toEqual(shape(APP_TRIALS));
  });
});
