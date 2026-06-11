import { supabase } from '../lib/supabase';

export interface GlobalWellRoundedEntry {
  rank: number;
  user_id: string;
  display_name: string;
  static_pts: number;
  power_pts: number;
  endurance_pts: number;
  total_score: number;
  is_current_user?: boolean;
  country?: string;
  gender?: string;
}

export class LeaderboardService {
  static async getGlobalWellRoundedLeaderboard(currentUserId?: string): Promise<GlobalWellRoundedEntry[]> {
    try {
      const { data, error } = await supabase.rpc('get_global_well_rounded_leaderboard');
      if (error) {
        console.error('Error fetching global WRA leaderboard:', error);
        return [];
      }
      let entries = (Array.isArray(data) ? data : []).map((e: any) => ({
        rank: Number(e.rank),
        user_id: e.user_id,
        display_name: e.display_name || 'Warrior',
        static_pts: Number(e.static_pts),
        power_pts: Number(e.power_pts),
        endurance_pts: Number(e.endurance_pts),
        total_score: Number(e.total_score),
        is_current_user: e.user_id === currentUserId,
        country: e.country,
        gender: e.gender
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
    } catch (err) {
      console.error('Exception fetching global WRA leaderboard:', err);
      return [];
    }
  }

  static async getGlobalGloryLeaderboard(currentUserId?: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, glory_score, country, gender')
        .gt('glory_score', 0)
        .order('glory_score', { ascending: false })
        .limit(100);
      if (error) {
        console.error('Error fetching global glory leaderboard:', error);
        return [];
      }
      return (Array.isArray(data) ? data : []).map((e: any, i: number) => ({
        rank: i + 1,
        user_id: e.id,
        display_name: e.display_name || 'Warrior',
        total_score: e.glory_score,
        is_current_user: e.id === currentUserId,
        country: e.country,
        gender: e.gender
      }));
    } catch (err) {
      console.error('Exception fetching global glory leaderboard:', err);
      return [];
    }
  }
}
