import { supabase } from '../lib/supabase';
import { calculateOneMMPoints, ONEMM_MOVEMENTS, ONEMM_CATEGORIES } from '../lib/oneMMLogic';

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
        .eq('user_id', userId);

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
          .select('*', { count: 'exact', head: true })
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
  async saveLog(userId: string, movementId: string, reps: number): Promise<{ isNewPB: boolean }> {
    try {
      const movement = ONEMM_MOVEMENTS.find(m => m.id === movementId);
      if (!movement) throw new Error('Invalid movement');

      const points = calculateOneMMPoints(reps, movement.categoryId);

      // 1. Save to logs
      const { error: logError } = await supabase
        .from('one_min_max_logs')
        .insert({
          user_id: userId,
          movement_id: movementId,
          category_id: movement.categoryId,
          reps,
          points
        });

      if (logError) throw logError;

      // 2. Check if it's a new PB for this movement to decide on profile update
      // Note: We sum ALL logs for points, but only track PB for display
      const { data: existingMax } = await supabase
        .from('one_min_max_logs')
        .select('reps')
        .eq('user_id', userId)
        .eq('movement_id', movementId)
        .order('reps', { ascending: false })
        .limit(1)
        .single();

      const isNewPB = reps >= (existingMax?.reps || 0);

      // 3. Update profile points (Peak Performance per Pattern)
      const { data: allLogs } = await supabase
        .from('one_min_max_logs')
        .select('movement_id, points')
        .eq('user_id', userId);

      const patternPeaks: Record<string, number> = {};
      (Array.isArray(allLogs) ? allLogs : []).forEach(log => {
        const movement = ONEMM_MOVEMENTS.find(m => m.id === log.movement_id);
        if (movement) {
          const pid = movement.patternId;
          if (log.points > (patternPeaks[pid] || 0)) {
            patternPeaks[pid] = log.points;
          }
        }
      });

      // Sync 1MM points server-side via RPC
      const { error: rpcErr } = await supabase.rpc('sync_onemm_points', { p_user_id: userId });
      if (rpcErr) throw rpcErr;

      OneMMService.invalidateCache();

      return { isNewPB };
    } catch (err) {
      console.error('Exception saving 1MM log:', err);
      return { isNewPB: false };
    }
  },

  /**
   * Fetches leaderboard data
   */
  async getLeaderboard(
    type: 'overall' | string, // overall or movement_id
    categoryId?: string
  ): Promise<OneMMRanking[]> {
    try {
      if (type === 'overall') {
        const { data, error } = await supabase.rpc('get_onemm_well_rounded_leaderboard');

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
          user_id: d.u_id || d.user_id,
          display_name: d.d_name || d.display_name || 'Warrior',
          value: Number(d.t_score || d.total_points || 0),
          rank: Number(d.rnk || d.rank || 0),
          country: d.country,
          gender: d.gender
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
            display_name
          )
        `)
        .eq('movement_id', type)
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
   * Fetches leaderboard for a specific category (Sum of reps in that category)
   */
  async getCategoryLeaderboard(categoryId: string): Promise<OneMMRanking[]> {
    try {
      const { data, error } = await supabase
        .from('one_min_max_logs')
        .select(`
          user_id,
          points,
          profiles:user_id (
            display_name
          )
        `)
        .eq('category_id', categoryId);

      if (error) throw error;

      // Aggregate points per user
      const userMap = new Map();
      (Array.isArray(data) ? data : []).forEach((d: any) => {
        const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
        const current = userMap.get(d.user_id) || {
          user_id: d.user_id,
          display_name: profile?.display_name || 'Warrior',
          value: 0
        };
        current.value += Number(d.points || 0);
        userMap.set(d.user_id, current);
      });

      return Array.from(userMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 50)
        .map((d, i) => ({ ...d, rank: i + 1 }));
    } catch (err) {
      console.error('Exception fetching 1MM category leaderboard:', err);
      return [];
    }
  }
};
