export interface OneMMMovement {
  id: string;
  name: string;
  categoryId: 'entry' | 'main' | 'advanced';
  patternId: string; // To group movements for Peak Performance logic
  multiplier: number;
  minTier: number;
}

export const ONEMM_CATEGORIES = {
  entry: { id: 'entry', name: 'ENTRY', multiplier: 1, tiers: [0, 4] },
  main: { id: 'main', name: 'MAIN', multiplier: 2, tiers: [5, 8] },
  advanced: { id: 'advanced', name: 'ADVANCED', multiplier: 3, tiers: [5, 8] },
};

export const ONEMM_MOVEMENTS: OneMMMovement[] = [
  // ENTRY (Tiers 0-4)
  { id: 'knee_push_ups', name: 'Knee Push-ups', categoryId: 'entry', patternId: 'push', multiplier: 1, minTier: 0 },
  { id: 'inverted_row', name: 'Inverted Row', categoryId: 'entry', patternId: 'pull', multiplier: 1, minTier: 0 },
  { id: 'bench_dips', name: 'Bench Dips', categoryId: 'entry', patternId: 'dip', multiplier: 1, minTier: 0 },
  { id: 'air_squats', name: 'Air Squats', categoryId: 'entry', patternId: 'squat', multiplier: 1, minTier: 0 },
  { id: 'incline_push_ups', name: 'Incline Push-ups', categoryId: 'entry', patternId: 'push', multiplier: 1, minTier: 0 },
  { id: 'assisted_pull_ups', name: 'Assisted Pull-ups', categoryId: 'entry', patternId: 'pull', multiplier: 1, minTier: 0 },

  // MAIN (Tiers 5-8)
  { id: 'push_ups', name: 'Push-ups', categoryId: 'main', patternId: 'push', multiplier: 2, minTier: 5 },
  { id: 'pull_ups', name: 'Pull-ups', categoryId: 'main', patternId: 'pull', multiplier: 2, minTier: 5 },
  { id: 'dips', name: 'Dips', categoryId: 'main', patternId: 'dip', multiplier: 2, minTier: 5 },
  { id: 'goblet_squats', name: 'Goblet Squats (+20kg)', categoryId: 'main', patternId: 'squat', multiplier: 2, minTier: 5 },
  { id: 'deadlift', name: 'Deadlift (+30kg)', categoryId: 'main', patternId: 'deadlift', multiplier: 2, minTier: 5 },

  // ADVANCED (Tiers 5-8)
  { id: 'muscle_ups', name: 'Muscle-ups', categoryId: 'advanced', patternId: 'muscle_up', multiplier: 3, minTier: 5 },
  { id: 'hspu', name: 'Handstand Push-ups', categoryId: 'advanced', patternId: 'hspu', multiplier: 3, minTier: 5 },
  { id: 'fl_press', name: 'Front Lever Press', categoryId: 'advanced', patternId: 'fl_press', multiplier: 3, minTier: 5 },
  { id: 'fl_pull_ups', name: 'Front Lever Pull-ups', categoryId: 'advanced', patternId: 'fl_pull', multiplier: 3, minTier: 5 },
  { id: 'planche_push_ups', name: 'Planche Push-ups', categoryId: 'advanced', patternId: 'planche', multiplier: 3, minTier: 5 },
];

export const calculateOneMMPoints = (reps: number, categoryId: string) => {
  const multiplier = ONEMM_CATEGORIES[categoryId as keyof typeof ONEMM_CATEGORIES]?.multiplier || 1;
  return reps * multiplier;
};
