import { supabase } from '../lib/supabase';

export interface ArenaStep {
  id: string;
  movement_name: string;
  reps: number;
  added_weight_kg: number;
  is_unbroken: boolean;
  order_index: number;
}

export interface ArenaProResult {
  athlete_name: string;
  time_seconds: number;
}

export interface ArenaPhase {
  id: string;
  name: string;
  order_index: number;
  pro_benchmark_time: number;
  steps: ArenaStep[];
}

export const ArenaService = {
  /**
   * Returns the hardcoded competition data with all athlete benchmarks
   */
  async getStrengthArenaPhases(): Promise<ArenaPhase[]> {
    const PHASE_IDS = {
      q: 'phase-q',
      s: 'phase-s',
      f: 'phase-f'
    };

    return [
      {
        id: PHASE_IDS.q,
        name: 'QUARTER FINALS',
        order_index: 1,
        pro_benchmark_time: 309, // Jamie's 5:09
        steps: [
          { id: 'q1', movement_name: 'Squats', reps: 50, added_weight_kg: 10, is_unbroken: false, order_index: 0 },
          { id: 'q2', movement_name: 'Unbroken: 10 Pull-ups + 1 Muscle-up', reps: 1, added_weight_kg: 0, is_unbroken: true, order_index: 1 },
          { id: 'q3', movement_name: 'Push-ups (Parallettes)', reps: 30, added_weight_kg: 10, is_unbroken: false, order_index: 2 },
          { id: 'q4', movement_name: 'Unbroken: 15 Pull-ups + 1 Muscle-up', reps: 1, added_weight_kg: 0, is_unbroken: true, order_index: 3 },
          { id: 'q5', movement_name: 'Dips', reps: 30, added_weight_kg: 10, is_unbroken: false, order_index: 4 },
          { id: 'q6', movement_name: 'Unbroken: 20 Pull-ups + 1 Muscle-up', reps: 1, added_weight_kg: 0, is_unbroken: true, order_index: 5 },
          { id: 'q7', movement_name: 'Squats', reps: 50, added_weight_kg: 10, is_unbroken: false, order_index: 6 },
        ]
      },
      {
        id: PHASE_IDS.s,
        name: 'SEMI-FINALS',
        order_index: 2,
        pro_benchmark_time: 518, // Sergio's 8:38
        steps: [
          { id: 's1', movement_name: '(1 PU + 1 MU) x 10 + 50 Push-ups', reps: 1, added_weight_kg: 0, is_unbroken: false, order_index: 0 },
          { id: 's2', movement_name: '(1 PU + 1 MU) x 8 + 40 Goblet Squats', reps: 1, added_weight_kg: 36, is_unbroken: false, order_index: 1 },
          { id: 's3', movement_name: '(1 PU + 1 MU) x 6 + 30 Dips', reps: 1, added_weight_kg: 0, is_unbroken: false, order_index: 2 },
          { id: 's4', movement_name: '(1 PU + 1 MU) x 6 + 20 Goblet Squats', reps: 1, added_weight_kg: 0, is_unbroken: false, order_index: 3 },
          { id: 's5', movement_name: '(1 PU + 1 MU) x 2 + 20 Pull-ups + 40 Push-ups', reps: 1, added_weight_kg: 0, is_unbroken: false, order_index: 4 },
        ]
      },
      {
        id: PHASE_IDS.f,
        name: 'THE FINAL (GAUNTLET)',
        order_index: 3,
        pro_benchmark_time: 735, // Sergio's 12:15
        steps: [
          { id: 'f1', movement_name: 'Squats (+20kg) MU (+10kg) 10 MU (+5kg) 15 MU (BW)', reps: 1, added_weight_kg: 20, is_unbroken: false, order_index: 0 },
          { id: 'f2', movement_name: 'Dips Ladder: 15(+20kg) 20(+10kg) 25(BW)', reps: 1, added_weight_kg: 20, is_unbroken: false, order_index: 1 },
          { id: 'f3', movement_name: 'Pull-up Ladder: 10(+20kg) 15(+10kg) 20(BW)', reps: 1, added_weight_kg: 20, is_unbroken: false, order_index: 2 },
          { id: 'f4', movement_name: 'Push-ups', reps: 60, added_weight_kg: 0, is_unbroken: false, order_index: 3 },
          { id: 'f5', movement_name: 'Muscle-ups', reps: 5, added_weight_kg: 0, is_unbroken: false, order_index: 4 },
        ]
      }
    ];
  },

  /**
   * Fetches unified rankings (Pros + User) from the SQL engine
   */
  async getUnifiedRankings(phase_id: string, user_id: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_arena_worldwide_rankings', {
      p_phase_id: phase_id,
      p_user_id: user_id
    });

    if (error) {
      console.error('ARENA RPC ERROR:', error.message);
      return [];
    }

    return data || [];
  },

  /**
   * Saves a user's arena attempt to the database
   */
  async saveAttempt(userId: string, phaseId: string, timeSeconds: number): Promise<void> {
    const { error } = await supabase
      .from('arena_attempts')
      .insert({
        user_id: userId,
        phase_id: phaseId,
        time_in_seconds: timeSeconds // Matching the new column name
      });
    
    if (error) throw error;
  }
};
