import { supabase } from '../lib/supabase';
import { TIER_HARD_FLOORS } from '../constants/Progression';
import { withNetworkRetry } from '../lib/submitErrors';

export interface TrialResult {
  userId: string;
  tier: number;
  timeSeconds: number;
  isProgression: boolean;
}

export interface TrialResultResponse {
  success: true;
  is_first_completion: boolean;
  is_new_best: boolean;
  tier_advanced: boolean;
  previous_best_time_seconds: number | null;
}

// Use the same URL pattern as supabase.ts (graceful fallback — never crash at module level)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/submit-trial-result`;

export class TrialService {
  /**
   * Client-side pre-check — catches obvious bad input before network call.
   * Server-side Edge Function is the authoritative validator.
   */
  static isTimeValid(tier: number, timeSeconds: number): boolean {
    const minTime = TIER_HARD_FLOORS[tier];
    if (minTime === undefined) return false;
    return timeSeconds >= minTime && timeSeconds <= 3600;
  }

  /**
   * Submits a trial result via the Edge Function (server-side validated).
   * The Edge Function handles: auth, hard floor check, cooldown, and DB write.
   */
  static async submitResult(result: TrialResult): Promise<TrialResultResponse> {
    const { tier, timeSeconds, isProgression } = result;

    // Client-side pre-check for immediate UX feedback
    if (!this.isTimeValid(tier, timeSeconds)) {
      throw new Error('DISHONOR: Time defies human limits for this tier.');
    }

    // Get current session token. A background token refresh can transiently
    // race with this read, so retry once before treating it as a real
    // logged-out state — nothing has been sent to the server yet at this point.
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      await new Promise(resolve => setTimeout(resolve, 300));
      session = (await supabase.auth.getSession()).data.session;
    }
    if (!session) {
      throw new Error('Not authenticated. Please sign in again.');
    }

    // Call the Edge Function — server is the authority. A fresh AbortController
    // per attempt so a retry below gets its own full 10s budget rather than
    // sharing one that a prior attempt already spent.
    const data = await withNetworkRetry(async () => {
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
        if (err.name === 'AbortError') {
          throw new Error('Network request timed out. Please check your connection and try again.');
        }
        // Genuine transport-level failure (no response received at all) —
        // let withNetworkRetry decide whether to retry before this becomes
        // a user-facing error.
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }

      const json = await response.json();

      if (!response.ok) {
        if (json.error === 'DISHONOR') {
          throw new Error('DISHONOR: Time defies human limits for this tier.');
        }
        if (json.error === 'TOO_FAST') {
          throw new Error(json.message || 'Please wait before submitting again.');
        }
        throw new Error(json.error || 'Failed to save trial result. Please try again.');
      }

      return json as TrialResultResponse;
    });

    return data;
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
