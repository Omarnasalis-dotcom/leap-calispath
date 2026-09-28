import { TIER_NAMES, POWER_TIER_NAMES } from '../types';
import { t } from '../i18n';

export const TIER_HARD_FLOORS: Record<number, number> = {
  0: 25,
  1: 90,
  2: 150,
  3: 180,
  4: 200,
  5: 220,
  6: 250,
  7: 360,
  8: 480,
  9: 600, // Eternity Protocol: 12-labor trial, minimum 10 minutes
};

export const TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  0: { desc: t('tierRequirements.strength0'), difficulty: 1 },
  1: { desc: t('tierRequirements.strength1'), difficulty: 2 },
  2: { desc: t('tierRequirements.strength2'), difficulty: 3 },
  3: { desc: t('tierRequirements.strength3'), difficulty: 4 },
  4: { desc: t('tierRequirements.strength4'), difficulty: 5 },
  5: { desc: t('tierRequirements.strength5'), difficulty: 6 },
  6: { desc: t('tierRequirements.strength6'), difficulty: 7 },
  7: { desc: t('tierRequirements.strength7'), difficulty: 8 },
  8: { desc: t('tierRequirements.strength8'), difficulty: 9 },
  9: { desc: t('tierRequirements.strength9'), difficulty: 9 },
};

export const POWER_TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  1: { desc: t('tierRequirements.power1'), difficulty: 3 },
  2: { desc: t('tierRequirements.power2'), difficulty: 6 },
  3: { desc: t('tierRequirements.power3'), difficulty: 9 },
};
