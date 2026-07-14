import { supabase } from '../lib/supabase';
import { calculateTotalPowerScore, getPowerLevel, POWER_LEVELS } from '../lib/powerLogic';

// Module-level cache — persists for the app session
let cachedPowerStats: { userId: string; stats: PowerUserStats; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface PowerMovementRanking {
  user_id: string;
  display_name: string;
  value: number;
  points: number;
  rank: number;
  country?: string;
  gender?: string;
}

export interface PowerUserStats {
  pbs: Record<string, number>;
  totalPoints: number;
  level: any;
  ranks: Record<string, number>;
}

export const PowerService = {
  /**
   * Fetches the user's Power PBs and calculated ranks
   */
  async getUserStats(userId: string): Promise<PowerUserStats> {
    // Return cached data if fresh
    if (cachedPowerStats && 
        cachedPowerStats.userId === userId && 
        Date.now() - cachedPowerStats.timestamp < CACHE_TTL) {
      return cachedPowerStats.stats;
    }

    try {
      const { data: pbs, error } = await supabase
        .from('power_assessments')
        .select('pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      const pbMap = {
        pull_up: pbs?.pullup_1rm || 0,
        dip: pbs?.dip_1rm || 0,
        squat: pbs?.squat_1rm || 0,
        muscle_up: pbs?.muscleup_1rm || 0,
      };

      const totalPoints = calculateTotalPowerScore(pbMap);
      const level = getPowerLevel(totalPoints);

      // Get ranks for each movement in parallel to eliminate N+1 waterfall latency
      const ranks: Record<string, number> = {};
      const movements = ['pullup_1rm', 'dip_1rm', 'squat_1rm', 'muscleup_1rm'];

      const rankPromises = movements.map(async (field) => {
        const val = (pbs as any)?.[field] || 0;
        let key = field.replace('_1rm', '');
        if (key === 'pullup') key = 'pull_up';
        if (key === 'muscleup') key = 'muscle_up';

        if (val > 0) {
          const { count } = await supabase
            .from('power_assessments')
            .select('*', { count: 'exact', head: true })
            .gt(field, val);
          ranks[key] = (count || 0) + 1;
        } else {
          ranks[key] = 0;
        }
      });
      await Promise.all(rankPromises);

      // Glory rank is resolved by the caller from the glory leaderboard list it already
      // fetches (top 50), falling back to getGloryRank() only if the user isn't in it.

      const statsObj = { pbs: pbMap, totalPoints, level, ranks };
      cachedPowerStats = { userId, stats: statsObj, timestamp: Date.now() };
      return statsObj;
    } catch (err) {
      console.error('Error fetching Power user stats:', err);
      return {
        pbs: { pull_up: 0, dip: 0, squat: 0, muscle_up: 0 },
        totalPoints: 0,
        level: getPowerLevel(0),
        ranks: {}
      };
    }
  },

  invalidateCache() {
    cachedPowerStats = null;
  },

  /**
   * Direct count query for the user's global glory rank. Only needed as a fallback
   * when the user doesn't appear in the top-50 glory leaderboard list.
   */
  async getGloryRank(totalPoints: number): Promise<number> {
    const { count: gloryCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gt('power_points', totalPoints);
    return (gloryCount || 0) + 1;
  },

  /**
   * Fetches leaderboard for a specific movement, glory, or mastery level
   */
  async getLeaderboard(type: 'glory' | 'level_1' | 'level_2' | 'level_3' | 'pull_up' | 'dip' | 'squat' | 'muscle_up'): Promise<PowerMovementRanking[]> {
    try {
      if (type === 'glory') {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, power_points, country, gender')
          .gt('power_points', 0)
          .order('power_points', { ascending: false })
          .limit(50);
        
        if (error) throw error;
        return (Array.isArray(data) ? data : []).map((d, i) => ({
          user_id: d.id,
          display_name: d.display_name || 'Warrior',
          value: d.power_points,
          points: d.power_points,
          rank: i + 1,
          country: d.country,
          gender: d.gender
        }));
      }

      if (type.startsWith('level_')) {
        const levelId = parseInt(type.split('_')[1]);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, power_points, gender')
          .eq('power_tier', levelId)
          .order('power_points', { ascending: false })
          .limit(50);
        
        if (error) throw error;
        return (Array.isArray(data) ? data : []).map((d, i) => ({
          user_id: d.id,
          display_name: d.display_name || 'Warrior',
          value: d.power_points,
          points: d.power_points,
          gender: d.gender,
          rank: i + 1
        }));
      }

      const dbField = type.replace('_', '') + '_1rm';
      // Mapping fix for pull_up and muscle_up
      const cleanDbField = dbField.replace('__', '_'); // safety
      
      const { data, error } = await supabase
        .from('power_assessments')
        .select(`
          user_id,
          ${cleanDbField},
          profiles:user_id (
            display_name,
            gender
          )
        `)
        .gt(cleanDbField, 0)
        .order(cleanDbField, { ascending: false })
        .limit(50);

      if (error) {
        console.error(`Leaderboard error for ${cleanDbField}:`, error);
        throw error;
      }

      return (Array.isArray(data) ? data : []).map((d: any, i: number) => ({
        user_id: d.user_id,
        display_name: d.profiles?.display_name || 'Warrior',
        gender: d.profiles?.gender,
        value: d[cleanDbField],
        points: type === 'muscle_up' ? d[cleanDbField] * 2 : d[cleanDbField],
        rank: i + 1
      }));
    } catch (err) {
      console.error(`Exception fetching Power leaderboard for ${type}:`, err);
      return [];
    }
  },

  /**
   * Saves a new PB and checks for promotion/PR
   */
  async savePB(userId: string, movementId: string, kg: number, force: boolean = false): Promise<{ isNewPB: boolean; isPromotion: boolean }> {
    try {
      const { data: current } = await supabase
        .from('power_assessments')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      let cleanField = 'pullup_1rm';
      if (movementId === 'dip') cleanField = 'dip_1rm';
      if (movementId === 'squat') cleanField = 'squat_1rm';
      if (movementId === 'muscle_up') cleanField = 'muscleup_1rm';

      const oldVal = current?.[cleanField] || 0;
      const isNewPB = kg > oldVal;

      if (isNewPB || force) {
        const newPBs = {
          pullup_1rm: movementId === 'pull_up' ? kg : current?.pullup_1rm || 0,
          dip_1rm: movementId === 'dip' ? kg : current?.dip_1rm || 0,
          squat_1rm: movementId === 'squat' ? kg : current?.squat_1rm || 0,
          muscleup_1rm: movementId === 'muscle_up' ? kg : current?.muscleup_1rm || 0,
        };

        const { data: rpcData, error: rpcErr } = await supabase.rpc('submit_power_assessment', {
          p_pullup: newPBs.pullup_1rm,
          p_dip: newPBs.dip_1rm,
          p_squat: newPBs.squat_1rm,
          p_muscleup: newPBs.muscleup_1rm,
          p_force: force
        });

        if (rpcErr) throw rpcErr;

        PowerService.invalidateCache();

        const isNewPBResult = Array.isArray(rpcData) && rpcData.length > 0 ? !!rpcData[0].is_new_pb : false;
        const isPromotion = Array.isArray(rpcData) && rpcData.length > 0 ? !!rpcData[0].is_promotion : false;

        return { isNewPB: isNewPBResult, isPromotion };
      }

      return { isNewPB: false, isPromotion: false };
    } catch (err) {
      console.error('Exception saving Power PB:', err);
      return { isNewPB: false, isPromotion: false };
    }
  }
};
