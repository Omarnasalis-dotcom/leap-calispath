import { supabase } from '../lib/supabase';
import { withNetworkRetry } from '../lib/submitErrors';
import { StepNumber } from '../lib/trialSteps';

// Strength Trial Steps (docs/features/STRENGTH_TRIAL_STEPS_PLAN.md). Saved by
// submit_strength_step only; never written to trial_history.

export interface StepSubmitResult {
  first_clear: boolean;
  best_seconds: number;
}

/** Server error codes from submit_strength_step. */
export type StepErrorCode = 'NOT_CURRENT_TIER' | 'STEP_LOCKED' | 'INVALID_TIME' | 'INVALID_STEP' | 'NOT_AUTHENTICATED';

export function stepErrorCode(error: unknown): StepErrorCode | null {
  const msg = (error as { message?: string } | null)?.message ?? '';
  const m = msg.match(/NOT_CURRENT_TIER|STEP_LOCKED|INVALID_TIME|INVALID_STEP|NOT_AUTHENTICATED/);
  return (m?.[0] as StepErrorCode) ?? null;
}

export async function submitStep(tier: number, step: StepNumber, seconds: number): Promise<StepSubmitResult> {
  return withNetworkRetry(async () => {
    const { data, error } = await supabase.rpc('submit_strength_step', { p_tier: tier, p_step: step, p_seconds: seconds });
    if (error) throw error;
    return data as StepSubmitResult;
  });
}

export interface StepProgress {
  /** Steps of this tier finished at least once. */
  cleared: number[];
  /** Best time per step (seconds). */
  best: Partial<Record<number, number>>;
}

/** The athlete's finished steps for one tier (their own rows only, by RLS). */
export async function getStepProgress(userId: string, tier: number): Promise<StepProgress> {
  const { data, error } = await supabase
    .from('strength_step_attempts')
    .select('step, seconds')
    .eq('user_id', userId)
    .eq('tier', tier);
  if (error) throw error;
  const best: Partial<Record<number, number>> = {};
  for (const row of (data ?? []) as { step: number; seconds: number }[]) {
    best[row.step] = Math.min(best[row.step] ?? Infinity, row.seconds);
  }
  return { cleared: Object.keys(best).map(Number).sort(), best };
}
