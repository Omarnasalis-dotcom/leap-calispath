export interface PowerMovement {
  id: string;
  name: string;
  multiplier: number;
}

export const POWER_MOVEMENTS: PowerMovement[] = [
  { id: 'pull_up', name: 'Weighted Pull-up', multiplier: 1 },
  { id: 'dip', name: 'Weighted Dip', multiplier: 1 },
  { id: 'squat', name: 'Weighted Squat', multiplier: 1 },
  { id: 'muscle_up', name: 'Weighted Muscle-up', multiplier: 2 },
];

export interface PowerLevel {
  id: 1 | 2 | 3;
  name: string;
  subtitle: string;
  minPoints: number;
}

export const POWER_LEVELS: Record<number, PowerLevel> = {
  1: { id: 1, name: 'VOLTAIC', subtitle: 'The Current', minPoints: 0 },
  2: { id: 2, name: 'AMPERE', subtitle: 'The Charge', minPoints: 100 },
  3: { id: 3, name: 'TESLA', subtitle: 'The Mastery', minPoints: 250 },
};

export function calculatePowerPoints(movementId: string, kg: number): number {
  const movement = POWER_MOVEMENTS.find(m => m.id === movementId);
  if (!movement) return 0;
  return kg * movement.multiplier;
}

export function calculateTotalPowerScore(pbs: Record<string, number>): number {
  return POWER_MOVEMENTS.reduce((total, m) => total + (pbs[m.id] || 0) * m.multiplier, 0);
}

export function getPowerLevel(totalPoints: number): PowerLevel {
  if (totalPoints >= POWER_LEVELS[3].minPoints) return POWER_LEVELS[3];
  if (totalPoints >= POWER_LEVELS[2].minPoints) return POWER_LEVELS[2];
  return POWER_LEVELS[1];
}

export function isPowerWorldUnlocked(strengthTier: number): boolean {
  return strengthTier >= 6; // Strategos threshold
}
