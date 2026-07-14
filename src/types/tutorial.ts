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
  | 'onemm.timerCloseButton';

export type TutorialStepMode = 'real' | 'decoy';

export interface TutorialStep {
  id: number;
  targetId: TargetId;
  mode: TutorialStepMode;
  tag: string;
  caption: string;
}
