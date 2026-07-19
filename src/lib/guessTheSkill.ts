import { normalize } from './beatTheLadder';

export type MovementType = 'Static' | 'Dynamic';
// Anything that isn't cleanly one of Push/Pull (compound, balance, support…)
// is tagged Mixed rather than enumerating sub-patterns.
export type PatternTag = 'Push' | 'Pull' | 'Mixed';
export type EquipmentTag = 'Floor' | 'Pull-up Bar' | 'Rings' | 'Parallel Bars' | 'Pole';
export type SkillDifficulty = 'Beginner' | 'Intermediate' | 'Advanced' | 'Elite' | 'Legendary';

export interface GuessSkillExercise {
  id: string;
  name: string;
  aliases: string[];
  movementType: MovementType;
  primaryPattern: PatternTag;
  equipment: EquipmentTag[];
  difficulty: SkillDifficulty;
  // One short characteristic ("Body completely vertical"), not a sentence —
  // it's the final hint, meant to click instantly.
  signatureHint: string;
}

export const START_SCORE = 1000;
export const HINT_COST = 100;
export const HINT_COUNT = 5;

// A full game is a run of rounds with a shrinking hint budget — round 1
// allows all 5 hints, the last round allows only 2. Clearing every round is
// the win condition; failing any round ends the game.
export const ROUND_HINT_CAPS = [5, 4, 3, 2] as const;

export const HINT_LABELS = [
  'Movement Type',
  'Signature',
  'Primary Pattern',
  'Equipment',
  'Difficulty',
] as const;

// Alias rule (enforced by tests): no normalized name/alias may be shared by
// two entries, so a guess can never ambiguously match multiple skills.
export const GUESS_SKILL_CATALOG: GuessSkillExercise[] = [
  {
    id: 'l-sit',
    name: 'L-Sit',
    aliases: ['L Hold'],
    movementType: 'Static',
    primaryPattern: 'Mixed',
    equipment: ['Floor', 'Parallel Bars'],
    difficulty: 'Beginner',
    signatureHint: 'Hips flexed',
  },
  {
    id: 'handstand',
    name: 'Handstand',
    aliases: ['HS'],
    movementType: 'Static',
    primaryPattern: 'Mixed',
    equipment: ['Floor'],
    difficulty: 'Intermediate',
    signatureHint: 'Body completely vertical',
  },
  {
    id: 'back-lever',
    name: 'Back Lever',
    aliases: ['BL'],
    movementType: 'Static',
    primaryPattern: 'Mixed',
    equipment: ['Pull-up Bar', 'Rings'],
    difficulty: 'Intermediate',
    signatureHint: 'Horizontal, facing the ground',
  },
  {
    id: 'human-flag',
    name: 'Human Flag',
    aliases: ['Flag', 'Side Flag'],
    movementType: 'Static',
    primaryPattern: 'Mixed',
    equipment: ['Pole'],
    difficulty: 'Advanced',
    signatureHint: 'Sideways from a vertical pole',
  },
  {
    id: 'front-lever',
    name: 'Front Lever',
    aliases: ['FL'],
    movementType: 'Static',
    primaryPattern: 'Pull',
    equipment: ['Pull-up Bar', 'Rings'],
    difficulty: 'Advanced',
    signatureHint: 'Horizontal, facing upward',
  },
  {
    id: 'planche',
    name: 'Planche',
    aliases: ['Full Planche'],
    movementType: 'Static',
    primaryPattern: 'Push',
    equipment: ['Floor', 'Parallel Bars'],
    difficulty: 'Elite',
    signatureHint: 'Horizontal, feet never touch the floor',
  },
  {
    id: 'maltese',
    name: 'Maltese',
    aliases: ['Maltese Hold'],
    movementType: 'Static',
    primaryPattern: 'Push',
    equipment: ['Rings'],
    difficulty: 'Elite',
    signatureHint: 'Arms far outside the body',
  },
  {
    id: 'iron-cross',
    name: 'Iron Cross',
    aliases: ['Cross', 'Crucifix'],
    movementType: 'Static',
    primaryPattern: 'Push',
    equipment: ['Rings'],
    difficulty: 'Elite',
    signatureHint: 'Arms straight',
  },
  {
    id: 'victorian-cross',
    name: 'Victorian Cross',
    aliases: ['Victorian', 'Vic Cross'],
    movementType: 'Static',
    primaryPattern: 'Pull',
    equipment: ['Rings'],
    difficulty: 'Legendary',
    signatureHint: 'Body below ring height',
  },
  {
    id: 'reverse-planche',
    name: 'Reverse Planche',
    aliases: ['Rev Planche'],
    movementType: 'Static',
    primaryPattern: 'Pull',
    equipment: ['Rings'],
    difficulty: 'Legendary',
    signatureHint: 'Shoulders behind the hands',
  },
  {
    id: 'pullover',
    name: 'Pullover',
    aliases: ['Bar Pullover'],
    movementType: 'Dynamic',
    primaryPattern: 'Pull',
    equipment: ['Pull-up Bar'],
    difficulty: 'Beginner',
    signatureHint: 'Body rotates over the bar',
  },
  {
    id: 'pistol-squat',
    name: 'Pistol Squat',
    aliases: ['Pistol'],
    movementType: 'Dynamic',
    primaryPattern: 'Mixed',
    equipment: ['Floor'],
    difficulty: 'Intermediate',
    signatureHint: 'Squat on one leg',
  },
  {
    id: 'handstand-push-up',
    name: 'Handstand Push-up',
    aliases: ['HSPU'],
    movementType: 'Dynamic',
    primaryPattern: 'Push',
    equipment: ['Floor'],
    difficulty: 'Advanced',
    signatureHint: 'Pressing while fully inverted',
  },
  {
    id: 'high-pull-up',
    name: 'High Pull-up',
    aliases: ['C2B', 'Chest to Bar'],
    movementType: 'Dynamic',
    primaryPattern: 'Pull',
    equipment: ['Pull-up Bar'],
    difficulty: 'Advanced',
    signatureHint: 'Chest reaches the bar',
  },
  {
    id: 'muscle-up',
    name: 'Muscle-up',
    aliases: ['MU'],
    movementType: 'Dynamic',
    primaryPattern: 'Mixed',
    equipment: ['Pull-up Bar', 'Rings'],
    difficulty: 'Advanced',
    signatureHint: 'Hang to support in one move',
  },
  {
    id: 'front-lever-pull-up',
    name: 'Front Lever Pull-up',
    aliases: ['FL Pull-up'],
    movementType: 'Dynamic',
    primaryPattern: 'Pull',
    equipment: ['Pull-up Bar', 'Rings'],
    difficulty: 'Elite',
    signatureHint: 'Pull-ups while horizontal',
  },
  {
    id: 'planche-push-up',
    name: 'Planche Push-up',
    aliases: [],
    movementType: 'Dynamic',
    primaryPattern: 'Push',
    equipment: ['Floor'],
    difficulty: 'Elite',
    signatureHint: 'Push-ups with feet off the floor',
  },
  {
    id: 'press-to-handstand-90',
    name: '90° Press to Handstand',
    aliases: ['90 Press', 'Press to Handstand'],
    movementType: 'Dynamic',
    primaryPattern: 'Push',
    equipment: ['Parallel Bars'],
    difficulty: 'Elite',
    signatureHint: 'Press to vertical through 90° elbows',
  },
  {
    id: 'hefesto',
    name: 'Hefesto',
    aliases: [],
    movementType: 'Dynamic',
    primaryPattern: 'Pull',
    equipment: ['Rings'],
    difficulty: 'Legendary',
    signatureHint: 'Pulling from behind the back',
  },
  {
    id: 'zanetti',
    name: 'Zanetti',
    aliases: ['Zanetti Press'],
    movementType: 'Dynamic',
    primaryPattern: 'Push',
    equipment: ['Rings'],
    difficulty: 'Legendary',
    signatureHint: 'Pressing through a horizontal cross',
  },
];

