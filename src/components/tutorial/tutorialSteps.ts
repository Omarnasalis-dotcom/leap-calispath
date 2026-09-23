import { TutorialStep } from '../../types/tutorial';

export const TUTORIAL_STEPS: TutorialStep[] = [
  // Steps 7-9 (Training Center button -> Program Templates -> back) removed
  // with that Profile button; a TRAIN-tab step replaces them in a follow-up.
  { id: 0, targetId: 'profile.levelCircle', mode: 'decoy', tag: 'STEP 1 OF 19', caption: 'YOUR PROFILE SHOWS YOUR CURRENT LEVEL' },
  { id: 1, targetId: 'bottomTab.strength', mode: 'real', tag: 'STEP 2 OF 19', caption: 'TAP STRENGTH TO ENTER STRENGTH WORLD' },
  { id: 2, targetId: 'strength.tierChips', mode: 'real', tag: 'STEP 3 OF 19', caption: 'BROWSE TIERS — TAP ONE TO SELECT IT' },
  { id: 3, targetId: 'strength.trialButton', mode: 'decoy', tag: 'STEP 4 OF 19', caption: 'START A TRIAL TO RANK UP THIS TIER' },
  { id: 4, targetId: 'strength.leaderboardFirstRow', mode: 'decoy', tag: 'STEP 5 OF 19', caption: 'SEE HOW YOU RANK AGAINST OTHER WARRIORS' },
  { id: 5, targetId: 'bottomTab.profile', mode: 'real', tag: 'STEP 6 OF 19', caption: 'TAP PROFILE TO HEAD BACK' },
  { id: 6, targetId: 'community.createButton', mode: 'decoy', tag: 'STEP 7 OF 19', caption: 'START YOUR OWN COMMUNITY OF WARRIORS' },
  { id: 7, targetId: 'community.joinButton', mode: 'decoy', tag: 'STEP 8 OF 19', caption: 'OR JOIN ONE WITH AN INVITE CODE' },
  { id: 8, targetId: 'profile.wraScoreBar', mode: 'real', tag: 'STEP 9 OF 19', caption: 'TAP TO SEE THE WELL-ROUNDED LEADERBOARD' },
  { id: 9, targetId: 'wra.topEntries', mode: 'decoy', tag: 'STEP 10 OF 19', caption: 'THE TOP WARRIORS ACROSS ALL THREE WORLDS' },
  { id: 10, targetId: 'wra.closeButton', mode: 'real', tag: 'STEP 11 OF 19', caption: 'TAP TO CLOSE THE LEADERBOARD' },
  { id: 11, targetId: 'bottomTab.1mm', mode: 'real', tag: 'STEP 12 OF 19', caption: 'TAP 1MM TO ENTER 1-MINUTE MAX' },
  { id: 12, targetId: 'onemm.timerBadge', mode: 'real', tag: 'STEP 13 OF 19', caption: 'TAP A MOVEMENT TO START A TIMED TEST' },
  { id: 13, targetId: 'onemm.startSprintButton', mode: 'decoy', tag: 'STEP 14 OF 19', caption: 'START SPRINT BEGINS YOUR 60-SECOND TEST' },
  { id: 14, targetId: 'onemm.timerCloseButton', mode: 'real', tag: 'STEP 15 OF 19', caption: 'TAP TO CLOSE THIS TEST' },
  { id: 15, targetId: 'bottomTab.journey', mode: 'decoy', tag: 'STEP 16 OF 19', caption: 'JOURNEY TRACKS YOUR DAILY PROGRESS, STREAKS AND WEEKLY TRIALS' },
  { id: 16, targetId: 'bottomTab.static', mode: 'decoy', tag: 'STEP 17 OF 19', caption: 'COLLECT POINTS FROM HOLDS IN STATIC WORLD — UNLOCKS AT TIER 1' },
  { id: 17, targetId: 'bottomTab.power', mode: 'decoy', tag: 'STEP 18 OF 19', caption: 'COLLECT POINTS FROM POWER WORLD — UNLOCKS AT TIER 6' },
  { id: 18, targetId: 'bottomTab.profile', mode: 'real', tag: 'STEP 19 OF 19', caption: 'TAP PROFILE TO FINISH THE TOUR' },
];
