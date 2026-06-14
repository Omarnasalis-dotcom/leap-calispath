import { supabase } from '../lib/supabase';
import { 
  StaticMovement, 
  calculatePoints, 
  getLevelMovements 
} from '../lib/staticLogic';

export interface StaticLeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  best_time_seconds: number;
  points: number;
  is_current_user?: boolean;
}

export interface StaticLevelLeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
  movement_times: Record<string, number>;
  is_current_user?: boolean;
}

export interface StaticWellRoundedEntry {
  rank: number;
  user_id: string;
  display_name: string;
  handstand_points: number;
  front_lever_points: number;
  back_lever_points: number;
  planche_points: number;
  handstand_time: number;
  front_lever_time: number;
  back_lever_time: number;
  planche_time: number;
  total_points: number;
  is_current_user?: boolean;
}

export class StaticService {
  /**
   * Logs a static hold for a user
   */
  static async saveHold(userId: string, movementId: string, seconds: number): Promise<boolean> {
    if (seconds <= 0) return false;

    const { data, error } = await supabase.rpc('submit_static_hold', {
      p_movement_id: movementId,
      p_hold_seconds: seconds
    });

    if (error) {
      console.error('Error saving static hold:', error);
      throw error;
    }

    const isNewPB = Array.isArray(data) && data.length > 0 ? !!data[0].is_new_pb : false;
    return isNewPB;
  }

  /**
   * Fetches the leaderboard for a specific movement
   */
  static async getMovementLeaderboard(movementId: string, currentUserId?: string): Promise<{
    entries: StaticLeaderboardEntry[];
    personalBest: StaticLeaderboardEntry | null;
  }> {
    const { data, error } = await supabase.rpc('get_static_movement_leaderboard', {
      m_id: movementId
    });

    if (error) {
      console.error('Error fetching movement leaderboard:', error);
      return { entries: [], personalBest: null };
    }

    const entries: StaticLeaderboardEntry[] = (Array.isArray(data) ? data : []).map((e: any) => ({
      ...e,
      is_current_user: e.user_id === currentUserId
    }));

    const personalBest = entries.find(e => e.user_id === currentUserId) || null;

    return { entries, personalBest };
  }

  /**
   * Fetches the leaderboard for a specific level (sum of all points in level)
   */
  static async getLevelLeaderboard(level: 1 | 2 | 3, currentUserId?: string): Promise<StaticLevelLeaderboardEntry[]> {
    const movements = getLevelMovements(level).map(m => m.id);
    
    const { data, error } = await supabase.rpc('get_static_level_leaderboard', {
      l_id: level,
      m_ids: movements
    });

    if (error) {
      console.error('Error fetching level leaderboard:', error);
      return [];
    }

    return (Array.isArray(data) ? data : []).map((e: any) => ({
      ...e,
      movement_times: e.movement_times || {},
      is_current_user: e.user_id === currentUserId
    }));
  }

  /**
   * Fetches all holds for a user
   */
  static async getUserHolds(userId: string) {
    const { data, error } = await supabase
      .from('static_holds')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user holds:', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }

  /**
   * Fetches the user stats including PBs (Personal Bests)
   */
  static async getUserStats(userId: string): Promise<{ pbs: Record<string, number> }> {
    const holds = await this.getUserHolds(userId);
    const pbs: Record<string, number> = {};
    
    // Initialize with 0
    import('../lib/staticLogic').then(({ STATIC_MOVEMENTS }) => {
      STATIC_MOVEMENTS.forEach(m => pbs[m.id] = 0);
    });

    (Array.isArray(holds) ? holds : []).forEach((h: any) => {
      if (h.hold_seconds > (pbs[h.movement_id] || 0)) {
        pbs[h.movement_id] = h.hold_seconds;
      }
    });

    return { pbs };
  }

  /**
   * Fetches the "Well-Rounded Athlete" leaderboard (Peak Category Performance)
   */
  static async getWellRoundedLeaderboard(currentUserId?: string): Promise<StaticWellRoundedEntry[]> {
    const { data, error } = await supabase.rpc('get_static_well_rounded_leaderboard');
    if (error) {
      console.error('RPC Error:', error);
      throw error;
    }

    let entries = (Array.isArray(data) ? data : []).map((e: any) => ({
      rank: Number(e.rnk || 0),
      user_id: e.u_id,
      display_name: e.d_name,
      handstand_points: Number(e.hs_pts || 0),
      front_lever_points: Number(e.fl_pts || 0),
      back_lever_points: Number(e.bl_pts || 0),
      planche_points: Number(e.pl_pts || 0),
      handstand_time: Number(e.hs_time || 0),
      front_lever_time: Number(e.fl_time || 0),
      back_lever_time: Number(e.bl_time || 0),
      planche_time: Number(e.pl_time || 0),
      total_points: Number(e.t_score || 0),
      country: e.country,
      gender: e.gender,
      is_current_user: e.u_id === currentUserId
    }));

    // Fetch gender mapping manually since RPC lacks it
    const userIds = entries.map((e: any) => e.user_id).filter(Boolean);
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, gender').in('id', userIds);
      if (profiles) {
        const genderMap = new Map(profiles.map(p => [p.id, p.gender]));
        entries = entries.map((e: any) => ({
          ...e,
          gender: e.gender || genderMap.get(e.user_id)
        }));
      }
    }
    return entries;
  }
}
