import { supabase } from '../lib/supabase';
import { calculateTotalPowerScore, getPowerLevel, POWER_LEVELS } from '../lib/powerLogic';

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
    const { data: pbs, error } = await supabase
      .from('power_assessments')
      .select('*')
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
      const val = pbs?.[field] || 0;
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

    // Global Glory Rank - Direct query for reliability
    const { count: gloryCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gt('power_points', totalPoints);
    ranks['glory'] = (gloryCount || 0) + 1;

    return { pbs: pbMap, totalPoints, level, ranks };
  },

  /**
   * Fetches leaderboard for a specific movement, glory, or mastery level
   */
  async getLeaderboard(type: 'glory' | 'level_1' | 'level_2' | 'level_3' | 'pull_up' | 'dip' | 'squat' | 'muscle_up'): Promise<PowerMovementRanking[]> {
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
        .select('id, display_name, power_points')
        .eq('power_tier', levelId)
        .order('power_points', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((d, i) => ({
        user_id: d.id,
        display_name: d.display_name || 'Warrior',
        value: d.power_points,
        points: d.power_points,
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
          display_name
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
      value: d[cleanDbField],
      points: type === 'muscle_up' ? d[cleanDbField] * 2 : d[cleanDbField],
      rank: i + 1
    }));
  },

  /**
   * Saves a new PB and checks for promotion/PR
   */
  async savePB(userId: string, movementId: string, kg: number): Promise<{ isNewPB: boolean; isPromotion: boolean }> {
    const { data: current } = await supabase
      .from('power_assessments')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const field = `${movementId}_1rm`;
    const oldVal = current?.[field] || 0;
    const isNewPB = kg > oldVal;

    if (isNewPB) {
      const newPBs = {
        pullup_1rm: movementId === 'pull_up' ? kg : current?.pullup_1rm || 0,
        dip_1rm: movementId === 'dip' ? kg : current?.dip_1rm || 0,
        squat_1rm: movementId === 'squat' ? kg : current?.squat_1rm || 0,
        muscleup_1rm: movementId === 'muscle_up' ? kg : current?.muscleup_1rm || 0,
      };

      const totalScore = calculateTotalPowerScore({
        pull_up: newPBs.pullup_1rm,
        dip: newPBs.dip_1rm,
        squat: newPBs.squat_1rm,
        muscle_up: newPBs.muscleup_1rm,
      });

      const oldScore = calculateTotalPowerScore({
        pull_up: current?.pullup_1rm || 0,
        dip: current?.dip_1rm || 0,
        squat: current?.squat_1rm || 0,
        muscle_up: current?.muscleup_1rm || 0,
      });

      const oldLevel = getPowerLevel(oldScore);
      const newLevel = getPowerLevel(totalScore);
      const isPromotion = newLevel.id > oldLevel.id;

      if (current) {
        const { error: updateErr } = await supabase
          .from('power_assessments')
          .update({
            ...newPBs,
            assessed_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('power_assessments')
          .insert({
            user_id: userId,
            ...newPBs,
            assessed_at: new Date().toISOString(),
          });
        if (insertErr) throw insertErr;
      }

      // Sync power points server-side via RPC
      const { error: rpcErr } = await supabase.rpc('sync_power_points', { p_user_id: userId });
      if (rpcErr) throw rpcErr;

      return { isNewPB, isPromotion };
    }

    return { isNewPB: false, isPromotion: false };
  }
};
