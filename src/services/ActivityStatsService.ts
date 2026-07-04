import { supabase } from '../lib/supabase';

// Module-level cache — persists for the app session
let cachedStats: { userId: string; stats: WeeklyActivityStats; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface WeeklyActivityStats {
  streakDays: number;
  pointsThisWeek: number;
  workoutsCompleted: number;
}

export const ActivityStatsService = {
  /**
   * Fetches the user's real streak / weekly points / weekly workout count
   * via get_weekly_activity_stats(), which also persists the computed
   * streak back to profiles.streak.
   */
  async getWeeklyStats(userId: string): Promise<WeeklyActivityStats> {
    if (cachedStats && cachedStats.userId === userId && Date.now() - cachedStats.timestamp < CACHE_TTL) {
      return cachedStats.stats;
    }

    try {
      const { data, error } = await supabase.rpc('get_weekly_activity_stats');
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const stats: WeeklyActivityStats = {
        streakDays: Number(row?.streak_days || 0),
        pointsThisWeek: Number(row?.points_this_week || 0),
        workoutsCompleted: Number(row?.workouts_this_week || 0),
      };

      cachedStats = { userId, stats, timestamp: Date.now() };
      return stats;
    } catch (err) {
      console.error('Error fetching weekly activity stats:', err);
      return { streakDays: 0, pointsThisWeek: 0, workoutsCompleted: 0 };
    }
  },

  invalidateCache() {
    cachedStats = null;
  },
};
