import { User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  strength_tier: number;
  power_tier: number | null;
  statics_tier: number | null;
  gender: string | null;
  country: string | null;
  first_name: string | null;
  last_name: string | null;
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
  one_mm_points: number;
  trials_attempted: number;
  trials_passed: number;
  is_public: boolean;
  push_token: string | null;
  timezone: string;
  updated_at: string;
  is_admin?: boolean;
  is_coach?: boolean;
  coach_beta_access: boolean;
  clash_win_streak: number;
  access_expires_at?: string | null;
  access_granted_at?: string | null;
  invite_code_used?: string | null;
  entitlement_source?: string | null;
  created_at?: string;
  community_id?: string | null;
}

export type TierRank =
  | 'Helot'          // Tier 0
  | 'Neos'           // Tier 1
  | 'Ephebe'         // Tier 2
  | 'Hoplite'        // Tier 3
  | 'Spartan'        // Tier 4
  | 'Lochagos'       // Tier 5
  | 'Strategos'      // Tier 6
  | 'Olympian'       // Tier 7
  | 'Demigod'       // Tier 8
  | 'Eternity'       // Tier 9

export const TIER_NAMES = [
  'Helot',          // Tier 0
  'Neos',           // Tier 1
  'Ephebe',         // Tier 2
  'Hoplite',        // Tier 3
  'Spartan',        // Tier 4
  'Lochagos',       // Tier 5
  'Strategos',      // Tier 6
  'Olympian',       // Tier 7
  'Demigod',        // Tier 8
  'Eternity'        // Tier 9
];

// Power World tier names (different from Strength) - 9 tiers total
export const POWER_TIER_NAMES = [
  'Voltaic',  // Level 0 (unused — levels start at 1)
  'Voltaic',  // Level 1
  'Ampere',   // Level 2
  'Tesla',    // Level 3
];

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  profileLoadFailed: boolean;
  needsPasswordReset: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearPasswordReset: () => Promise<void>;
}
