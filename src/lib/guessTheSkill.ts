import { normalize } from './beatTheLadder';

export type MovementType = 'Static' | 'Dynamic' | 'Static / Dynamic';

export interface GuessSkillExercise {
  id: string;
  name: string;
  aliases: string[];
  movementType: MovementType;
  spatialOrientation: string;
  movementPattern: string;
  equipment: string;
  primaryMuscles: string;
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
  'Spatial Orientation',
  'Movement Pattern',
  'Equipment',
  'Primary Muscles',
] as const;

// Alias rule (enforced by tests): no normalized name/alias may be shared by
// two entries, so a guess can never ambiguously match multiple skills.
export const GUESS_SKILL_CATALOG: GuessSkillExercise[] = [
  {
    id: 'l-sit',
    name: 'L-Sit',
    aliases: ['L Hold'],
    movementType: 'Static',
    spatialOrientation: 'Upright vertical',
    movementPattern: 'Compression hold',
    equipment: 'Floor / Parallettes',
    primaryMuscles: 'Core & Hip Flexors',
  },
  {
    id: 'handstand',
    name: 'Handstand',
    aliases: ['HS'],
    movementType: 'Static',
    spatialOrientation: 'Inverted vertical',
    movementPattern: 'Straight-arm balance',
    equipment: 'Floor / Parallettes',
    primaryMuscles: 'Shoulders & Core',
  },
  {
    id: 'back-lever',
    name: 'Back Lever',
    aliases: ['BL'],
    movementType: 'Static',
    spatialOrientation: 'Horizontal prone (facing ground)',
    movementPattern: 'Straight-arm pull hold',
    equipment: 'High Bar / Rings',
    primaryMuscles: 'Lower Back, Core, & Biceps',
  },
  {
    id: 'human-flag',
    name: 'Human Flag',
    aliases: ['Flag', 'Side Flag'],
    movementType: 'Static',
    spatialOrientation: 'Lateral horizontal',
    movementPattern: 'Push-pull leverage hold',
    equipment: 'Vertical Pole / Stall Bars',
    primaryMuscles: 'Obliques, Lats, & Shoulders',
  },
  {
    id: 'front-lever',
    name: 'Front Lever',
    aliases: ['FL'],
    movementType: 'Static',
    spatialOrientation: 'Horizontal supine (facing sky)',
    movementPattern: 'Straight-arm pull hold',
    equipment: 'High Bar / Rings',
    primaryMuscles: 'Lats & Core',
  },
  {
    id: 'muscle-up',
    name: 'Muscle-Up',
    aliases: ['MU'],
    movementType: 'Dynamic',
    spatialOrientation: 'Vertical transition',
    movementPattern: 'Pull to push transition',
    equipment: 'High Bar / Rings',
    primaryMuscles: 'Lats, Chest, & Triceps',
  },
  {
    id: 'planche-push-up',
    name: 'Planche Push-Up',
    aliases: [],
    movementType: 'Dynamic',
    spatialOrientation: 'Horizontal prone',
    movementPattern: 'Straight-body press',
    equipment: 'Floor / Parallettes',
    primaryMuscles: 'Anterior Deltoids & Chest',
  },
  {
    id: 'handstand-push-up',
    name: 'Handstand Push-Up',
    aliases: ['HSPU'],
    movementType: 'Dynamic',
    spatialOrientation: 'Inverted vertical',
    movementPattern: 'Vertical press',
    equipment: 'Floor / Wall / Parallettes',
    primaryMuscles: 'Shoulders & Triceps',
  },
  {
    id: 'dragon-flag',
    name: 'Dragon Flag',
    aliases: [],
    movementType: 'Static / Dynamic',
    spatialOrientation: 'Angled supine',
    movementPattern: 'Core leverage extension',
    equipment: 'Flat Bench / Floor',
    primaryMuscles: 'Core & Lats',
  },
  {
    id: 'hefesto',
    name: 'Hefesto',
    aliases: [],
    movementType: 'Dynamic',
    spatialOrientation: 'Inverted / Back-facing vertical',
    movementPattern: 'Backward curl to support transition',
    equipment: 'Low Bar / High Bar',
    primaryMuscles: 'Biceps, Rear Deltoids, & Forearms',
  },
  {
    id: 'iron-cross',
    name: 'Iron Cross',
    aliases: ['Cross', 'Crucifix'],
    movementType: 'Static',
    spatialOrientation: 'Upright vertical',
    movementPattern: 'Straight-arm lateral adduction',
    equipment: 'Gymnastic Rings',
    primaryMuscles: 'Chest & Lats',
  },
  {
    id: 'victorian-cross',
    name: 'Victorian Cross',
    aliases: ['Victorian', 'Vic Cross'],
    movementType: 'Static',
    spatialOrientation: 'Horizontal',
    movementPattern: 'Straight-arm extension hold',
    equipment: 'Gymnastic Rings / Parallettes',
    primaryMuscles: 'Lats & Rear Deltoids',
  },
  {
    id: 'maltese',
    name: 'Maltese',
    aliases: ['Maltese Hold'],
    movementType: 'Static',
    spatialOrientation: 'Horizontal prone',
    movementPattern: 'Wide arms',
    equipment: 'Gymnastic Rings / Floor',
    primaryMuscles: 'Shoulders & Biceps',
  },
  {
    id: 'planche',
    name: 'Planche',
    aliases: ['Full Planche'],
    movementType: 'Static',
    spatialOrientation: 'Horizontal forward lean',
    movementPattern: 'Push',
    equipment: 'Floor / Parallettes',
    primaryMuscles: 'Anterior Deltoids & Lower Back',
  },
  {
    id: 'front-lever-pull-up',
    name: 'Front Lever Pull-Up',
    aliases: ['FL Pull-up'],
    movementType: 'Dynamic',
    spatialOrientation: 'Horizontal, face upward',
    movementPattern: 'Pull',
    equipment: 'Bar',
    primaryMuscles: 'Lats & Core',
  },
  {
    id: 'sat',
    name: 'Straight Arm Touch',
    aliases: ['SAT'],
    movementType: 'Static',
    spatialOrientation: 'Horizontal, wide grip',
    movementPattern: 'Pull',
    equipment: 'Bar',
    primaryMuscles: 'Lats, Core, & Rear Deltoids',
  },
  {
    id: 'planche-press',
    name: 'Planche Press',
    aliases: [],
    movementType: 'Dynamic',
    spatialOrientation: 'Straight-arm press',
    movementPattern: 'Push',
    equipment: 'Floor / Parallettes',
    primaryMuscles: 'Anterior Deltoids & Core',
  },
  {
    id: 'front-lever-press',
    name: 'Front Lever Press',
    aliases: ['FL Press'],
    movementType: 'Dynamic',
    spatialOrientation: 'Straight-arm pull-up press',
    movementPattern: 'Pull',
    equipment: 'High Bar / Rings',
    primaryMuscles: 'Lats, Rear Deltoids, & Core',
  },
  {
    id: 'reverse-planche',
    name: 'Reverse Planche',
    aliases: ['Rev Planche'],
    movementType: 'Static',
    spatialOrientation: 'Horizontal inverted / face upward',
    movementPattern: 'Pull',
    equipment: 'Floor / Parallel Bars',
    primaryMuscles: 'Rear Deltoids & Lower Back',
  },
  {
    id: 'van-gelder',
    name: 'Van Gelder',
    aliases: ['Van Gelder Pull-up'],
    movementType: 'Dynamic',
    spatialOrientation: 'Horizontal transition, top to bottom back to ring height',
    movementPattern: 'Push dominant',
    equipment: 'Gymnastic Rings',
    primaryMuscles: 'Shoulders, Lats, & Core',
  },
  {
    id: 'zanetti',
    name: 'Zanetti',
    aliases: ['Zanetti Press'],
    movementType: 'Dynamic',
    spatialOrientation: 'Bottom-to-top leverage transition',
    movementPattern: 'Push dominant',
    equipment: 'Gymnastic Rings',
    primaryMuscles: 'Biceps, Deltoids, & Core',
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
      return exercise.spatialOrientation;
    case 2:
      return exercise.movementPattern;
    case 3:
      return exercise.equipment;
    case 4:
      return exercise.primaryMuscles;
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
