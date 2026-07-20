export interface LadderExercise {
  id: string;
  name: string;
  aliases: string[];
  difficulty: number;
}

// Order matters: it's the intended difficulty curve. Scores are spaced out
// (not sequential) so new exercises can be inserted later without renumbering
// the rest of the list.
export const LADDER_EXERCISES: LadderExercise[] = [
  { id: 'high-plank', name: 'High Plank', aliases: [], difficulty: 30 },
  { id: 'high-plank-shoulder-taps', name: 'High Plank Shoulder Taps', aliases: ['Shoulder Taps'], difficulty: 45 },
  { id: 'knee-push-up', name: 'Knee Push-up', aliases: [], difficulty: 60 },
  { id: 'inverted-row', name: 'Inverted Row', aliases: ['Aussie Row', 'Australian Row'], difficulty: 80 },
  { id: 'triceps-dips-box', name: 'Triceps Dips (Box)', aliases: ['Bench Dips', 'Box Dips'], difficulty: 100 },
  { id: 'push-up', name: 'Push-up', aliases: ['PU'], difficulty: 120 },
  { id: 'tuck-back-lever', name: 'Tuck Back Lever', aliases: ['TBL'], difficulty: 150 },
  { id: 'clap-push-up', name: 'Clap Push-up', aliases: [], difficulty: 180 },
  { id: 'pike-push-up', name: 'Pike Push-up', aliases: [], difficulty: 200 },
  { id: 'l-sit', name: 'L-Sit', aliases: [], difficulty: 220 },
  { id: 'triceps-extension', name: 'Triceps Extension', aliases: ['Tricep Extension'], difficulty: 230 },
  { id: 'archer-push-up', name: 'Archer Push-up', aliases: [], difficulty: 240 },
  { id: 'dips', name: 'Dips', aliases: [], difficulty: 265 },
  { id: 'pull-up', name: 'Pull-up', aliases: ['PU'], difficulty: 300 },
  { id: 'skin-the-cat', name: 'Skin the Cat', aliases: [], difficulty: 320 },
  { id: 'ring-dips', name: 'Ring Dips', aliases: [], difficulty: 340 },
  { id: 'archer-pull-up', name: 'Archer Pull-up', aliases: [], difficulty: 360 },
  { id: 'pullover', name: 'Pullover', aliases: [], difficulty: 380 },
  { id: 'high-pull-up', name: 'High Pull-up', aliases: ['C2B', 'Chest to Bar'], difficulty: 420 },
  { id: 'tuck-front-lever', name: 'Tuck Front Lever', aliases: ['TFL'], difficulty: 460 },
  { id: 'pistol-squat', name: 'Pistol Squat', aliases: ['Pistol'], difficulty: 500 },
  { id: 'muscle-up', name: 'Muscle-up', aliases: ['MU'], difficulty: 540 },
  { id: 'straddle-back-lever', name: 'Straddle Back Lever', aliases: [], difficulty: 560 },
  { id: 'handstand', name: 'Handstand', aliases: ['HS'], difficulty: 580 },
  { id: 'dragon-flag', name: 'Dragon Flag', aliases: [], difficulty: 640 },
  { id: 'full-back-lever', name: 'Full Back Lever', aliases: ['BL', 'Back Lever'], difficulty: 700 },
  { id: 'handstand-push-up', name: 'Freestanding Handstand Push-up', aliases: ['HSPU'], difficulty: 710 },
  { id: 'human-flag', name: 'Human Flag', aliases: ['Side Lever'], difficulty: 720 },
  { id: 'straddle-front-lever', name: 'Straddle Front Lever', aliases: [], difficulty: 740 },
  { id: 'full-front-lever', name: 'Full Front Lever', aliases: ['FL', 'Front Lever'], difficulty: 780 },
  { id: 'full-front-lever-touch-hold', name: 'Full Front Lever Touch Hold', aliases: ['Full FL Touch'], difficulty: 820 },
  { id: 'press-to-handstand-90', name: '90° Press to Handstand', aliases: ['Press HS', 'Press Handstand'], difficulty: 870 },
  { id: 'front-lever-press', name: 'Front Lever Press', aliases: ['FL Press'], difficulty: 890 },
  { id: 'straddle-planche', name: 'Straddle Planche', aliases: [], difficulty: 980 },
  { id: 'front-lever-pull-up', name: 'Front Lever Pull-up', aliases: ['FL Pull-up'], difficulty: 990 },
  { id: 'full-planche', name: 'Full Planche', aliases: ['Planche'], difficulty: 1040 },
  { id: 'iron-cross', name: 'Iron Cross', aliases: [], difficulty: 1125 },
  { id: 'planche-push-up', name: 'Planche Push-up', aliases: [], difficulty: 1150 },
  { id: 'one-arm-handstand', name: 'One Arm Handstand', aliases: ['OAHS'], difficulty: 1230 },
  { id: 'planche-press-to-handstand', name: 'Planche Press to Handstand', aliases: [], difficulty: 1310 },
  { id: 'sat-front-lever-touch', name: 'Straight Arm Front Lever Touch Hold', aliases: ['SAT'], difficulty: 1400 },
  { id: 'manna', name: 'Manna', aliases: [], difficulty: 1450 },
  { id: 'maltese-hold', name: 'Maltese Hold', aliases: ['Maltese'], difficulty: 1500 },
  { id: 'pelican-planche', name: 'Pelican Planche', aliases: [], difficulty: 1700 },
  { id: 'van-gelder', name: 'Van Gelder', aliases: ['Van Gelder Pull-up'], difficulty: 1750 },
  { id: 'nakayama', name: 'Nakayama', aliases: [], difficulty: 1820 },
  { id: 'one-arm-planche', name: 'One Arm Planche', aliases: ['OAP'], difficulty: 1850 },
  { id: 'zanetti', name: 'Zanetti', aliases: ['Zanetti Press'], difficulty: 1890 },
  { id: 'victorian-cross', name: 'Victorian Cross', aliases: ['Vic Cross'], difficulty: 2050 },
  { id: 'reverse-planche', name: 'Reverse Planche', aliases: ['Rev Planche'], difficulty: 2250 },
];

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\-()°.]/g, '');
}

