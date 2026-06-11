import { supabase } from './supabase';

export interface ChallengeMovement {
  name: string;
  reps: number;
  points: number;
}

export interface WeeklyChallenge {
  id: string;
  week_start: string;
  group_id: 1 | 2 | 3;
  title: string;
  description: string;
  scoring_type: 'time' | 'reps';
  movements: ChallengeMovement[];
  time_limit?: number; // in minutes, for reps-based challenges
  is_active: boolean;
}

export interface WeeklyEntry {
  id: string;
  challenge_id: string;
  user_id: string;
  display_name: string;
  score: number;
  rank: number;
  is_current_user: boolean;
}

export const MOVEMENT_POINTS: Record<string, number> = {
  'Knee Push-ups': 1,
  'Bench Dips': 1,
  'Squat': 4,
  'Squats': 4,
  'Lunge': 6,
  'Lunges': 6,
  'Burpees': 5,
  'Push-ups': 5,
  'Straight Bar Dip': 5,
  'Banded Pull-ups': 5,
  'Dips': 7,
  'Pull-ups': 10,
  'Muscle-ups': 15,
};

export const GROUP_NAMES = {
  1: { name: 'RECRUITS', tiers: '0-2', color: '#CD7F32' },
  2: { name: 'WARRIORS', tiers: '3-5', color: '#C0C0C0' },
  3: { name: 'LEGENDS', tiers: '6-8', color: '#FFD700' },
};

export function getUserGroup(strengthTier: number): 1 | 2 | 3 {
  if (strengthTier <= 2) return 1;
  if (strengthTier <= 5) return 2;
  return 3;
}

export function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0 (Sun) to 6 (Sat)
  const daysBack = (day + 1) % 7;
  
  const saturday = new Date(now);
  saturday.setDate(now.getDate() - daysBack);
  
  // Use local date components to avoid timezone shifts
  const year = saturday.getFullYear();
  const month = String(saturday.getMonth() + 1).padStart(2, '0');
  const date = String(saturday.getDate()).padStart(2, '0');
  
  const result = `${year}-${month}-${date}`;
  if (__DEV__) console.log('getCurrentWeekStart (Local Saturday):', { now, day, daysBack, saturday, result });
  return result;
}

export async function getActiveChallenge(groupId: 1 | 2 | 3): Promise<WeeklyChallenge | null> {
  const weekStart = getCurrentWeekStart();
  if (__DEV__) console.log('getActiveChallenge:', { groupId, weekStart });
  const { data, error } = await supabase
    .from('weekly_challenges')
    .select('*')
    .eq('group_id', groupId)
    .eq('week_start', weekStart)
    .eq('is_active', true)
    .limit(1); // limit(1) is safe even if duplicates exist
  if (error) {
    console.error('getActiveChallenge error:', error);
    return null;
  }
  return data?.[0] ?? null;
}

export async function getChallengeLeaderboard(
  challengeId: string,
  currentUserId: string,
  scoringType: 'time' | 'reps'
): Promise<WeeklyEntry[]> {
  if (__DEV__) console.log('Fetching leaderboard for challenge:', challengeId, 'user:', currentUserId);
  const { data, error } = await supabase
    .from('weekly_entries')
    .select(`
      id,
      challenge_id,
      user_id,
      score,
      profiles!user_id (display_name)
    `)
    .eq('challenge_id', challengeId)
    .order('score', { ascending: scoringType === 'time' })
    .order('submitted_at', { ascending: true });

  if (error) {
    console.error('Leaderboard fetch error:', error);
    return [];
  }
  
  if (__DEV__) console.log('Raw leaderboard data count:', data?.length);

  return (data || []).map((entry: any, index: number) => ({
    id: entry.id,
    challenge_id: entry.challenge_id,
    user_id: entry.user_id,
    score: Number(entry.score),
    display_name: entry.profiles?.display_name || 'Unknown',
    rank: index + 1,
    is_current_user: entry.user_id === currentUserId
  }));
}

export async function submitChallengeScore(
  challengeId: string,
  userId: string,
  score: number,
  scoringType: 'time' | 'reps',
  metadata: any = {}
): Promise<boolean> {
  if (__DEV__) console.log('submitChallengeScore starting', { challengeId, userId, score, scoringType });
  
  const { data: existing, error: existingError } = await supabase
    .from('weekly_entries')
    .select('score')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) {
    console.error('Check existing entry error:', existingError);
  }

  if (existing) {
    const existingScore = Number(existing.score);
    const newScore = Number(score);
    
    // Safety check: if existing is 0 (due to bug) and we are in time mode, allow overwrite.
    const isBetter = scoringType === 'time' 
      ? (existingScore === 0 || newScore < existingScore)
      : newScore > existingScore;
    
    if (__DEV__) console.log('Score comparison:', { existingScore, newScore, isBetter });
    
    if (!isBetter) {
      if (__DEV__) console.log('Score not improved. Returning false.');
      return false;
    }
    
    const { error: updateError } = await supabase
      .from('weekly_entries')
      .update({ score: newScore, metadata, submitted_at: new Date().toISOString() })
      .eq('challenge_id', challengeId)
      .eq('user_id', userId);
      
    if (updateError) {
      console.error('Update error:', updateError);
      return false;
    }
    if (__DEV__) console.log('Update successful!');
  } else {
    if (__DEV__) console.log('No existing score. Inserting new entry...');
    const { error: insertError } = await supabase
      .from('weekly_entries')
      .insert({ challenge_id: challengeId, user_id: userId, score: Number(score), metadata });
      
    if (insertError) {
      console.error('Insert error:', insertError);
      return false;
    }
    if (__DEV__) console.log('Insert successful!');
  }
  return true;
}

export async function getAllActiveChallengesForWeek(): Promise<WeeklyChallenge[]> {
  const weekStart = getCurrentWeekStart();
  const { data, error } = await supabase
    .from('weekly_challenges')
    .select('*')
    .eq('week_start', weekStart)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching all challenges:', error);
    return [];
  }
  return data || [];
}

export async function createChallenge(
  challenge: Omit<WeeklyChallenge, 'id' | 'is_active'>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('weekly_challenges')
    .insert({ ...challenge, is_active: true });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteChallenge(challengeId: string): Promise<{ success: boolean; error?: string }> {
  // Database has cascade delete on foreign key, so entries will be deleted automatically
  const { error } = await supabase
    .from('weekly_challenges')
    .delete()
    .eq('id', challengeId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getUserBadges(
  userId: string
): Promise<{ champion: number; top3: number; competitor: number }> {
  const { data } = await supabase
    .from('weekly_entries')
    .select('challenge_id, score')
    .eq('user_id', userId);
  if (!data) return { champion: 0, top3: 0, competitor: 0 };
  return {
    champion: 0,
    top3: 0,
    competitor: data.length,
  };
}
