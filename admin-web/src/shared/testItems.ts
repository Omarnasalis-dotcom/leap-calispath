// Coach Test Week items (supabase/migrations/20261114190000_coach_test_week.sql).
// A block is a test item when its concept metadata has test_kind; the
// server (submit_program_test_item) is the authority on movements and
// limits. Mirrors src/lib/testItems.ts in the app — keep the ids in sync.

export type TestKind = 'max_reps' | 'one_rm' | 'max_hold' | 'form_check';

export const TEST_KINDS: { value: TestKind; label: string; hint: string }[] = [
  { value: 'max_reps', label: 'Max reps (1 min)', hint: 'Reps in 60 seconds. Saves to One Min Max when unlocked.' },
  { value: 'one_rm', label: '1RM', hint: 'Heaviest single. Saves to Power World when unlocked (Strategos+).' },
  { value: 'max_hold', label: 'Max hold', hint: 'The athlete picks the progression. Saves to Static World.' },
  { value: 'form_check', label: 'Form check', hint: 'The athlete watches the demo and sends you a video on WhatsApp.' },
];

// One Min Max movements (onemm_movements).
export const MAX_REPS_MOVEMENTS: { value: string; label: string }[] = [
  { value: 'pull_ups', label: 'Pull-ups' },
  { value: 'dips', label: 'Dips' },
  { value: 'push_ups', label: 'Push-ups' },
  { value: 'muscle_ups', label: 'Muscle-ups' },
  { value: 'hspu', label: 'Handstand Push-ups' },
  { value: 'goblet_squats', label: 'Goblet Squats (+20kg)' },
  { value: 'deadlift', label: 'Deadlift (+30kg)' },
  { value: 'fl_pull_ups', label: 'Front Lever Pull-ups' },
  { value: 'fl_press', label: 'Front Lever Press' },
  { value: 'planche_push_ups', label: 'Planche Push-ups' },
  { value: 'inverted_row', label: 'Inverted Row' },
  { value: 'assisted_pull_ups', label: 'Assisted Pull-ups' },
  { value: 'bench_dips', label: 'Bench Dips' },
  { value: 'knee_push_ups', label: 'Knee Push-ups' },
  { value: 'incline_push_ups', label: 'Incline Push-ups' },
  { value: 'air_squats', label: 'Air Squats' },
];

// Power World lifts + deadlift (test record only).
export const ONE_RM_MOVEMENTS: { value: string; label: string }[] = [
  { value: 'pull_up', label: 'Weighted pull-up (added kg)' },
  { value: 'dip', label: 'Weighted dip (added kg)' },
  { value: 'muscle_up', label: 'Weighted muscle-up (added kg)' },
  { value: 'squat', label: 'Back squat (bar kg)' },
  { value: 'deadlift', label: 'Deadlift (bar kg) · test record only' },
];

// Static World categories: the athlete picks tuck / straddle / full.
export const HOLD_CATEGORIES: { value: string; label: string }[] = [
  { value: 'front_lever', label: 'Front lever' },
  { value: 'back_lever', label: 'Back lever' },
  { value: 'planche', label: 'Planche' },
  { value: 'handstand', label: 'Handstand' },
];

export function testMovementOptions(kind: TestKind | undefined): { value: string; label: string }[] {
  if (kind === 'max_reps') return MAX_REPS_MOVEMENTS;
  if (kind === 'one_rm') return ONE_RM_MOVEMENTS;
  if (kind === 'max_hold') return HOLD_CATEGORIES;
  return [];
}

export function isTestKind(v: unknown): v is TestKind {
  return v === 'max_reps' || v === 'one_rm' || v === 'max_hold' || v === 'form_check';
}

/** "TEST · 1RM · Back squat (bar kg)" for the builder's block header. */
export function testItemLabel(kind: TestKind, movement?: string): string {
  const k = TEST_KINDS.find((x) => x.value === kind)?.label ?? kind;
  const m = testMovementOptions(kind).find((x) => x.value === movement)?.label;
  return m ? `TEST · ${k} · ${m}` : `TEST · ${k}`;
}
