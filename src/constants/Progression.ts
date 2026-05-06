import { TIER_NAMES, POWER_TIER_NAMES } from '../types';

export const TIER_HARD_FLOORS: Record<number, number> = {
  0: 25,
  1: 90,
  2: 150,
  3: 180,
  4: 200,
  5: 220,
  6: 250,
  7: 360,
  8: 480,
};

export const TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  0: { desc: 'Master the basics: Inverted Rows, Squats, Bench Dips, Knee Push-ups', difficulty: 1 },
  1: { desc: 'Build foundation: Assisted Pull-ups, Push-ups, Lunges, Dips', difficulty: 2 },
  2: { desc: 'Develop strength: Pull-ups, Push-ups, Squats, Dips with higher volume', difficulty: 3 },
  3: { desc: 'Intermediate level: Unassisted Pull-ups, Full Push-ups, Jump Squats', difficulty: 4 },
  4: { desc: 'Advanced strength: Weighted movements, higher rep ranges', difficulty: 5 },
  5: { desc: 'Elite tier: Complex movements, muscle-ups preparation', difficulty: 6 },
  6: { desc: 'Platinum-Heart: Full Muscle-ups, advanced calisthenics', difficulty: 7 },
  7: { desc: 'Diamond-tier: High volume muscle-ups, elite conditioning', difficulty: 8 },
  8: { desc: 'Titan/Demigod: Maximum strength, endurance mastery', difficulty: 9 },
};

export const POWER_TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  0: { desc: 'Minimum to compete: 0 pts — Entry level power tier.', difficulty: 1 },
  1: { desc: 'Minimum to compete: 17.5 pts', difficulty: 2 },
  2: { desc: 'Minimum to compete: 27.5 pts', difficulty: 3 },
  3: { desc: 'Minimum to compete: 45 pts', difficulty: 4 },
  4: { desc: 'Minimum to compete: 70 pts', difficulty: 5 },
  5: { desc: 'Minimum to compete: 100 pts', difficulty: 6 },
  6: { desc: 'Minimum to compete: 140 pts', difficulty: 7 },
  7: { desc: 'Minimum to compete: 190 pts', difficulty: 8 },
  8: { desc: 'Minimum to compete: 290 pts', difficulty: 9 },
};
