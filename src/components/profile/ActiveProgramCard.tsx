import React from 'react';
import { PhotoActionCard } from './PhotoActionCard';
import { t } from '../../i18n';

const COVER = require('../../../assets/Milestone Cards/random/handstand.jpg');

interface ActiveProgramCardProps {
  hasActiveProgram: boolean;
  /** Null with an active program means every day this week is logged. */
  nextUpDayName: string | null;
  onContinue: () => void;
  onCreateProgram: () => void;
  /** Lookup still running (first load this session). */
  loading?: boolean;
}

/**
 * Profile's single training entry point (replaces the old Suggested Next /
 * Pts This Week / Active Program stat row and the Training Center button):
 * "up next" day + CONTINUE PROGRAM, or a create-your-first-program CTA.
 */
export function ActiveProgramCard({ hasActiveProgram, nextUpDayName, onContinue, onCreateProgram, loading }: ActiveProgramCardProps) {
  // While the lookup runs: the card's frame at its final height, no text —
  // so nothing below it jumps and no wrong CTA flashes.
  if (loading) {
    return <PhotoActionCard photo={COVER} eyebrow="" title="" cta="" onPress={() => {}} loading />;
  }
  return hasActiveProgram ? (
    <PhotoActionCard
      photo={COVER}
      eyebrow={t('profile.activeUpNext')}
      title={(nextUpDayName || t('profile.weekComplete')).toUpperCase()}
      cta={t('profile.continueProgram')}
      onPress={onContinue}
    />
  ) : (
    <PhotoActionCard
      photo={COVER}
      eyebrow={t('profile.noActiveProgram')}
      title={t('profile.startTraining')}
      cta={t('profile.createFirst')}
      onPress={onCreateProgram}
    />
  );
}