export function getStarterExercise(): LadderExercise {
  return LADDER_EXERCISES[0];
}

function toUsedSet(usedIds: ReadonlySet<string> | string[]): ReadonlySet<string> {
  return usedIds instanceof Set ? usedIds : new Set(usedIds);
}

/**
 * Text/alias matching only — never filters by difficulty. Whether a
 * suggestion is actually a legal move is decided at selection time by
 * validateMove(), not hidden from the list here. Showing only "safe" options
 * would remove the actual skill test (knowing what's harder) from the game.
 */
export function searchLadderExercises(
  query: string,
  usedIds: ReadonlySet<string> | string[],
  limit: number = 8
): LadderExercise[] {
  const q = normalize(query);
  if (!q) return [];

  const used = toUsedSet(usedIds);
  const scored: { exercise: LadderExercise; rank: number }[] = [];

  for (const exercise of LADDER_EXERCISES) {
    if (used.has(exercise.id)) continue;

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

  scored.sort((a, b) => a.rank - b.rank || a.exercise.difficulty - b.exercise.difficulty);
  return scored.slice(0, limit).map((s) => s.exercise);
}

export type MoveRejectionReason = 'already_used' | 'too_easy';

export interface MoveValidationResult {
  valid: boolean;
  reason?: MoveRejectionReason;
}

export function validateMove(
  candidate: LadderExercise,
  usedIds: ReadonlySet<string> | string[],
  currentDifficulty: number
): MoveValidationResult {
  const used = toUsedSet(usedIds);
  if (used.has(candidate.id)) {
    return { valid: false, reason: 'already_used' };
  }
  if (candidate.difficulty <= currentDifficulty) {
    return { valid: false, reason: 'too_easy' };
  }
  return { valid: true };
}

const DIFFICULTY_BANDS: { max: number; label: string }[] = [
  { max: 299, label: 'Foundation' },
  { max: 599, label: 'Intermediate' },
  { max: 999, label: 'Advanced' },
  { max: 1599, label: 'Elite' },
  { max: Infinity, label: 'Legendary' },
];

/** Shows relative progress without ever surfacing the raw hidden score. */
export function getDifficultyBand(difficulty: number): string {
  return DIFFICULTY_BANDS.find((band) => difficulty <= band.max)!.label;
}

export type BonusTaskTier = 'easy' | 'medium' | 'hard';

export interface BonusTask {
  exerciseId: string;
  /** Short label for the wheel's wedge — each wedge is only 30° wide, so
   *  this is deliberately abbreviated. The full task description lives in
   *  `label`, shown separately (and with much more room) once the wheel
   *  lands. */
  exerciseName: string;
  label: string;
  tier: BonusTaskTier;
}

// Kept separate from LADDER_EXERCISES rather than an optional field on every
// entry: only this achievable subset (Foundation through low-Intermediate
// ladder difficulty) makes sense as a "go do this now" bonus task — nobody
// should spin and land on Victorian Cross, even on the "hard" filter.
export const WHEEL_BONUS_TASKS: BonusTask[] = [
  // easy
  { exerciseId: 'knee-push-up', exerciseName: 'Knee Push', label: '10 knee push-ups', tier: 'easy' },
  { exerciseId: 'inverted-row', exerciseName: 'Inv. Row', label: '8 inverted rows', tier: 'easy' },
  { exerciseId: 'triceps-dips-box', exerciseName: 'Bench Dips', label: '10 bench dips', tier: 'easy' },
  { exerciseId: 'push-up', exerciseName: 'Push-up', label: '10 push-ups', tier: 'easy' },
  { exerciseId: 'tuck-back-lever', exerciseName: 'Tuck BL', label: '8 sec hold', tier: 'easy' },
  // medium
  { exerciseId: 'triceps-extension', exerciseName: 'Tricep Ext', label: '10 tricep extensions', tier: 'medium' },
  { exerciseId: 'dips', exerciseName: 'Dips', label: '8 dips', tier: 'medium' },
  { exerciseId: 'archer-push-up', exerciseName: 'Archer Push', label: '5 archer push-ups (each side)', tier: 'medium' },
  { exerciseId: 'clap-push-up', exerciseName: 'Clap Push', label: '8 clap push-ups', tier: 'medium' },
  { exerciseId: 'pull-up', exerciseName: 'Pull-up', label: '5 pull-ups', tier: 'medium' },
  { exerciseId: 'ring-dips', exerciseName: 'Ring Dips', label: '6 ring dips', tier: 'medium' },
  // hard
  { exerciseId: 'high-pull-up', exerciseName: 'C2B Pull-up', label: '5 chest-to-bar pull-ups', tier: 'hard' },
  { exerciseId: 'tuck-front-lever', exerciseName: 'Tuck FL', label: '8 sec hold', tier: 'hard' },
  { exerciseId: 'pistol-squat', exerciseName: 'Pistol', label: '5 pistol squats (each leg)', tier: 'hard' },
  { exerciseId: 'muscle-up', exerciseName: 'Muscle-up', label: '3 muscle-ups', tier: 'hard' },
  { exerciseId: 'handstand', exerciseName: 'Handstand', label: '15 sec freestanding handstand', tier: 'hard' },
  { exerciseId: 'handstand-push-up', exerciseName: 'HSPU', label: '3 handstand push-ups', tier: 'hard' },
];

export function getBonusTasksByTier(tier: BonusTaskTier | 'random'): BonusTask[] {
  return tier === 'random' ? WHEEL_BONUS_TASKS : WHEEL_BONUS_TASKS.filter((t) => t.tier === tier);
}

export function pickRandomBonusTask(pool: BonusTask[], excludeExerciseId?: string): BonusTask {
  const filtered = excludeExerciseId ? pool.filter((t) => t.exerciseId !== excludeExerciseId) : pool;
  return filtered[Math.floor(Math.random() * filtered.length)];
}
