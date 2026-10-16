import { climbOptions, climbTrialTier, getTrialStep, isClimbItemAvailable, nextClimbItem, plusTwo, sameClimbItem, stepCount } from '../trialSteps';
import { RITES_OF_PASSAGE } from '../trials';
import { TIER_HARD_FLOORS } from '../../constants/Progression';

// Tests are written per BASE trial; the API takes the athlete's tier (base + 1).
const names = (base: number, step: 1 | 2) => getTrialStep(base + 1, step)!.movements.map(m => `${m.name} × ${m.reps}`);

describe('trialSteps', () => {
  it('gives Helot athletes no steps, Neos 1, Ephebe–Eternity 2', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(stepCount)).toEqual([0, 1, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(getTrialStep(0, 1)).toBeUndefined();
    expect(getTrialStep(1, 2)).toBeUndefined();
    expect(getTrialStep(10, 1)).toBeUndefined();
  });

  it('builds a Spartan athlete\'s steps from the Hoplite trial', () => {
    const s = getTrialStep(4, 1)!;
    expect([s.tier, s.baseTier, s.minSeconds]).toEqual([4, 3, TIER_HARD_FLOORS[3]]);
    expect(s.movements[0].name).toBe('1 Banded Muscle-up + 2 Pull-ups');
  });

  it('adds 2 to every part of a combined round, or to the reps', () => {
    expect(plusTwo({ name: '2 Inv Row + 4 Inc Push-ups', reps: 1 })).toEqual({ name: '4 Inv Row + 6 Inc Push-ups', reps: 1 });
    expect(plusTwo({ name: '2 Assist Pull + 2 Bar Dips + 2 Knee Raise', reps: 1 })).toEqual({ name: '4 Assist Pull + 4 Bar Dips + 4 Knee Raise', reps: 1 });
    expect(plusTwo({ name: 'Squats', reps: 10 })).toEqual({ name: 'Squats', reps: 12 });
  });

  it('builds the approved Helot step', () => {
    expect(names(0, 1)).toEqual([
      'Incline Push-ups × 4', 'Knee Raises × 3',
      'Inverted Row × 12', 'Squats × 12', 'Bench Dips × 12', 'Knee Push-ups × 12',
    ]);
  });

  it('builds the approved Neos steps (+2 on the trial)', () => {
    expect(names(1, 1)).toEqual([
      '2 Assist Pull-ups + 2 Jump Muscle-ups × 1',
      '4 Inv Row + 6 Inc Push-ups × 1', 'Squats × 12', 'Knee Push-up Negatives × 12',
      '6 Inv Row + 8 Inc Push-ups × 1', 'Lunges × 17', 'Bench Dips × 14',
      '8 Inv Row + 10 Inc Push-ups × 1', 'Inverted Row × 12', 'Knee Raises × 7',
    ]);
    expect(names(1, 2)[0]).toBe('4 Assist Pull-ups + 4 Jump Muscle-ups × 1');
  });

  it('builds the approved Hoplite steps', () => {
    expect(names(3, 1)).toEqual([
      '1 Banded Muscle-up + 2 Pull-ups × 1',
      '4 Assist Pull + 4 Bar Dips + 4 Knee Raise × 1', 'Squats × 22',
      '6 Assist Pull + 6 Bar Dips + 6 Knee Raise × 1', 'Lunges × 27', 'Push-ups × 22',
      '8 Assist Pull + 8 Bar Dips + 8 Knee Raise × 1', 'Bar Dips × 10', 'Assist Pull-ups × 12', 'Jump Muscle-ups × 10',
    ]);
    expect(names(3, 2)[0]).toBe('3 Banded Muscle-ups + 4 Pull-ups × 1');
  });

  it('uses the base trial as is from Spartan up', () => {
    for (const base of [4, 5, 6, 7, 8]) {
      const trial = RITES_OF_PASSAGE.find(t => t.tier === base)!.movements.map(m => `${m.name} × ${m.reps}`);
      const openers = base === 8 ? 2 : 1;
      expect(names(base, 1).slice(openers)).toEqual(trial);
      expect(names(base, 2).slice(openers)).toEqual(trial);
    }
  });

  it('opens with the approved new movements from Spartan up', () => {
    expect(names(4, 1)[0]).toBe('1 Jump Muscle-up + 3 Bar Dips + 1 Pull-up × 1');
    expect(names(4, 2)[0]).toBe('2 Jump Muscle-ups + 5 Bar Dips + 2 Pull-ups × 1');
    expect([names(5, 1)[0], names(5, 2)[0]]).toEqual(['Muscle-up × 1', 'Muscle-ups × 3']);
    expect([names(6, 1)[0], names(6, 2)[0]]).toEqual(['Muscle-ups × 4', 'Muscle-ups × 6']);
    expect([names(7, 1)[0], names(7, 2)[0]]).toEqual(['Muscle-ups (+5 kg) × 2', 'Muscle-ups (+5 kg) × 4']);
    expect(names(8, 1).slice(0, 2)).toEqual(['Muscle-up (+10 kg) × 1', '(1 Pull-up + 1 MU) Unbroken × 1']);
    expect(names(8, 2).slice(0, 2)).toEqual(['Muscle-ups (+10 kg) × 2', '(1 Pull-up + 1 MU) Unbroken × 2']);
  });

  it('Step 2 has the same workout as Step 1 after the opening', () => {
    for (let base = 1; base <= 8; base++) {
      const openers = base === 8 ? 2 : 1;
      expect(names(base, 2).slice(openers)).toEqual(names(base, 1).slice(openers));
    }
  });

  it("uses the base trial's minimum time", () => {
    for (let base = 0; base <= 8; base++) {
      expect(getTrialStep(base + 1, 1)!.minSeconds).toBe(TIER_HARD_FLOORS[base]);
    }
  });

  it('never shares movement objects with the trials', () => {
    const step = getTrialStep(5, 1)!;
    step.movements[1].completed = true;
    expect(RITES_OF_PASSAGE.find(t => t.tier === 4)!.movements[0].completed).toBeUndefined();
  });

  it('offers the next item on the climb in order', () => {
    expect(nextClimbItem(4, [])).toEqual({ kind: 'step', tier: 4, step: 1 });
    expect(nextClimbItem(4, [1])).toEqual({ kind: 'step', tier: 4, step: 2 });
    expect(nextClimbItem(4, [1, 2])).toEqual({ kind: 'trial', tier: 4 });
    expect(nextClimbItem(4, [2])).toEqual({ kind: 'step', tier: 4, step: 1 });
    expect(nextClimbItem(1, [1])).toEqual({ kind: 'trial', tier: 1 });
    expect(nextClimbItem(0, [])).toEqual({ kind: 'trial', tier: 0 });
    expect(nextClimbItem(9, [1, 2])).toEqual({ kind: 'trial', tier: 9 });
    expect(nextClimbItem(10, [])).toBeNull();
  });
  it('lists the checkpoint switch options: steps in order, then the trial', () => {
    expect(climbOptions(4, [])).toEqual([
      { item: { kind: 'step', tier: 4, step: 1 }, cleared: false, locked: false },
      { item: { kind: 'step', tier: 4, step: 2 }, cleared: false, locked: true },
      { item: { kind: 'trial', tier: 4 }, cleared: false, locked: false },
    ]);
    expect(climbOptions(4, [1]).map(o => [o.cleared, o.locked])).toEqual([[true, false], [false, false], [false, false]]);
    // Not loaded yet: Step 2 waits.
    expect(climbOptions(4, null)[1].locked).toBe(true);
    expect(climbOptions(1, []).map(o => o.item.kind)).toEqual(['step', 'trial']);
    expect(climbOptions(0, [])).toEqual([{ item: { kind: 'trial', tier: 0 }, cleared: false, locked: false }]);
  });

  it('keeps a remembered pick only while it still fits the athlete', () => {
    expect(isClimbItemAvailable({ kind: 'trial', tier: 4 }, 4, [])).toBe(true);
    expect(isClimbItemAvailable({ kind: 'step', tier: 4, step: 1 }, 4, [1, 2])).toBe(true);
    expect(isClimbItemAvailable({ kind: 'step', tier: 4, step: 2 }, 4, [])).toBe(false);
    expect(isClimbItemAvailable({ kind: 'step', tier: 4, step: 2 }, 4, [1])).toBe(true);
    expect(isClimbItemAvailable({ kind: 'step', tier: 4, step: 2 }, 4, null)).toBe(true);
    // Ranked up since the pick, or a step the tier doesn't have.
    expect(isClimbItemAvailable({ kind: 'step', tier: 4, step: 1 }, 5, [])).toBe(false);
    expect(isClimbItemAvailable({ kind: 'step', tier: 1, step: 2 }, 1, [1])).toBe(false);
  });

  it('compares climb items', () => {
    expect(sameClimbItem({ kind: 'step', tier: 4, step: 1 }, { kind: 'step', tier: 4, step: 1 })).toBe(true);
    expect(sameClimbItem({ kind: 'step', tier: 4, step: 1 }, { kind: 'step', tier: 4, step: 2 })).toBe(false);
    expect(sameClimbItem({ kind: 'trial', tier: 4 }, { kind: 'step', tier: 4, step: 1 })).toBe(false);
    expect(sameClimbItem({ kind: 'trial', tier: 4 }, null)).toBe(false);
    expect(sameClimbItem({ kind: 'trial', tier: 9 }, { kind: 'trial', tier: 9, trialTier: 9 })).toBe(true);
    expect(sameClimbItem({ kind: 'trial', tier: 9 }, { kind: 'trial', tier: 9, trialTier: 7 })).toBe(false);
  });

  // Owner decision 2026-10-16 (Strength Trials audit M5).
  describe('Eternity checkpoint', () => {
    it('offers steps then the Eternity trial until it is finished', () => {
      expect(nextClimbItem(9, [])).toEqual({ kind: 'step', tier: 9, step: 1 });
      expect(nextClimbItem(9, [1, 2], false)).toEqual({ kind: 'trial', tier: 9 });
      expect(climbOptions(9, [1, 2], false).map(o => o.item.kind)).toEqual(['step', 'step', 'trial']);
    });

    it('after the Eternity trial, offers the Olympian, Demigod and Eternity trials', () => {
      expect(nextClimbItem(9, [], true)).toEqual({ kind: 'trial', tier: 9 });
      expect(climbOptions(9, [1, 2], true)).toEqual([
        { item: { kind: 'trial', tier: 9, trialTier: 7 }, cleared: false, locked: false },
        { item: { kind: 'trial', tier: 9, trialTier: 8 }, cleared: false, locked: false },
        { item: { kind: 'trial', tier: 9 }, cleared: false, locked: false },
      ]);
      expect(climbOptions(9, null, true).map(o => climbTrialTier(o.item as { tier: number; trialTier?: number }))).toEqual([7, 8, 9]);
    });

    it('keeps a remembered pick only when it fits', () => {
      expect(isClimbItemAvailable({ kind: 'trial', tier: 9, trialTier: 7 }, 9, [1, 2], true)).toBe(true);
      expect(isClimbItemAvailable({ kind: 'trial', tier: 9 }, 9, [1, 2], true)).toBe(true);
      expect(isClimbItemAvailable({ kind: 'step', tier: 9, step: 1 }, 9, [1, 2], true)).toBe(false);
      expect(isClimbItemAvailable({ kind: 'trial', tier: 9, trialTier: 6 }, 9, [1, 2], true)).toBe(false);
      // Before the Eternity trial (or while it loads), only the own trial.
      expect(isClimbItemAvailable({ kind: 'trial', tier: 9, trialTier: 7 }, 9, [1, 2], false)).toBe(false);
      // Other tiers never get the pick.
      expect(climbOptions(8, [1, 2], true).map(o => o.item.kind)).toEqual(['step', 'step', 'trial']);
      expect(isClimbItemAvailable({ kind: 'trial', tier: 8, trialTier: 7 }, 8, [], true)).toBe(false);
    });
  });
});
