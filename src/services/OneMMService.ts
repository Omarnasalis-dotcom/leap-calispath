import { supabase } from '../lib/supabase';
import { calculateOneMMPoints, ONEMM_MOVEMENTS, ONEMM_CATEGORIES } from '../lib/oneMMLogic';
import { withNetworkRetry } from '../lib/submitErrors';

// Module-level cache — persists for the app session
let cachedOneMMStats: { userId: string; stats: OneMMUserStats; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface OneMMRanking {
  user_id: string;
  display_name: string;
  value: number; // reps or points
  rank: number;
  country?: string;
  gender?: string;
}

export interface OneMMUserStats {
  pbs: Record<string, number>; // movementId -> maxReps
  totalPoints: number;
  ranks: Record<string, number>; // movementId or 'glory' -> rank
}

export const OneMMService = {
  /**
   * Fetches user's 1MM personal bests and current rankings
   */
  async getUserStats(userId: string): Promise<OneMMUserStats> {
    // Return cached data if fresh
    if (cachedOneMMStats && 
        cachedOneMMStats.userId === userId && 
        Date.now() - cachedOneMMStats.timestamp < CACHE_TTL) {
      return cachedOneMMStats.stats;
    }

    try {
      const { data: logs, error } = await supabase
        .from('one_min_max_logs')
        .select('id, user_id, movement_id, reps, points')
        .eq('user_id', userId)
        .eq('excluded_from_pb', false);

      if (error) throw error;

      // Build PB map
      const pbs: Record<string, number> = {};
      ONEMM_MOVEMENTS.forEach(m => pbs[m.id] = 0);

      (Array.isArray(logs) ? logs : []).forEach(log => {
        if (log.reps > (pbs[log.movement_id] || 0)) {
          pbs[log.movement_id] = log.reps;
        }
      });

      // Calculate total points using Peak Performance per Pattern
      const patternPeaks: Record<string, number> = {};
      (Array.isArray(logs) ? logs : []).forEach(log => {
        const movement = ONEMM_MOVEMENTS.find(m => m.id === log.movement_id);
        if (movement) {
          const pid = movement.patternId;
          if (log.points > (patternPeaks[pid] || 0)) {
            patternPeaks[pid] = log.points;
          }
        }
      });

      const totalPoints = Object.values(patternPeaks).reduce((sum, p) => sum + p, 0);

      // Get individual movement ranks in parallel to eliminate N+1 waterfall latency
      const ranks: Record<string, number> = {};
      const rankPromises = ONEMM_MOVEMENTS.map(async (m) => {
        const userMax = pbs[m.id] || 0;
        if (userMax > 0) {
          const { count } = await supabase
            .from('one_min_max_logs')
            .select('*', { count: 'exact', head: true })
            .eq('movement_id', m.id)
            .eq('excluded_from_pb', false)
            .gt('reps', userMax);
          ranks[m.id] = (count || 0) + 1;
        } else {
          ranks[m.id] = 0;
        }
      });
      await Promise.all(rankPromises);

      const statsObj = { pbs, totalPoints, ranks };
      cachedOneMMStats = { userId, stats: statsObj, timestamp: Date.now() };
      return statsObj;
    } catch (err) {
      console.error('Error fetching 1MM user stats:', err);
      const fallbackPbs: Record<string, number> = {};
      ONEMM_MOVEMENTS.forEach(m => fallbackPbs[m.id] = 0);
      return { pbs: fallbackPbs, totalPoints: 0, ranks: {} };
    }
  },

  async getGloryRank(userId: string, totalPoints: number): Promise<number> {
    try {
      const { data: lbData } = await supabase.rpc('get_onemm_well_rounded_leaderboard');
      const personalEntry = (lbData || []).find((e: any) => e.u_id === userId);
      return personalEntry ? Number(personalEntry.rnk) : 0;
    } catch (e) {
      try {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gt('one_mm_points', totalPoints);
        return (count || 0) + 1;
      } catch (err) {
        console.error('Exception fetching 1MM glory rank:', err);
        return 0;
      }
    }
  },

  invalidateCache() {
    cachedOneMMStats = null;
  },

  /**
   * Saves a new 1MM log and updates the aggregated profile points
   */
  async saveLog(userId: string, movementId: string, reps: number, force: boolean = false): Promise<{ isNewPB: boolean }> {
    try {
      const { data, error } = await withNetworkRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        try {
          return await supabase
            .rpc('submit_onemm_log', {
              p_movement_id: movementId,
              p_reps: reps,
              p_force: force
            })
            .abortSignal(controller.signal);
        } finally {
          clearTimeout(timeoutId);
        }
      });

      if (error) throw error;

      OneMMService.invalidateCache();

      const isNewPB = Array.isArray(data) && data.length > 0 ? !!data[0].is_new_pb : false;
      return { isNewPB };
    } catch (err) {
      // P1001-P1004 are submit_onemm_log's own validation codes (negative
      // reps / invalid movement / ceiling exceeded / cooldown active) —
      // expected outcomes, not bugs. Mirrors StaticWorldScreen's handling.
      const isExpectedRejection = ['P1001', 'P1002', 'P1003', 'P1004'].includes((err as any)?.code);
      if (!isExpectedRejection) {
        console.error('Exception saving 1MM log:', err);
      }
      throw err;
    }
  },

  /**
   * Fetches leaderboard data
   */
  async getLeaderboard(
    type: 'overall' | string, // overall or movement_id
    categoryId?: string,
    communityId?: string | null
  ): Promise<OneMMRanking[]> {
    try {
      if (type === 'overall') {
        const { data, error } = await supabase.rpc('get_onemm_well_rounded_leaderboard', { p_community_id: communityId || null });

        if (error) {
          console.error('1MM Overall RPC Error:', error);
          const { data: fallback, error: fbError } = await supabase
            .from('profiles')
            .select('id, display_name, one_mm_points, country, gender')
            .gt('one_mm_points', 0)
            .order('one_mm_points', { ascending: false })
            .limit(50);

          if (fbError) throw fbError;
          return (Array.isArray(fallback) ? fallback : []).map((d, i) => ({
            user_id: d.id,
            display_name: d.display_name || 'Warrior',
            value: d.one_mm_points,
            rank: i + 1,
            country: (d as any).country,
            gender: (d as any).gender
          }));
        }

        return (Array.isArray(data) ? data : []).map((d: any) => ({
          user_id: d.u_id,
          display_name: d.d_name || 'Warrior',
          value: Number(d.t_score || 0),
          rank: Number(d.rnk || 0),
          country: d.country,
          gender: d.gender,
        }));
      }

      // Movement-specific leaderboard (Max reps)
      // We use a complex query to get max reps per user
      const { data, error } = await supabase
        .from('one_min_max_logs')
        .select(`
          user_id,
          reps,
          profiles:user_id (
            display_name,
            gender
          )
        `)
        .eq('movement_id', type)
        .eq('excluded_from_pb', false)
        .order('reps', { ascending: false })
        .limit(100); // Get more to handle deduplication in JS if necessary, or use a better SQL view

      if (error) throw error;

      // Deduplicate by user_id to only show their best
      const uniqueMap = new Map();
      (Array.isArray(data) ? data : []).forEach((d: any) => {
        if (!uniqueMap.has(d.user_id) || d.reps > uniqueMap.get(d.user_id).reps) {
          uniqueMap.set(d.user_id, {
            user_id: d.user_id,
            display_name: (Array.isArray(d.profiles) ? d.profiles[0]?.display_name : d.profiles?.display_name) || 'Warrior',
            gender: (Array.isArray(d.profiles) ? d.profiles[0]?.gender : d.profiles?.gender),
            value: d.reps,
          });
        }
      });

      return Array.from(uniqueMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 50)
        .map((d, i) => ({ ...d, rank: i + 1 }));
    } catch (err) {
      console.error('Exception fetching 1MM leaderboard:', err);
      return [];
    }
  },

  /**
   * Fetches leaderboard for a specific category (Sum of points in that category)
   */
  async getCategoryLeaderboard(categoryId: string, communityId?: string | null): Promise<OneMMRanking[]> {
    try {
      const { data, error } = await supabase.rpc('get_onemm_category_leaderboard', {
        p_category_id: categoryId,
        p_community_id: communityId || null
      });

      if (error) throw error;

      return (Array.isArray(data) ? data : []).map((d: any) => ({
        user_id: d.u_id,
        display_name: d.d_name || 'Warrior',
        gender: d.gender,
        value: Number(d.t_score || 0),
        rank: Number(d.rnk || 0),
      }));
    } catch (err) {
      console.error('Exception fetching 1MM category leaderboard:', err);
      return [];
    }
  }
};
