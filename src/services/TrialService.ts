import { supabase } from '../lib/supabase';
import { Trial, getTrialForTier } from '../lib/trials';

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
};

export interface TrialResult {
  userId: string;
  tier: number;
  timeSeconds: number;
  isProgression: boolean;
}

export class TrialService {
  /**
   * Validates if a trial time is suspicious (Anti-cheat)
   */
  static isTimeValid(tier: number, timeSeconds: number): boolean {
    const minTime = TIER_HARD_FLOORS[tier] ?? 42;
    return timeSeconds >= minTime;
  }

  /**
   * Submits a trial result and updates user profile if needed
   */
  static async submitResult(result: TrialResult) {
    const { userId, tier, timeSeconds, isProgression } = result;

    // 1. Log attempt to history
    const { error: historyError } = await supabase.from('trial_history').insert({
      user_id: userId,
      tier_attempted: tier,
      completed: true,
      time_seconds: timeSeconds,
    });

    if (historyError) throw historyError;

    // 2. Fetch current profile to update best times
    const { data: profile, error: pError } = await supabase
      .from('profiles')
      .select('best_times, strength_tier, trials_passed, trials_attempted')
      .eq('id', userId)
      .single();

    if (pError) throw pError;

    const newBestTimes = {
      ...profile.best_times,
      [tier]: Math.min(timeSeconds, profile.best_times[tier] || Infinity),
    };

    const updates: any = {
      best_times: newBestTimes,
      trials_attempted: (profile.trials_attempted || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    if (isProgression) {
      updates.strength_tier = Math.max(profile.strength_tier, tier + 1);
      updates.trials_passed = (profile.trials_passed || 0) + 1;
    }

    // 3. Update profile
    const { error: uError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (uError) throw uError;

    return { success: true, newTier: updates.strength_tier || profile.strength_tier };
  }

  /**
   * Logs an abandoned trial
   */
  static async logAbandon(userId: string, tier: number, timeSeconds: number) {
    return await supabase.from('trial_history').insert({
      user_id: userId,
      tier_attempted: tier,
      completed: false,
      time_seconds: timeSeconds,
    });
  }
}
