// Strength Trial Steps (docs/features/STRENGTH_TRIAL_STEPS_PLAN.md).
// Small trials between two trials. A trial is the exam to LEAVE a tier: a
// Spartan (tier 4) faces the Spartan trial. Their steps bridge from the trial
// they already passed (Hoplite, the "base" trial) to that one: each opens with
// a new movement of the Spartan trial, then the Hoplite trial (+2 reps on
// every movement for base trials 0–3, as is for 4–8, so no step is harder
// than the trial ahead). Built from RITES_OF_PASSAGE so a step can never
// drift from its trial. Every function here takes the ATHLETE's tier (1–9).

import { RITES_OF_PASSAGE, TrialMovement } from './trials';
import { TIER_HARD_FLOORS } from '../constants/Progression';

export type StepNumber = 1 | 2;
export type StepKind = 'firstTaste' | 'bridge';

export interface TrialStep {
  /** The athlete's tier: the steps lead to this tier's trial. */
  tier: number;
  /** The trial the step is built from (tier − 1). */
  baseTier: number;
  step: StepNumber;
  kind: StepKind;
  movements: TrialMovement[];
  /** How many of `movements` are the opening (new) movements. */
  openers: number;
  /** Same as the base trial's minimum. */
  minSeconds: number;
}

/** Base trials whose step workout is the trial +2 reps; above this it's the trial as is. */
const PLUS_TWO_MAX_TIER = 3;

// The opening (new) movements per BASE trial, owner-approved 2026-10-15:
// the Helot-based step (for Neos athletes) is the only single one.
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

/** Steps before an athlete's trial: Helot 0, Neos 1, Ephebe–Eternity 2. */
export function stepCount(tier: number): number {
  return OPENINGS[tier - 1]?.length ?? 0;
}

/** Step `step` for an athlete of `tier`. */
export function getTrialStep(tier: number, step: StepNumber): TrialStep | undefined {
  const base = tier - 1;
  const opening = OPENINGS[base]?.[step - 1];
  const trial = RITES_OF_PASSAGE.find(t => t.tier === base);
  if (!opening || !trial) return undefined;
  const body = base <= PLUS_TWO_MAX_TIER ? trial.movements.map(plusTwo) : trial.movements.map(m => ({ name: m.name, reps: m.reps }));
  return {
    tier,
    baseTier: base,
    step,
    kind: step === 1 ? 'firstTaste' : 'bridge',
    movements: [...opening.map(m => ({ ...m })), ...body],
    openers: opening.length,
    minSeconds: TIER_HARD_FLOORS[base],
  };
}

export type ClimbItem =
  | { kind: 'step'; tier: number; step: StepNumber }
  | { kind: 'trial'; tier: number };

/**
 * The athlete's next item on the climb (what the Journey's Strength Trial
 * checkpoint offers): their first uncleared step, in order, then their
 * tier's trial. Null past the last trial.
 */
export function nextClimbItem(tier: number, clearedSteps: readonly number[]): ClimbItem | null {
  if (tier > 9) return null;
  for (let s = 1; s <= stepCount(tier); s++) {
    if (!clearedSteps.includes(s)) return { kind: 'step', tier, step: s as StepNumber };
  }
  return { kind: 'trial', tier };
}

export interface ClimbOption {
  item: ClimbItem;
  /** Step finished at least once (it can still be picked and replayed). */
  cleared: boolean;
  /** Step 2 before Step 1 is cleared. */
  locked: boolean;
}

/**
 * What the Journey trial checkpoint's switch sheet offers (owner decision
 * 2026-10-16): every step of the athlete's tier, in order, then the trial.
 * The trial and Step 1 are always open; a later step opens once the one
 * before it is cleared. `clearedSteps` null = not loaded yet: later steps
 * show locked until it is.
 */
export function climbOptions(tier: number, clearedSteps: readonly number[] | null): ClimbOption[] {
  const cleared = clearedSteps ?? [];
  const out: ClimbOption[] = [];
  for (let s = 1; s <= stepCount(tier); s++) {
    out.push({
      item: { kind: 'step', tier, step: s as StepNumber },
      cleared: cleared.includes(s),
      locked: s > 1 && !cleared.includes(s - 1),
    });
  }
  out.push({ item: { kind: 'trial', tier }, cleared: false, locked: false });
  return out;
}

/**
 * Whether a remembered pick still fits the athlete: same tier, a real step,
 * and not locked. With `clearedSteps` null (not loaded) the order check is
 * left to the server (it rejects Step 2 before Step 1).
 */
export function isClimbItemAvailable(item: ClimbItem, tier: number, clearedSteps: readonly number[] | null): boolean {
  if (item.tier !== tier) return false;
  if (item.kind === 'trial') return true;
  if (item.step < 1 || item.step > stepCount(tier)) return false;
  return clearedSteps == null || item.step === 1 || clearedSteps.includes(item.step - 1);
}

export function sameClimbItem(a: ClimbItem | null, b: ClimbItem | null): boolean {
  if (!a || !b) return false;
  return a.kind === b.kind && a.tier === b.tier && (a.kind === 'trial' || (b.kind === 'step' && a.step === b.step));
}
