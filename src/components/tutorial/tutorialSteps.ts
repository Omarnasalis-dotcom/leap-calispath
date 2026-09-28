import { TourId, TutorialStep } from '../../types/tutorial';
import { t } from '../../i18n';

// "STEP X OF Y" is derived from each step's position (see TutorialOverlay),
// so steps can be added/removed here without renumbering anything.
const MAIN_TOUR: TutorialStep[] = [
  { targetId: 'profile.levelCircle', mode: 'decoy', caption: t('tour.step1') },
  { targetId: 'bottomTab.strength', mode: 'real', caption: t('tour.step2') },
  { targetId: 'strength.tierChips', mode: 'decoy', caption: t('tour.step3') },
  { targetId: 'strength.trialButton', mode: 'decoy', caption: t('tour.step4'), optional: true },
  { targetId: 'strength.leaderboardFirstRow', mode: 'decoy', caption: t('tour.step5'), optional: true },
  { targetId: 'bottomTab.profile', mode: 'real', caption: t('tour.step6') },
  { targetId: 'community.createButton', mode: 'decoy', caption: t('tour.step7'), optional: true },
  { targetId: 'community.joinButton', mode: 'decoy', caption: t('tour.step8'), optional: true },
  { targetId: 'profile.wraScoreBar', mode: 'real', caption: t('tour.step9') },
  { targetId: 'wra.topEntries', mode: 'decoy', caption: t('tour.step10') },
  { targetId: 'wra.closeButton', mode: 'real', caption: t('tour.step11') },
  // Power/Static/1MM live inside the WORLDS fan-out, so reaching 1MM is
  // two real taps: open the fan-out, then pick the 1MM circle.
  { targetId: 'bottomTab.worlds', mode: 'real', caption: t('tour.step12') },
  { targetId: 'worlds.1mm', mode: 'real', caption: t('tour.step13') },
  { targetId: 'onemm.timerBadge', mode: 'real', caption: t('tour.step14') },
  { targetId: 'onemm.startSprintButton', mode: 'decoy', caption: t('tour.step15') },
  { targetId: 'onemm.timerCloseButton', mode: 'real', caption: t('tour.step16') },
  { targetId: 'bottomTab.worlds', mode: 'decoy', caption: t('tour.step17') },
  { targetId: 'bottomTab.trainingCenter', mode: 'real', caption: t('tour.step18') },
  { targetId: 'train.heroCard', mode: 'decoy', caption: t('tour.step19') },
  { targetId: 'train.tile.templates', mode: 'decoy', caption: t('tour.step20') },
  { targetId: 'train.tile.customize', mode: 'decoy', caption: t('tour.step21') },
  { targetId: 'train.tile.quick', mode: 'decoy', caption: t('tour.step22') },
  { targetId: 'bottomTab.journey', mode: 'decoy', caption: t('tour.step23') },
  { targetId: 'bottomTab.profile', mode: 'real', caption: t('tour.step24') },
];

const CUSTOMIZE_TOUR: TutorialStep[] = [
  { targetId: 'customize.filters', mode: 'decoy', caption: t('tour.step25') },
  { targetId: 'customize.layoutToggle', mode: 'decoy', caption: t('tour.step26') },
  { targetId: 'customize.firstCard', mode: 'decoy', caption: t('tour.step27'), optional: true },
  { targetId: 'customize.quickBuild', mode: 'decoy', caption: t('tour.step28'), optional: true },
];

const QUICK_WORKOUT_TOUR: TutorialStep[] = [
  { targetId: 'quick.filters', mode: 'decoy', caption: t('tour.step29') },
  { targetId: 'quick.firstCard', mode: 'decoy', caption: t('tour.step30'), optional: true },
];

const TEMPLATES_TOUR: TutorialStep[] = [
  { targetId: 'templates.recommended', mode: 'decoy', caption: t('tour.step31'), optional: true },
  { targetId: 'templates.difficultyFilter', mode: 'decoy', caption: t('tour.step32') },
  { targetId: 'templates.firstRow', mode: 'decoy', caption: t('tour.step33'), optional: true },
];

export const TOURS: Record<TourId, TutorialStep[]> = {
  main: MAIN_TOUR,
  customize: CUSTOMIZE_TOUR,
  quickWorkout: QUICK_WORKOUT_TOUR,
  templates: TEMPLATES_TOUR,
};
