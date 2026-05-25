import { supabase } from '../lib/supabase';
import { Profile } from '../types';

export interface ClashSession {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'active' | 'finished' | 'cancelled';
  bracket: 'developing' | 'elite';
  workout_protocol: {
    movements: Array<{
      id: string;
      name: string;
      reps: number;
    }>;
  };
  start_time: string | null;
  winner_id: string | null;
  sender_finish_time: number | null;
  receiver_finish_time: number | null;
  sender_display_name?: string;
  receiver_display_name?: string;
}

export class ClashService {
  /**
   * Toggle searching status
   */
  static async toggleSearchingStatus(userId: string, isSearching: boolean): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_searching_clash: isSearching })
      .eq('id', userId);
    
    if (error) {
      console.error('Toggle status error:', error);
      throw new Error('Failed to update clash search status. Please try again.');
    }
  }

  /**
   * Get all warriors currently in the lobby
   */
  static async getAvailableWarriors(currentUserId: string): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_searching_clash', true)
      .neq('id', currentUserId)
      .order('last_active', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Search for warriors by display name (Optional legacy support)
   */
  static async searchWarriors(query: string, currentUserId: string): Promise<Profile[]> {
    if (query.length < 2) return [];

    console.log('SEARCHING_WARRIOR:', { query, currentUserId });

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUserId)
      .ilike('display_name', `%${query}%`)
      .order('display_name', { ascending: true })
      .limit(10);

    if (error) {
      console.error('SEARCH_ERROR:', error);
      throw error;
    }
    
    console.log('SEARCH_RESULTS:', data?.length || 0);
    return data || [];
  }

  /**
   * Send a clash challenge
   */
  static async sendChallenge(receiverDisplayName: string): Promise<string> {
    const { data, error } = await supabase.rpc('send_clash_challenge', {
      receiver_display_name: receiverDisplayName
    });

    if (error) throw error;
    return data;
  }

  /**
   * Respond to a challenge (accept/decline)
   */
  static async respondToChallenge(clashId: string, status: 'accepted' | 'declined'): Promise<void> {
    const { error } = await supabase
      .from('clash_sessions')
      .update({ status })
      .eq('id', clashId);

    if (error) throw error;
  }

  /**
   * Start the battle (triggered by sender after acceptance)
   */
  static async startBattle(clashId: string, protocol: any): Promise<void> {
    const { error } = await supabase
      .from('clash_sessions')
      .update({ 
        status: 'active',
        start_time: new Date().toISOString(),
        workout_protocol: protocol
      })
      .eq('id', clashId);

    if (error) throw error;
  }

  /**
   * Report finish time — atomic via database RPC to prevent race conditions
   */
  static async reportFinish(
    sessionId: string,
    userId: string,
    timeSeconds: number,
    isSender: boolean
  ): Promise<{ success: boolean; winnerId?: string; bothFinished?: boolean }> {
    try {
      const { data, error } = await supabase.rpc('finish_clash_session', {
        p_session_id: sessionId,
        p_user_id: userId,
        p_time_seconds: timeSeconds,
        p_is_sender: isSender,
      });

      if (error) {
        console.error('Error finishing clash session:', error);
        return { success: false, error: 'Failed to save clash result. Please check your connection.' };
      }

      return {
        success: data.success,
        winnerId: data.winner_id,
        bothFinished: data.both_finished,
      };
    } catch (error) {
      console.error('Error finishing clash session:', error);
      return { success: false };
    }
  }

  /**
   * Subscribe to incoming challenges
   */
  static subscribeToIncomingChallenges(userId: string, callback: (payload: any) => void) {
    return supabase
      .channel('clash_invites')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'clash_sessions',
          filter: `receiver_id=eq.${userId}`
        },
        callback
      )
      .subscribe();
  }

  /**
   * Subscribe to active battle updates
   */
  static subscribeToBattle(clashId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`battle_${clashId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clash_sessions',
          filter: `id=eq.${clashId}`
        },
        callback
      )
      .subscribe();
  }

  static async updateWinStreak(userId: string, isWin: boolean): Promise<number> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('clash_win_streak')
      .eq('id', userId)
      .single();

    const currentStreak = profile?.clash_win_streak || 0;
    const newStreak = isWin ? currentStreak + 1 : 0;

    await supabase
      .from('profiles')
      .update({ clash_win_streak: newStreak })
      .eq('id', userId);

    return newStreak;
  }
}
