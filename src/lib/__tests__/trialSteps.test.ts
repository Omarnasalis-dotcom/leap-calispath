import { getTrialStep, nextClimbItem, plusTwo, stepCount } from '../trialSteps';
import { RITES_OF_PASSAGE } from '../trials';
import { TIER_HARD_FLOORS } from '../../constants/Progression';

const names = (tier: number, step: 1 | 2) => getTrialStep(tier, step)!.movements.map(m => `${m.name} × ${m.reps}`);

describe('trialSteps', () => {
  it('has 1 step for Helot, 2 for Neos–Demigod, none for Eternity', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(stepCount)).toEqual([1, 2, 2, 2, 2, 2, 2, 2, 2, 0]);
    expect(getTrialStep(0, 2)).toBeUndefined();
    expect(getTrialStep(9, 1)).toBeUndefined();
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

  it('uses the trial as is from Spartan up', () => {
    for (const tier of [4, 5, 6, 7, 8]) {
      const trial = RITES_OF_PASSAGE.find(t => t.tier === tier)!.movements.map(m => `${m.name} × ${m.reps}`);
      const openers = tier === 8 ? 2 : 1;
      expect(names(tier, 1).slice(openers)).toEqual(trial);
      expect(names(tier, 2).slice(openers)).toEqual(trial);
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
    for (let tier = 1; tier <= 8; tier++) {
      const openers = tier === 8 ? 2 : 1;
      expect(names(tier, 2).slice(openers)).toEqual(names(tier, 1).slice(openers));
    }
  });

  it("uses the tier's trial minimum time", () => {
    for (let tier = 0; tier <= 8; tier++) {
      expect(getTrialStep(tier, 1)!.minSeconds).toBe(TIER_HARD_FLOORS[tier]);
    }
  });

  it('never shares movement objects with the trials', () => {
    const step = getTrialStep(4, 1)!;
    step.movements[1].completed = true;
    expect(RITES_OF_PASSAGE.find(t => t.tier === 4)!.movements[0].completed).toBeUndefined();
  });

  it('offers the next item on the climb in order', () => {
    expect(nextClimbItem(3, [])).toEqual({ kind: 'step', tier: 3, step: 1 });
    expect(nextClimbItem(3, [1])).toEqual({ kind: 'step', tier: 3, step: 2 });
    expect(nextClimbItem(3, [1, 2])).toEqual({ kind: 'trial', tier: 4 });
    expect(nextClimbItem(3, [2])).toEqual({ kind: 'step', tier: 3, step: 1 });
    expect(nextClimbItem(0, [1])).toEqual({ kind: 'trial', tier: 1 });
    expect(nextClimbItem(9, [])).toBeNull();
  });
});
