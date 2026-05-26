import { supabase } from '../lib/supabase';
import { TIER_HARD_FLOORS } from '../constants/Progression';

export interface TrialResult {
  userId: string;
  tier: number;
  timeSeconds: number;
  isProgression: boolean;
}

// Use the same URL pattern as supabase.ts
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vxscvluyskawegmwaxnh.supabase.co';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/submit-trial-result`;

export class TrialService {
  /**
   * Client-side pre-check — catches obvious bad input before network call.
   * Server-side Edge Function is the authoritative validator.
   */
  static isTimeValid(tier: number, timeSeconds: number): boolean {
    const minTime = TIER_HARD_FLOORS[tier] ?? 42;
    return timeSeconds >= minTime;
  }

  /**
   * Submits a trial result via the Edge Function (server-side validated).
   * The Edge Function handles: auth, hard floor check, cooldown, and DB write.
   */
  static async submitResult(result: TrialResult) {
    const { tier, timeSeconds, isProgression } = result;

    // Client-side pre-check for immediate UX feedback
    if (!this.isTimeValid(tier, timeSeconds)) {
      throw new Error('DISHONOR: Time defies human limits for this tier.');
    }

    // Get current session token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      throw new Error('Not authenticated. Please sign in again.');
    }

    // Call the Edge Function — server is the authority
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    let response;
    try {
      response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tier,
          time_seconds: timeSeconds,
          mode: isProgression ? 'progression' : 'practice',
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.toLowerCase().includes('network')) {
        throw new Error('Network request timed out. Please check your connection and try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();

    if (!response.ok) {
      if (data.error === 'DISHONOR') {
        throw new Error('DISHONOR: Time defies human limits for this tier.');
      }
      if (data.error === 'TOO_FAST') {
        throw new Error(data.message || 'Please wait before submitting again.');
      }
      throw new Error(data.error || 'Failed to save trial result. Please try again.');
    }

    return { success: true };
  }

  /**
   * Logs an abandoned trial — no validation needed, just a record.
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
