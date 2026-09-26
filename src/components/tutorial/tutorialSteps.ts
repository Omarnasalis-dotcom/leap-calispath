import { TourId, TutorialStep } from '../../types/tutorial';

// "STEP X OF Y" is derived from each step's position (see TutorialOverlay),
// so steps can be added/removed here without renumbering anything.
const MAIN_TOUR: TutorialStep[] = [
  { targetId: 'profile.levelCircle', mode: 'decoy', caption: 'YOUR PROFILE SHOWS YOUR CURRENT LEVEL' },
  { targetId: 'bottomTab.strength', mode: 'real', caption: 'TAP STRENGTH TO ENTER STRENGTH WORLD' },
  { targetId: 'strength.tierChips', mode: 'real', caption: 'BROWSE TIERS — TAP ONE TO SELECT IT' },
  { targetId: 'strength.trialButton', mode: 'decoy', caption: 'START A TRIAL TO RANK UP THIS TIER', optional: true },
  { targetId: 'strength.leaderboardFirstRow', mode: 'decoy', caption: 'SEE HOW YOU RANK AGAINST OTHER WARRIORS', optional: true },
  { targetId: 'bottomTab.profile', mode: 'real', caption: 'TAP PROFILE TO HEAD BACK' },
  { targetId: 'community.createButton', mode: 'decoy', caption: 'START YOUR OWN COMMUNITY OF WARRIORS', optional: true },
  { targetId: 'community.joinButton', mode: 'decoy', caption: 'OR JOIN ONE WITH AN INVITE CODE', optional: true },
  { targetId: 'profile.wraScoreBar', mode: 'real', caption: 'TAP TO SEE THE WELL-ROUNDED LEADERBOARD' },
  { targetId: 'wra.topEntries', mode: 'decoy', caption: 'THE TOP WARRIORS ACROSS ALL THREE WORLDS' },
  { targetId: 'wra.closeButton', mode: 'real', caption: 'TAP TO CLOSE THE LEADERBOARD' },
  // Power/Static/1MM live inside the WORLDS fan-out, so reaching 1MM is
  // two real taps: open the fan-out, then pick the 1MM circle.
  { targetId: 'bottomTab.worlds', mode: 'real', caption: 'TAP WORLDS TO SEE THE THREE WORLDS' },
  { targetId: 'worlds.1mm', mode: 'real', caption: 'TAP 1MM TO ENTER 1-MINUTE MAX' },
  { targetId: 'onemm.timerBadge', mode: 'real', caption: 'TAP A MOVEMENT TO START A TIMED TEST' },
  { targetId: 'onemm.startSprintButton', mode: 'decoy', caption: 'START SPRINT BEGINS YOUR 60-SECOND TEST' },
  { targetId: 'onemm.timerCloseButton', mode: 'real', caption: 'TAP TO CLOSE THIS TEST' },
  { targetId: 'bottomTab.worlds', mode: 'decoy', caption: 'STATIC WORLD UNLOCKS AT TIER 1, POWER WORLD AT TIER 6 — BOTH LIVE UNDER WORLDS' },
  { targetId: 'bottomTab.trainingCenter', mode: 'real', caption: 'TAP TRAIN TO SEE YOUR TRAINING OPTIONS' },
  { targetId: 'train.heroCard', mode: 'decoy', caption: "YOUR ACTIVE PROGRAM AND THIS WEEK'S PROGRESS — TAP CONTINUE TO TRAIN" },
  { targetId: 'train.tile.templates', mode: 'decoy', caption: 'PROGRAM TEMPLATES — READY-MADE PLANS MATCHED TO YOUR TIER' },
  { targetId: 'train.tile.customize', mode: 'decoy', caption: 'CUSTOMIZE PROGRAM — BUILD YOUR OWN WEEK FROM THE WORKOUT LIBRARY' },
  { targetId: 'train.tile.quick', mode: 'decoy', caption: 'QUICK WORKOUT — ONE-OFF SESSIONS, NO PROGRAM NEEDED' },
  { targetId: 'bottomTab.journey', mode: 'decoy', caption: 'JOURNEY TRACKS YOUR DAILY PROGRESS, STREAKS AND WEEKLY TRIALS' },
  { targetId: 'bottomTab.profile', mode: 'real', caption: 'TAP PROFILE TO FINISH THE TOUR' },
];

const CUSTOMIZE_TOUR: TutorialStep[] = [
  { targetId: 'customize.filters', mode: 'decoy', caption: 'FILTER THE LIBRARY BY WORKOUT TYPE AND DIFFICULTY' },
  { targetId: 'customize.layoutToggle', mode: 'decoy', caption: 'SWITCH BETWEEN A LIST AND A 2-COLUMN GRID' },
  { targetId: 'customize.firstCard', mode: 'decoy', caption: 'TAP A WORKOUT TO SEE WHAT’S INSIDE AND ADD IT TO A TRAINING DAY', optional: true },
  { targetId: 'customize.quickBuild', mode: 'decoy', caption: 'QUICK BUILD — PICK HOW MANY DAYS, THEN DRAG WORKOUTS ONTO THEM', optional: true },
];

const QUICK_WORKOUT_TOUR: TutorialStep[] = [
  { targetId: 'quick.filters', mode: 'decoy', caption: 'FILTER SESSIONS BY TYPE AND DIFFICULTY' },
  { targetId: 'quick.firstCard', mode: 'decoy', caption: 'TAP A SESSION TO PREVIEW IT, THEN START — THE TIMER GUIDES YOU THROUGH', optional: true },
];

const TEMPLATES_TOUR: TutorialStep[] = [
  { targetId: 'templates.recommended', mode: 'decoy', caption: 'RECOMMENDED FOR YOU — THE BEST FIT FOR YOUR TIER', optional: true },
  { targetId: 'templates.difficultyFilter', mode: 'decoy', caption: 'FILTER EVERY OTHER TEMPLATE BY DIFFICULTY' },
  { targetId: 'templates.firstRow', mode: 'decoy', caption: 'EACH PLAN SHOWS ITS TIER RANGE, WEEKS AND DAYS PER WEEK — TAP ONE TO PREVIEW WEEK 1, THEN START MY PROGRAM', optional: true },
];

export const TOURS: Record<TourId, TutorialStep[]> = {
  main: MAIN_TOUR,
  customize: CUSTOMIZE_TOUR,
  quickWorkout: QUICK_WORKOUT_TOUR,
  templates: TEMPLATES_TOUR,
};