export function pickRandomExercise(excludeIds?: string | string[]): GuessSkillExercise {
  const exclude = excludeIds ? new Set(Array.isArray(excludeIds) ? excludeIds : [excludeIds]) : null;
  const pool = exclude ? GUESS_SKILL_CATALOG.filter((e) => !exclude.has(e.id)) : GUESS_SKILL_CATALOG;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Hints follow one fixed order for every skill; the screen renders indexes
 *  0..revealed-1, so a duplicate reveal is impossible by construction. */
export function getHintText(exercise: GuessSkillExercise, hintIndex: number): string {
  switch (hintIndex) {
    case 0:
      return exercise.movementType;
    case 1:
      return exercise.signatureHint;
    case 2:
      return exercise.primaryPattern;
    case 3:
      return exercise.equipment.join(' / ');
    case 4:
      return exercise.difficulty;
    default:
      return '';
  }
}

/** The first hint is shown automatically, so winning scores run 900 → 500. */
export function computeScore(hintsRevealed: number): number {
  return Math.max(0, START_SCORE - HINT_COST * hintsRevealed);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return Math.abs(a.length - b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Typo budget scales with candidate length so short shorthand ("FL", "HS",
 *  "lsit") stays exact-only and can't be hit by accident. */
export function maxEditDistanceFor(candidateLength: number): number {
  if (candidateLength < 6) return 0;
  if (candidateLength <= 8) return 1;
  return 2;
}

export function isCorrectGuess(guess: string, exercise: GuessSkillExercise): boolean {
  const g = normalize(guess);
  if (!g) return false;
  return [exercise.name, ...exercise.aliases].some((candidate) => {
    const c = normalize(candidate);
    return c === g || levenshtein(g, c) <= maxEditDistanceFor(c.length);
  });
}

/**
 * Exact/prefix/substring only — deliberately no fuzzy here. Fuzzy tolerance
 * belongs to guess submission; a near-miss typo in the dropdown would
 * otherwise advertise the answer for free.
 */
export function searchGuessSuggestions(query: string, limit: number = 6): GuessSkillExercise[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const scored: { exercise: GuessSkillExercise; rank: number }[] = [];
  for (const exercise of GUESS_SKILL_CATALOG) {
    const candidates = [exercise.name, ...exercise.aliases].map(normalize);
    let bestRank = Infinity;
    for (const candidate of candidates) {
      if (candidate === q) {
        bestRank = 0;
        break;
      }
      if (candidate.startsWith(q)) {
        bestRank = Math.min(bestRank, 1);
        continue;
      }
      if (candidate.includes(q)) {
        bestRank = Math.min(bestRank, 2);
      }
    }
    if (bestRank !== Infinity) {
      scored.push({ exercise, rank: bestRank });
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.exercise.name.localeCompare(b.exercise.name));
  return scored.slice(0, limit).map((s) => s.exercise);
}
