import React from 'react';
import { PhotoActionCard } from './PhotoActionCard';
import { t } from '../../i18n';
import { useTheme } from '../../contexts/ThemeContext';

const COVER_DARK = require('../../../assets/Milestone Cards/random/handstand.jpg');
const COVER_LIGHT = require('../../../assets/workouts/profile-program-light.png');

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
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const COVER = isLight ? COVER_LIGHT : COVER_DARK;
  // The light cover is a bright daytime shot; dim it a bit more than the default 0.7.
  const photoOpacity = isLight ? 0.6 : undefined;
  // While the lookup runs: the card's frame at its final height, no text —
  // so nothing below it jumps and no wrong CTA flashes.
  if (loading) {
    return <PhotoActionCard photo={COVER} photoOpacity={photoOpacity} eyebrow="" title="" cta="" onPress={() => {}} loading />;
  }
  return hasActiveProgram ? (
    <PhotoActionCard
      photo={COVER} photoOpacity={photoOpacity}
     
      eyebrow={t('profile.activeUpNext')}
      title={(nextUpDayName || t('profile.weekComplete')).toUpperCase()}
      cta={t('profile.continueProgram')}
      onPress={onContinue}
    />
  ) : (
    <PhotoActionCard
      photo={COVER} photoOpacity={photoOpacity}
     
      eyebrow={t('profile.noActiveProgram')}
      title={t('profile.startTraining')}
      cta={t('profile.createFirst')}
      onPress={onCreateProgram}
    />
  );
}
