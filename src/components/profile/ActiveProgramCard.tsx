import React from 'react';
import { PhotoActionCard } from './PhotoActionCard';

const COVER = require('../../../assets/Milestone Cards/random/handstand.jpg');

interface ActiveProgramCardProps {
  hasActiveProgram: boolean;
  /** Null with an active program means every day this week is logged. */
  nextUpDayName: string | null;
  onContinue: () => void;
  onCreateProgram: () => void;
}

/**
 * Profile's single training entry point (replaces the old Suggested Next /
 * Pts This Week / Active Program stat row and the Training Center button):
 * "up next" day + CONTINUE PROGRAM, or a create-your-first-program CTA.
 */
export function ActiveProgramCard({ hasActiveProgram, nextUpDayName, onContinue, onCreateProgram }: ActiveProgramCardProps) {
  return hasActiveProgram ? (
    <PhotoActionCard
      photo={COVER}
      eyebrow="ACTIVE PROGRAM · UP NEXT"
      title={(nextUpDayName || 'WEEK COMPLETE').toUpperCase()}
      cta="CONTINUE PROGRAM"
      onPress={onContinue}
    />
  ) : (
    <PhotoActionCard
      photo={COVER}
      eyebrow="NO ACTIVE PROGRAM"
      title="START YOUR TRAINING"
      cta="CREATE YOUR FIRST PROGRAM"
      onPress={onCreateProgram}
    />
  );
}
