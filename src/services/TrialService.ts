import { supabase } from '../lib/supabase';
import { Trial, getTrialForTier } from '../lib/trials';
import { TIER_HARD_FLOORS } from '../constants/Progression';

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

    // 1.5 Anti-cheat: Block progression if time is suspicious
    if (!this.isTimeValid(tier, timeSeconds)) {
      throw new Error('DISHONOR: Time defies human limits for this tier.');
    }

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
      // Cap at 8: completing the Demigod trial (tier 8) awards Demigod rank (8).
      // Only completing the Eternity Protocol trial (tier 9) awards Eternity rank (9).
      const newTierValue = tier < 8 ? tier + 1 : tier;
      updates.strength_tier = Math.max(profile.strength_tier, newTierValue);
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
