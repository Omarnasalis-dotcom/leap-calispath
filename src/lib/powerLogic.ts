/**
 * Power World Logic - Weighted Hierarchy
 * Points = (Pull-up kg) + (Dip kg) + (Squat kg) + (Muscle-up kg * 2)
 */

export interface PowerMovementPBs {
  pull_up: number;
  dip: number;
  squat: number;
  muscle_up: number;
}

export interface PowerTierRequirement {
  tier: number;
  rank: string;
  minPoints: number;
  movementTargets: PowerMovementPBs;
}

export const POWER_TIER_NAMES = [
  'Iron-Bound',
  'Steel-Wrought',
  'Bronze-Clad',
  'Silver-Will',
  'Gold-Soul',
  'Platinum-Heart',
  'Obsidian-Core',
  'Eternity'
];

export const POWER_TIER_REQUIREMENTS: PowerTierRequirement[] = [
  {
    tier: 1,
    rank: POWER_TIER_NAMES[0],
    minPoints: 17.5,
    movementTargets: { pull_up: 2.5, dip: 5, squat: 10, muscle_up: 0 }
  },
  {
    tier: 2,
    rank: POWER_TIER_NAMES[1],
    minPoints: 27.5,
    movementTargets: { pull_up: 5, dip: 7.5, squat: 15, muscle_up: 0 }
  },
  {
    tier: 3,
    rank: POWER_TIER_NAMES[2],
    minPoints: 45,
    movementTargets: { pull_up: 10, dip: 15, squat: 20, muscle_up: 0 }
  },
  {
    tier: 4,
    rank: POWER_TIER_NAMES[3],
    minPoints: 70,
    movementTargets: { pull_up: 15, dip: 20, squat: 30, muscle_up: 2.5 }
  },
  {
    tier: 5,
    rank: POWER_TIER_NAMES[4],
    minPoints: 100,
    movementTargets: { pull_up: 20, dip: 25, squat: 40, muscle_up: 5 }
  },
  {
    tier: 6,
    rank: POWER_TIER_NAMES[5],
    minPoints: 140,
    movementTargets: { pull_up: 25, dip: 30, squat: 50, muscle_up: 7.5 }
  },
  {
    tier: 7,
    rank: POWER_TIER_NAMES[6],
    minPoints: 190,
    movementTargets: { pull_up: 30, dip: 35, squat: 60, muscle_up: 10 }
  },
  {
    tier: 8,
    rank: POWER_TIER_NAMES[7],
    minPoints: 290,
    movementTargets: { pull_up: 40, dip: 45, squat: 80, muscle_up: 15 }
  }
];

export function calculatePowerScore(pbs: PowerMovementPBs): number {
  return (pbs.pull_up || 0) + (pbs.dip || 0) + (pbs.squat || 0) + ((pbs.muscle_up || 0) * 2);
}

export function calculatePowerTier(points: number): number {
  let tier = 0;
  for (const req of POWER_TIER_REQUIREMENTS) {
    if (points >= req.minPoints) {
      tier = req.tier;
    } else {
      break;
    }
  }
  return tier;
}

export function isPowerWorldUnlocked(strengthTier: number): boolean {
  return strengthTier >= 6; // Strategos threshold
}
