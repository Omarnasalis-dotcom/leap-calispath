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
  9: 600, // Eternity Protocol: 12-labor trial, minimum 10 minutes
};

export const TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  0: { desc: 'Helot: Master the basics — Rows, Squats, Bench Dips, Knee Push-ups', difficulty: 1 },
  1: { desc: 'Neos: Build the foundation — Assisted movements and volume', difficulty: 2 },
  2: { desc: 'Ephebe: Develop strength — Push-ups, Squats, Dips mastery', difficulty: 3 },
  3: { desc: 'Hoplite: Vertical mastery — Parallel Bar Dips, Pull-up preparation', difficulty: 4 },
  4: { desc: 'Spartan: The Rite of Passage — Strict Pull-ups and Banded Muscle-ups', difficulty: 5 },
  5: { desc: 'Lochagos: Elite Strength — Strict Muscle-ups and high volume', difficulty: 6 },
  6: { desc: 'Strategos: Advanced Mastery — Complex unbroken sequences', difficulty: 7 },
  7: { desc: 'Olympian: Peak Performance — The limit of the physical assessment', difficulty: 8 },
  8: { desc: 'Demigod: Beyond Assessment — Proven through the Rite of Passage', difficulty: 9 },
  9: { desc: 'Eternity: Ascension — The final 12-Labor Protocol', difficulty: 9 },
};

export const POWER_TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  1: { desc: 'Voltaic: Entry level — 0+ pts. Master the weighted movements.', difficulty: 3 },
  2: { desc: 'Ampere: Intermediate — 100+ pts. Consistent weighted performance.', difficulty: 6 },
  3: { desc: 'Tesla: Elite — 250+ pts. Peak weighted strength mastery.', difficulty: 9 },
};
