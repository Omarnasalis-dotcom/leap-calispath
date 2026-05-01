// Spartan Agoge - Tier Calculation Logic
// Weakest Link Rule: Your tier is your lowest performing movement

export type MovementVariant =
  | 'inverted_row' | 'assisted_pullup' | 'strict_pullup'
  | 'bench_dip' | 'standard_dip'
  | 'knee_pushup' | 'standard_pushup'
  | 'jumping_mu' | 'banded_mu' | 'strict_mu';

export interface MovementAssessment {
  reps: number;
  variant: MovementVariant;
}

export interface StrengthAssessment {
  pullups: MovementAssessment;
  dips: MovementAssessment;
  pushups: MovementAssessment;
  muscleups?: MovementAssessment;
}

// Tier requirements based on spec v3
const TIER_REQUIREMENTS = {
  0: { // Helot
    pullups: { min: 0, max: 4, variant: 'inverted_row' },
    dips: { min: 0, max: 4, variant: 'bench_dip' },
    pushups: { min: 0, max: 4, variant: 'knee_pushup' },
    muscleups: null, // N/A
  },
  1: { // Neos
    pullups: { min: 5, max: 10, variant: 'inverted_row' },
    dips: { min: 5, max: 10, variant: 'bench_dip' },
    pushups: { min: 5, max: 10, variant: 'knee_pushup' },
    muscleups: null,
  },
  2: { // Ephebe
    pullups: { min: 5, max: Infinity, variant: 'assisted_pullup' },
    dips: { min: 10, max: Infinity, variant: 'bench_dip' },
    pushups: { min: 10, max: Infinity, variant: 'knee_pushup' },
    muscleups: { min: 5, max: Infinity, variant: 'jumping_mu' },
  },
  3: { // Hoplite
    pullups: { min: 10, max: 14, variant: 'assisted_pullup' },
    dips: { min: 5, max: 10, variant: 'standard_dip' },
    pushups: { min: 10, max: 15, variant: 'standard_pushup' },
    muscleups: { min: 5, max: 10, variant: 'jumping_mu' },
  },
  4: { // Spartan
    pullups: { min: 1, max: 5, variant: 'strict_pullup' },
    dips: { min: 8, max: 12, variant: 'standard_dip' },
    pushups: { min: 12, max: 15, variant: 'standard_pushup' },
    muscleups: { min: 1, max: 4, variant: 'banded_mu' },
  },
  5: { // Lochagos
    pullups: { min: 6, max: 9, variant: 'strict_pullup' },
    dips: { min: 13, max: 15, variant: 'standard_dip' },
    pushups: { min: 16, max: 22, variant: 'standard_pushup' },
    muscleups: { min: 5, max: 8, variant: 'banded_mu' },
  },
  6: { // Strategos
    pullups: { min: 10, max: 14, variant: 'strict_pullup' },
    dips: { min: 16, max: 20, variant: 'standard_dip' },
    pushups: { min: 23, max: 29, variant: 'standard_pushup' },
    muscleups: { min: 1, max: Infinity, variant: 'strict_mu' },
  },
  7: { // Olympian
    pullups: { min: 15, max: 29, variant: 'strict_pullup' },
    dips: { min: 21, max: 39, variant: 'standard_dip' },
    pushups: { min: 30, max: 49, variant: 'standard_pushup' },
    muscleups: { min: 5, max: 9, variant: 'strict_mu' },
  },
  8: { // Demigod
    pullups: { min: 30, max: Infinity, variant: 'strict_pullup' },
    dips: { min: 40, max: Infinity, variant: 'standard_dip' },
    pushups: { min: 50, max: Infinity, variant: 'standard_pushup' },
    muscleups: { min: 10, max: Infinity, variant: 'strict_mu' },
  },
};

export function calculateSpartanRank(assessment: StrengthAssessment): number {
  const pullupTier = calculatePullupTier(assessment.pullups);
  const dipTier = calculateDipTier(assessment.dips);
  const pushupTier = calculatePushupTier(assessment.pushups);
  const muTier = calculateMuscleUpTier(assessment.muscleups);

  // Weakest Link Rule: lowest tier determines rank
  const tiers = [pullupTier, dipTier, pushupTier];
  if (muTier !== null) {
    tiers.push(muTier);
  }

  return Math.min(...tiers);
}

