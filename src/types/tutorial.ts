export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TargetId =
  | 'profile.levelCircle'
  | 'profile.workoutProgramButton'
  | 'profile.wraScoreBar'
  | 'bottomTab.bar'
  | 'bottomTab.profile'
  | 'bottomTab.strength'
  | 'bottomTab.power'
  | 'bottomTab.static'
  | 'bottomTab.1mm'
  | 'bottomTab.trainingCenter'
  | 'bottomTab.journey'
  | 'bottomTab.worlds'
  | 'worlds.1mm'
  | 'strength.trialButton'
  | 'strength.tierChips'
  | 'strength.leaderboardFirstRow'
  | 'templates.startProgram'
  | 'templates.backButton'
  | 'community.createButton'
  | 'community.joinButton'
  | 'wra.topEntries'
  | 'wra.closeButton'
  | 'power.scoreCircle'
  | 'power.movementRow'
  | 'static.scoreCircle'
  | 'static.movementRow'
  | 'onemm.scoreCircle'
  | 'onemm.movementGrid'
  | 'onemm.timerBadge'
  | 'onemm.startSprintButton'
  | 'onemm.timerCloseButton'
  | 'train.heroCard'
  | 'train.tile.templates'
  | 'train.tile.customize'
  | 'train.tile.quick'
  | 'customize.filters'
  | 'customize.layoutToggle'
  | 'customize.firstCard'
  | 'customize.quickBuild'
  | 'quick.filters'
  | 'quick.firstCard'
  | 'templates.recommended'
  | 'templates.difficultyFilter'
  | 'templates.firstRow';

// 'main' is the app-wide first-run tour (Profile -> worlds -> TRAIN ->
// Journey); the rest are short per-screen tours that auto-start the first
// time their own screen opens.
export type TourId = 'main' | 'customize' | 'quickWorkout' | 'templates';

export type TutorialStepMode = 'real' | 'decoy';

export interface TutorialStep {
  targetId: TargetId;
  mode: TutorialStepMode;
  caption: string;
  // For targets that only exist in some states (no active program, no
  // recommendations, a day without a side quest…): if the target hasn't
  // measured shortly after the step begins, the step is skipped instead of
  // pointing at nothing.
  optional?: boolean;
}
