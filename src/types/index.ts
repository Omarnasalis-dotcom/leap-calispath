export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  strength_tier: number;
  power_tier: number | null;
  statics_tier: number | null;
  glory_score: number;
  streak: number;
  last_active: string;
  assessed_at: string | null;
  assessment_locked_until: string | null;
  power_assessed_at: string | null;
  statics_assessed_at: string | null;
  best_times: Record<string, number>;
  power_pbs: Record<string, number>;
  power_points: number;
  trials_attempted: number;
  trials_passed: number;
  is_public: boolean;
  push_token: string | null;
  timezone: string;
  updated_at: string;
}

export type TierRank = 
  | 'Iron-Bound'   // Tier 1
  | 'Steel-Wrought' // Tier 2
  | 'Bronze-Clad'   // Tier 3
  | 'Silver-Will'   // Tier 4
  | 'Gold-Soul'     // Tier 5
  | 'Platinum-Heart' // Tier 6
  | 'Obsidian-Core'  // Tier 7
  | 'Eternity'       // Tier 8

export const TIER_NAMES = [
  'Iron-Bound',
  'Steel-Wrought', 
  'Bronze-Clad',
  'Silver-Will',
  'Gold-Soul',
  'Platinum-Heart',
  'Obsidian-Core',
  'Eternity'
];

export interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
