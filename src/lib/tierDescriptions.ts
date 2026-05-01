export interface TierDescription {
  name: string;
  subtitle: string;
  description: string;
}

export const TIER_DESCRIPTIONS: Record<number, TierDescription> = {
  0: {
    name: 'Helot',
    subtitle: 'The Awakening',
    description: 'True Beginner. Focuses on awakening dormant muscle groups using basic regressions with minimal resistance.'
  },
  1: {
    name: 'Neos',
    subtitle: 'The Foundation',
    description: 'Active Beginner. Focused on building muscular endurance and consistency through higher volume in basic regression movements.'
  },
  2: {
    name: 'Ephebe',
    subtitle: 'The Transition',
    description: 'Rising Recruit. The first introduction to the pull-up bar (assisted) and explosive jumping mechanics.'
  },
  3: {
    name: 'Hoplite',
    subtitle: 'The Soldier',
    description: 'Early Intermediate. Mastering the standard push-up and dip while closing the gap toward unassisted pull-ups.'
  },
  4: {
    name: 'Spartan',
    subtitle: 'The Warrior',
    description: 'Intermediate. The entry point for strict, unassisted mastery and the introduction of banded muscle-up technique.'
  },
  5: {
    name: 'Lochagos',
    subtitle: 'The Commander',
    description: 'Advanced. Requires high-volume strict pull-ups and dips, demonstrating significant control over body weight.'
  },
  6: {
    name: 'Strategos',
    subtitle: 'The Master',
    description: 'Elite. The "Gatekeeper" rank. Requires the first strict muscle-up and unlocks the Power and Static expansion worlds.'
  },
  7: {
    name: 'Olympian',
    subtitle: 'The Legend',
    description: 'Mastery. Characterized by extreme endurance in strict movements and multiple consecutive strict muscle-ups.'
  },
  8: {
    name: 'Demigod',
    subtitle: 'Peak Performance',
    description: 'Godlike. The pinnacle of bodyweight strength, often requiring weighted resistance to satisfy trial conditions.'
  }
};