function calculatePullupTier(assessment: MovementAssessment): number {
  const reps = assessment.reps;
  const variant = assessment.variant;

  // Tier 0: <5 inverted rows
  if (variant === 'inverted_row' && reps < 5) return 0;
  
  // Tier 1: 5-10 inverted rows
  if (variant === 'inverted_row' && reps >= 5 && reps <= 10) return 1;
  
  // Tier 2+: assisted or strict
  if (variant === 'assisted_pullup') {
    if (reps >= 10 && reps <= 14) return 3; // Hoplite
    if (reps >= 5) return 2; // Ephebe minimum
  }
  
  // Tier 4+: strict pullups
  if (variant === 'strict_pullup') {
    if (reps >= 30) return 8; // Demigod
    if (reps >= 15) return 7; // Olympian
    if (reps >= 10) return 6; // Strategos
    if (reps >= 6) return 5; // Lochagos
    if (reps >= 1) return 4; // Spartan
  }

  // Default: find best tier for reps
  if (reps >= 30) return 8;
  if (reps >= 15) return 7;
  if (reps >= 10) return 6;
  if (reps >= 6) return 5;
  if (reps >= 1) return 4;
  if (reps >= 10) return 3;
  if (reps >= 5) return 2;
  if (reps >= 5) return 1;
  
  return 0;
}

function calculateDipTier(assessment: MovementAssessment): number {
  const reps = assessment.reps;
  const variant = assessment.variant;

  if (variant === 'bench_dip') {
    if (reps >= 10) return 2; // Ephebe
    if (reps >= 5) return 1; // Neos
    return 0;
  }

  if (variant === 'standard_dip') {
    if (reps >= 40) return 8; // Demigod
    if (reps >= 21) return 7; // Olympian
    if (reps >= 16) return 6; // Strategos
    if (reps >= 13) return 5; // Lochagos
    if (reps >= 8) return 4; // Spartan
    if (reps >= 5) return 3; // Hoplite
  }

  return 0;
}

function calculatePushupTier(assessment: MovementAssessment): number {
  const reps = assessment.reps;
  const variant = assessment.variant;

  if (variant === 'knee_pushup') {
    if (reps >= 10) return 2; // Ephebe
    if (reps >= 5) return 1; // Neos
    return 0;
  }

  if (variant === 'standard_pushup') {
    if (reps >= 50) return 8; // Demigod
    if (reps >= 30) return 7; // Olympian
    if (reps >= 23) return 6; // Strategos
    if (reps >= 16) return 5; // Lochagos
    if (reps >= 12) return 4; // Spartan
    if (reps >= 10) return 3; // Hoplite
  }

  return 0;
}

function calculateMuscleUpTier(assessment?: MovementAssessment): number | null {
  if (!assessment) return null;

  const reps = assessment.reps;
  const variant = assessment.variant;

  if (variant === 'jumping_mu') {
    if (reps >= 8) return 3; // Hoplite
    if (reps >= 5) return 2; // Ephebe
  }

  if (variant === 'banded_mu') {
    if (reps >= 5) return 5; // Lochagos
    if (reps >= 1) return 4; // Spartan
  }

  if (variant === 'strict_mu') {
    if (reps >= 10) return 8; // Demigod
    if (reps >= 5) return 7; // Olympian
    if (reps >= 1) return 6; // Strategos
  }

  return 0;
}

// Movement variant options for UI
export const MOVEMENT_OPTIONS = {
  pullups: [
    { value: 'strict_pullup', label: 'Strict Pull-up', description: 'Dead hang to chin over bar, no swing' },
    { value: 'assisted_pullup', label: 'Assisted Pull-up', description: 'Band or machine assistance' },
    { value: 'inverted_row', label: 'Inverted Row', description: 'Body horizontal, pull chest to bar' },
  ],
  dips: [
    { value: 'standard_dip', label: 'Parallel Bar Dip', description: 'Full range on parallel bars' },
    { value: 'bench_dip', label: 'Bench Dip', description: 'Feet on ground, hands on bench behind you' },
  ],
  pushups: [
    { value: 'standard_pushup', label: 'Standard Push-up', description: 'Full plank position' },
    { value: 'knee_pushup', label: 'Knee Push-up', description: 'Knees on ground, full push-up motion' },
  ],
  muscleups: [
    { value: 'strict_mu', label: 'Strict Muscle-up', description: 'No assistance, full control' },
    { value: 'banded_mu', label: 'Banded Muscle-up', description: 'Band assistance for transition' },
    { value: 'jumping_mu', label: 'Jumping Muscle-up', description: 'Use jump to assist transition' },
  ],
};
