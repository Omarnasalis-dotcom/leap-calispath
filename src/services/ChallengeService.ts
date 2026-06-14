import { supabase } from '../lib/supabase';

export interface ChallengeMovement {
  name: string;
  reps: number;
  points: number;
}

export interface WeeklyChallenge {
  id: string;
  group_id: number;
  week_start: string;
  title: string;
  description?: string;
  scoring_type: 'reps' | 'time';
  time_limit?: number;
  movements: ChallengeMovement[];
  is_active: boolean;
}

export class ChallengeService {
  /**
   * Gets the stable Saturday start date for the current week using UTC
   */
  static getCurrentWeekStart(): string {
    const now = new Date();
    // Use UTC day: 0 (Sun) to 6 (Sat)
    const day = now.getUTCDay();
    // Calculate how many days back to get to the most recent Saturday
    // If it's Saturday (6), daysBack = 0
    // If it's Sunday (0), daysBack = 1
    // If it's Friday (5), daysBack = 6
    const daysBack = (day + 1) % 7;
    
    const saturday = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysBack
    ));
    
    const year = saturday.getUTCFullYear();
    const month = String(saturday.getUTCMonth() + 1).padStart(2, '0');
    const date = String(saturday.getUTCDate()).padStart(2, '0');
    
    return `${year}-${month}-${date}`;
  }

  /**
   * Fetches the active challenge for a specific group and week
   */
  static async getActive(groupId: number, weekStart: string): Promise<WeeklyChallenge | null> {
    const { data, error } = await supabase
      .from('weekly_challenges')
      .select('*')
      .eq('group_id', groupId)
      .eq('week_start', weekStart)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching active challenge:', error);
      return null;
    }
    return data;
  }

  /**
   * Submits a score for the weekly challenge
   */
  static async submitScore(params: {
    challengeId: string;
    userId: string;
    score: number;
    scoringType: 'reps' | 'time';
    metadata?: any;
  }) {
    const { challengeId, score, metadata } = params;

    const { data, error } = await supabase.rpc('submit_weekly_score', {
      p_challenge_id: challengeId,
      p_score: score,
      p_metadata: metadata || {}
    });

    if (error) throw error;

    const isBetter = Array.isArray(data) && data.length > 0 ? !!data[0].is_better : false;
    return isBetter;
  }

  /**
   * Admin: Creates a new challenge
   */
  static async create(challenge: Partial<WeeklyChallenge>) {
    const { error } = await supabase
      .from('weekly_challenges')
      .insert({
        ...challenge,
        week_start: this.getCurrentWeekStart(),
        is_active: true,
      });

    if (error) throw error;
    return true;
  }

  /**
   * Admin: Deletes a challenge
   */
  static async delete(id: string) {
    const { error } = await supabase
      .from('weekly_challenges')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  /**
   * Fetches all active challenges for the current week (for admin view)
   */
  static async getAllActiveForWeek(weekStart: string): Promise<WeeklyChallenge[]> {
    const { data, error } = await supabase
      .from('weekly_challenges')
      .select('*')
      .eq('week_start', weekStart)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching all active challenges:', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }
}
