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

// Tier requirements based on Holistic "Weakest Link" spec
const TIER_REQUIREMENTS = {
  0: { // Helot
    pullups: { min: 0, variant: 'inverted_row' },
    dips: { min: 0, variant: 'bench_dip' },
    pushups: { min: 0, variant: 'knee_pushup' },
    muscleups: null,
  },
  1: { // Neos
    pullups: { min: 5, variant: 'inverted_row' },
    dips: { min: 5, variant: 'bench_dip' },
    pushups: { min: 5, variant: 'knee_pushup' },
    muscleups: null,
  },
  2: { // Ephebe
    pullups: { min: 5, variant: 'assisted_pullup' },
    dips: { min: 10, variant: 'bench_dip' },
    pushups: { min: 10, variant: 'standard_pushup' },
    muscleups: null,
  },
  3: { // Hoplite
    pullups: { min: 10, variant: 'assisted_pullup' },
    dips: { min: 5, variant: 'standard_dip' },
    pushups: { min: 15, variant: 'standard_pushup' },
    muscleups: null,
  },
  4: { // Spartan (The Rite of Passage)
    pullups: { min: 1, variant: 'strict_pullup' },
    dips: { min: 10, variant: 'standard_dip' },
    pushups: { min: 20, variant: 'standard_pushup' },
    muscleups: { min: 1, variant: 'banded_mu' },
  },
  5: { // Lochagos
    pullups: { min: 6, variant: 'strict_pullup' },
    dips: { min: 15, variant: 'standard_dip' },
    pushups: { min: 30, variant: 'standard_pushup' },
    muscleups: { min: 1, variant: 'strict_mu' },
  },
  6: { // Strategos
    pullups: { min: 10, variant: 'strict_pullup' },
    dips: { min: 20, variant: 'standard_dip' },
    pushups: { min: 40, variant: 'standard_pushup' },
    muscleups: { min: 3, variant: 'strict_mu' },
  },
  7: { // Olympian
    pullups: { min: 15, variant: 'strict_pullup' },
    dips: { min: 30, variant: 'standard_dip' },
    pushups: { min: 50, variant: 'standard_pushup' },
    muscleups: { min: 6, variant: 'strict_mu' },
  },
};

export function calculateSpartanRank(assessment: StrengthAssessment): number {
  const pullupTier = calculatePullupTier(assessment.pullups);
  const dipTier = calculateDipTier(assessment.dips);
  const pushupTier = calculatePushupTier(assessment.pushups);
  
  // Muscle-up tier calculation (Optional for T0-T3)
  const muTier = assessment.muscleups ? calculateMuscleUpTier(assessment.muscleups) : 0;

  // Weakest Link Rule: lowest tier determines rank
  const tiers = [pullupTier, dipTier, pushupTier, muTier];
  
  const finalTier = Math.min(...tiers);

  // Hard Cap at Tier 7 for Assessment
  return Math.min(finalTier, 7);
}

function calculatePullupTier(assessment: MovementAssessment): number {
  const { reps, variant } = assessment;

  // T7 (Olympian): 15 Strict
  if (variant === 'strict_pullup' && reps >= 15) return 7;
  // T6 (Strategos): 10 Strict
  if (variant === 'strict_pullup' && reps >= 10) return 6;
  // T5 (Lochagos): 6 Strict
  if (variant === 'strict_pullup' && reps >= 6) return 5;
  // T4 (Spartan): 1 Strict
  if (variant === 'strict_pullup' && reps >= 1) return 4;
  
  // T3 (Hoplite): 10 Assisted
  if ((variant === 'strict_pullup' || variant === 'assisted_pullup') && reps >= 10) return 3;
  // T2 (Ephebe): 5 Assisted
  if ((variant === 'strict_pullup' || variant === 'assisted_pullup') && reps >= 5) return 2;
  
  // T1 (Neos): 5 Inverted
  if (reps >= 5) return 1;

  return 0;
}

function calculateDipTier(assessment: MovementAssessment): number {
  const { reps, variant } = assessment;

  // T7: 30 Std
  if (variant === 'standard_dip' && reps >= 30) return 7;
  // T6: 20 Std
  if (variant === 'standard_dip' && reps >= 20) return 6;
  // T5: 15 Std
  if (variant === 'standard_dip' && reps >= 15) return 5;
  // T4: 10 Std
  if (variant === 'standard_dip' && reps >= 10) return 4;
  // T3: 5 Std
  if (variant === 'standard_dip' && reps >= 5) return 3;
  
  // T2: 10 Bench
  if (reps >= 10) return 2;
  // T1: 5 Bench
  if (reps >= 5) return 1;

  return 0;
}

function calculatePushupTier(assessment: MovementAssessment): number {
  const { reps, variant } = assessment;

  // T7: 50 Std
  if (variant === 'standard_pushup' && reps >= 50) return 7;
  // T6: 40 Std
  if (variant === 'standard_pushup' && reps >= 40) return 6;
  // T5: 30 Std
  if (variant === 'standard_pushup' && reps >= 30) return 5;
  // T4: 20 Std
  if (variant === 'standard_pushup' && reps >= 20) return 4;
  // T3: 15 Std
  if (variant === 'standard_pushup' && reps >= 15) return 3;
  // T2: 10 Std
  if (variant === 'standard_pushup' && reps >= 10) return 2;
  
  // T1: 5 Knee
  if (reps >= 5) return 1;

  return 0;
}

function calculateMuscleUpTier(assessment: MovementAssessment): number {
  const { reps, variant } = assessment;

  // T7: 6 Strict
  if (variant === 'strict_mu' && reps >= 6) return 7;
  // T6: 3 Strict
  if (variant === 'strict_mu' && reps >= 3) return 6;
  // T5: 1 Strict
  if (variant === 'strict_mu' && reps >= 1) return 5;
  // T4: 1 Banded
  if ((variant === 'strict_mu' || variant === 'banded_mu') && reps >= 1) return 4;

  // T0-T3: No requirement
  return 3; 
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
