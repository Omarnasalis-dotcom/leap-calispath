// Self-contained mirror of src/lib/trials.ts's RITES_OF_PASSAGE — edge
// functions run in an isolated Deno runtime and can't import from the RN
// app's src tree, so this is a deliberate duplicate, not a shared import.
// Keep it in sync with src/lib/trials.ts by hand if trial content ever
// changes (rare — this is static ranking data, not something users touch).
//
// Used by get_user_context to attach the athlete's next_trial — the exact,
// real movements for the trial their current tier is working toward. This
// used to be a ~2000-character table baked directly into the system
// prompt (every tier, every turn) to stop the AI from hallucinating
// generic "advanced calisthenics" trial content (handstand/front lever/
// back lever — none of which exist in any real Leap trial). Moving it
// here means the always-loaded prompt only carries a short pointer, and
// each turn's actual payload is just the one or two trials that matter
// for this specific athlete — smaller and still fully grounded.
interface TrialMovement {
  name: string;
  reps: number;
}

interface Trial {
  tier: number;
  name: string;
  movements: TrialMovement[];
}

const RITES_OF_PASSAGE: Trial[] = [
  { tier: 0, name: "Helot Trial", movements: [
    { name: "Inverted Row", reps: 10 }, { name: "Squats", reps: 10 },
    { name: "Bench Dips", reps: 10 }, { name: "Knee Push-ups", reps: 10 },
  ] },
  { tier: 1, name: "Neos Trial", movements: [
    { name: "2 Inv Row + 4 Inc Push-ups", reps: 1 }, { name: "Squats", reps: 10 },
    { name: "Knee Push-up Negatives", reps: 10 }, { name: "4 Inv Row + 6 Inc Push-ups", reps: 1 },
    { name: "Lunges", reps: 15 }, { name: "Bench Dips", reps: 12 },
    { name: "6 Inv Row + 8 Inc Push-ups", reps: 1 }, { name: "Inverted Row", reps: 10 },
    { name: "Knee Raises", reps: 5 },
  ] },
  { tier: 2, name: "Ephebe Trial", movements: [
    { name: "2 Assist Pull + 4 Bench Dips", reps: 1 }, { name: "Squats", reps: 15 },
    { name: "Knee Push-ups", reps: 15 }, { name: "4 Assist Pull + 6 Bench Dips", reps: 1 },
    { name: "Lunges", reps: 20 }, { name: "Knee Push-ups", reps: 20 },
    { name: "6 Assist Pull + 8 Bench Dips", reps: 1 }, { name: "Inverted Row", reps: 10 },
    { name: "Knee Raises", reps: 8 }, { name: "Jump Muscle-ups", reps: 5 },
  ] },
  { tier: 3, name: "Hoplite Trial", movements: [
    { name: "2 Assist Pull + 2 Bar Dips + 2 Knee Raise", reps: 1 }, { name: "Squats", reps: 20 },
    { name: "4 Assist Pull + 4 Bar Dips + 4 Knee Raise", reps: 1 }, { name: "Lunges", reps: 25 },
    { name: "Push-ups", reps: 20 }, { name: "6 Assist Pull + 6 Bar Dips + 6 Knee Raise", reps: 1 },
    { name: "Bar Dips", reps: 8 }, { name: "Assist Pull-ups", reps: 10 },
    { name: "Jump Muscle-ups", reps: 8 },
  ] },
  { tier: 4, name: "Spartan Trial", movements: [
    { name: "Banded Muscle-ups", reps: 5 }, { name: "4 Pull-ups + 3 Bar Dips", reps: 1 },
    { name: "Squats", reps: 20 }, { name: "Push-ups", reps: 20 },
    { name: "5 Pull-ups + 5 Bar Dips", reps: 1 }, { name: "Lunges", reps: 25 },
    { name: "Bar Dips", reps: 20 }, { name: "6 Pull-ups + 7 Bar Dips", reps: 1 },
    { name: "Bar Dips", reps: 10 },
  ] },
  { tier: 5, name: "Lochagos Trial", movements: [
    { name: "1 Banded MU + 3 Bar Dips + 3 Pull-ups", reps: 1 }, { name: "Squats", reps: 20 },
    { name: "Push-ups", reps: 25 }, { name: "2 Banded MU + 4 Bar Dips + 4 Pull-ups", reps: 1 },
    { name: "Lunges", reps: 25 }, { name: "Bar Dips", reps: 25 },
    { name: "3 Banded MU + 5 Bar Dips + 5 Pull-ups", reps: 1 }, { name: "Pull-ups", reps: 10 },
  ] },
  { tier: 6, name: "Strategos Trial", movements: [
    { name: "2 MU + 2 Bar Dips + 2 Pull-ups", reps: 1 }, { name: "Squats", reps: 20 },
    { name: "Push-ups", reps: 20 }, { name: "4 MU + 4 Bar Dips + 4 Pull-ups", reps: 1 },
    { name: "Lunges", reps: 30 }, { name: "Bar Dips", reps: 30 },
    { name: "6 MU + 6 Bar Dips + 6 Pull-ups", reps: 1 },
  ] },
  { tier: 7, name: "Olympian Trial", movements: [
    { name: "3 MU + 3 Bar Dips + 3 Pull-ups", reps: 1 }, { name: "Squats", reps: 30 },
    { name: "Push-ups", reps: 30 }, { name: "5 MU + 5 Bar Dips + 5 Pull-ups", reps: 1 },
    { name: "Lunges", reps: 40 }, { name: "Bar Dips", reps: 40 },
    { name: "8 MU + 8 Bar Dips + 8 Pull-ups", reps: 1 }, { name: "Muscle-ups", reps: 10 },
  ] },
  { tier: 8, name: "Demigod Trial", movements: [
    { name: "3 MU + 3 Bar Dips + 3 Pull-ups", reps: 1 }, { name: "Squats (+20kg)", reps: 30 },
    { name: "Push-ups", reps: 30 }, { name: "5 MU + 5 Bar Dips + 5 Pull-ups", reps: 1 },
    { name: "Lunges (+20kg)", reps: 40 }, { name: "Bar Dips (+20kg)", reps: 40 },
    { name: "8 MU + 8 Bar Dips + 8 Pull-ups", reps: 1 }, { name: "Pull-ups (+10kg)", reps: 14 },
    { name: "Muscle-ups (+5kg)", reps: 10 },
  ] },
  { tier: 9, name: "Eternity Protocol", movements: [
    { name: "(1 Pull-up + 1 MU) Unbroken", reps: 2 }, { name: "Dips (+20kg)", reps: 10 },
    { name: "Squat (+20kg)", reps: 10 }, { name: "MU (+10kg)", reps: 4 },
    { name: "(1 Pull-up + 1 MU) Unbroken", reps: 2 }, { name: "Dips (+10kg)", reps: 20 },
    { name: "Squat (+10kg)", reps: 20 }, { name: "MU (+5kg)", reps: 6 },
    { name: "(1 Pull-up + 1 MU) Unbroken", reps: 2 }, { name: "Dips (BW)", reps: 30 },
    { name: "Squat (BW)", reps: 30 }, { name: "MU (BW)", reps: 8 },
  ] },
];

export function getNextTrial(currentTier: number): Trial | null {
  const targetTier = Math.min(Math.max(currentTier, 0) + 1, 9);
  return RITES_OF_PASSAGE.find((t) => t.tier === targetTier) ?? null;
}
