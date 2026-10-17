import type { Profile } from '../types';

type SetupFields = Pick<Profile, 'goals' | 'primary_goal' | 'goal_other_text' | 'training_days_per_week' | 'available_equipment'>;

export function hasCoachGoal(profile: Partial<SetupFields> | null | undefined): boolean {
  if (!profile) return false;
  if (profile.goals && profile.goals.length) {
    // 'other' alone only counts once the athlete has described it.
    return !(profile.goals.length === 1 && profile.goals[0] === 'other' && !profile.goal_other_text?.trim());
  }
  return !!profile.primary_goal;
}

// Screen 1 of the AI Coach setup: goal + training days per week.
export function hasCoachGoalAndDays(profile: Partial<SetupFields> | null | undefined): boolean {
  return hasCoachGoal(profile) && !!profile?.training_days_per_week;
}

// Screen 2: equipment. null means never answered; an empty array is a real
// answer ("No equipment").
export function hasCoachEquipment(profile: Partial<SetupFields> | null | undefined): boolean {
  return Array.isArray(profile?.available_equipment);
}

// Nobody reaches the AI Coach chat (or its free-tier paywall card) until
// both setup screens are answered. CoachScreen gates on this.
export function needsCoachSetup(profile: Partial<SetupFields> | null | undefined): boolean {
  return !hasCoachGoalAndDays(profile) || !hasCoachEquipment(profile);
}
