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
  'Squat Jumps': 4,
  'Hanging Knee Raises': 4,
  'Box Jumps': 4,
  'Inverted Rows': 4,
  'Burpees': 5,
  'Push-ups': 5,
  'Straight Bar Dip': 5,
  'Banded Pull-ups': 5,
  'Jump Muscle-ups': 5,
  'Toes to Bar': 5,
  'Deadlift': 5,
  'Pike Push-ups': 5,
  'Lunge': 6,
  'Lunges': 6,
  'Dips': 7,
  'Pull-ups': 10,
  'Pistol Squats': 10,
  'Handstand Push-ups': 10,
  'Muscle-ups': 15,
  '1PU + 1MU + 1SBD (UNBROKEN)': 30,
  '5MU + 5PU (UNBROKEN)': 80,
  '5PU + 5MU (UNBROKEN)': 110,
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
  // Use UTC to match Supabase's UTC-stored week_start dates and ChallengeService.
  const day = now.getUTCDay(); // 0 (Sun) to 6 (Sat)
  const daysBack = (day + 1) % 7;
  const saturday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysBack
  ));
  const year = saturday.getUTCFullYear();
  const month = String(saturday.getUTCMonth() + 1).padStart(2, '0');
  const date = String(saturday.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

// Data-fetching functions removed — all challenge operations go through
// ChallengeService (src/services/ChallengeService.ts) which is the single
// authoritative API. Only pure data constants and helpers remain here.
