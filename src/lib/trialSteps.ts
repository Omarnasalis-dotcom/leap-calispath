// Strength Trial Steps (docs/features/STRENGTH_TRIAL_STEPS_PLAN.md).
// Small trials between tiers: each opens with the next tier's new movement,
// then this tier's trial (+2 reps on every movement for tiers 0–3, as is for
// tiers 4–8, so no step is harder than the next tier). Built from
// RITES_OF_PASSAGE so a step can never drift from its trial.

import { RITES_OF_PASSAGE, TrialMovement } from './trials';
import { TIER_HARD_FLOORS } from '../constants/Progression';

export type StepNumber = 1 | 2;
export type StepKind = 'firstTaste' | 'bridge';

export interface TrialStep {
  tier: number;
  step: StepNumber;
  kind: StepKind;
  movements: TrialMovement[];
  /** Same as the tier's trial minimum. */
  minSeconds: number;
}

/** Tiers whose step workout is the trial +2 reps; above this it's the trial as is. */
const PLUS_TWO_MAX_TIER = 3;

// The opening (new) movements per tier, owner-approved 2026-10-15.
// Helot has one step; Eternity (9) has none.
const OPENINGS: Record<number, TrialMovement[][]> = {
  0: [[{ name: 'Incline Push-ups', reps: 4 }, { name: 'Knee Raises', reps: 3 }]],
  1: [
    [{ name: '2 Assist Pull-ups + 2 Jump Muscle-ups', reps: 1 }],
    [{ name: '4 Assist Pull-ups + 4 Jump Muscle-ups', reps: 1 }],
  ],
  2: [
    [{ name: '2 Bar Dips + 2 Push-ups', reps: 1 }],
    [{ name: '4 Bar Dips + 4 Push-ups', reps: 1 }],
  ],
  3: [
    [{ name: '1 Banded Muscle-up + 2 Pull-ups', reps: 1 }],
    [{ name: '3 Banded Muscle-ups + 4 Pull-ups', reps: 1 }],
  ],
  4: [
    [{ name: '1 Jump Muscle-up + 3 Bar Dips + 1 Pull-up', reps: 1 }],
    [{ name: '2 Jump Muscle-ups + 5 Bar Dips + 2 Pull-ups', reps: 1 }],
  ],
  5: [[{ name: 'Muscle-up', reps: 1 }], [{ name: 'Muscle-ups', reps: 3 }]],
  6: [[{ name: 'Muscle-ups', reps: 4 }], [{ name: 'Muscle-ups', reps: 6 }]],
  7: [[{ name: 'Muscle-ups (+5 kg)', reps: 2 }], [{ name: 'Muscle-ups (+5 kg)', reps: 4 }]],
  8: [
    [{ name: 'Muscle-up (+10 kg)', reps: 1 }, { name: '(1 Pull-up + 1 MU) Unbroken', reps: 1 }],
    [{ name: 'Muscle-ups (+10 kg)', reps: 2 }, { name: '(1 Pull-up + 1 MU) Unbroken', reps: 2 }],
  ],
};

/**
 * +2 on a movement: a combined round ("2 Inv Row + 4 Inc Push-ups", reps 1)
 * gets +2 on each part's count; a single movement gets +2 reps.
 */
export function plusTwo(m: TrialMovement): TrialMovement {
  if (m.reps === 1 && /^\d+ /.test(m.name)) {
    return { name: m.name.replace(/(^|\+ )(\d+) /g, (_, lead: string, n: string) => `${lead}${Number(n) + 2} `), reps: 1 };
  }
  return { name: m.name, reps: m.reps + 2 };
}

/** How many steps a tier has: Helot 1, Neos–Demigod 2, Eternity 0. */
export function stepCount(tier: number): number {
  return OPENINGS[tier]?.length ?? 0;
}

export function getTrialStep(tier: number, step: StepNumber): TrialStep | undefined {
  const opening = OPENINGS[tier]?.[step - 1];
  const trial = RITES_OF_PASSAGE.find(t => t.tier === tier);
  if (!opening || !trial) return undefined;
  const body = tier <= PLUS_TWO_MAX_TIER ? trial.movements.map(plusTwo) : trial.movements.map(m => ({ name: m.name, reps: m.reps }));
  return {
    tier,
    step,
    kind: step === 1 ? 'firstTaste' : 'bridge',
    movements: [...opening.map(m => ({ ...m })), ...body],
    minSeconds: TIER_HARD_FLOORS[tier],
  };
}

export type ClimbItem =
  | { kind: 'step'; tier: number; step: StepNumber }
  | { kind: 'trial'; tier: number };

/**
 * The athlete's next item on the climb (what the Journey's Strength Trial
 * checkpoint offers): this tier's first uncleared step, in order, then the
 * next tier's trial. Null at the top tier.
 */
export function nextClimbItem(tier: number, clearedSteps: readonly number[]): ClimbItem | null {
  if (tier >= 9) return null;
  for (let s = 1; s <= stepCount(tier); s++) {
    if (!clearedSteps.includes(s)) return { kind: 'step', tier, step: s as StepNumber };
  }
  return { kind: 'trial', tier: tier + 1 };
}
