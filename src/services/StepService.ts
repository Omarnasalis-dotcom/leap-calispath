import { supabase } from '../lib/supabase';
import { withNetworkRetry } from '../lib/submitErrors';
import { ETERNITY_TIER, StepNumber } from '../lib/trialSteps';

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

// Screens showing step progress refresh the moment a step is saved (coming
// back from the trial screen doesn't always re-focus them).
const savedListeners = new Set<() => void>();
export function onStepSaved(listener: () => void): () => void {
  savedListeners.add(listener);
  return () => { savedListeners.delete(listener); };
}

export async function submitStep(tier: number, step: StepNumber, seconds: number): Promise<StepSubmitResult> {
  const result = await withNetworkRetry(async () => {
    const { data, error } = await supabase.rpc('submit_strength_step', { p_tier: tier, p_step: step, p_seconds: seconds });
    if (error) throw error;
    return data as StepSubmitResult;
  });
  savedListeners.forEach(l => l());
  return result;
}

export interface StepProgress {
  /** Steps of this tier finished at least once. */
  cleared: number[];
  /** Best time per step (seconds). */
  best: Partial<Record<number, number>>;
  /**
   * Eternity (tier 9) only: the Eternity trial has been finished, so the
   * Journey checkpoint offers a pick of trials to improve.
   */
  eternityDone?: boolean;
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
  const progress: StepProgress = { cleared: Object.keys(best).map(Number).sort(), best };
  if (tier === ETERNITY_TIER) {
    const { data: done, error: doneError } = await supabase
      .from('trial_history')
      .select('id')
      .eq('user_id', userId)
      .eq('tier_attempted', ETERNITY_TIER)
      .eq('completed', true)
      .limit(1);
    if (doneError) throw doneError;
    progress.eternityDone = (done ?? []).length > 0;
  }
  return progress;
}

/** Finished steps for every tier (Strength tab: current path + practice on past tiers). */
export async function getAllStepProgress(userId: string): Promise<Record<number, StepProgress>> {
  const { data, error } = await supabase
    .from('strength_step_attempts')
    .select('tier, step, seconds')
    .eq('user_id', userId);
  if (error) throw error;
  const out: Record<number, StepProgress> = {};
  for (const row of (data ?? []) as { tier: number; step: number; seconds: number }[]) {
    const p = (out[row.tier] ??= { cleared: [], best: {} });
    p.best[row.step] = Math.min(p.best[row.step] ?? Infinity, row.seconds);
  }
  for (const p of Object.values(out)) p.cleared = Object.keys(p.best).map(Number).sort();
  return out;
}
