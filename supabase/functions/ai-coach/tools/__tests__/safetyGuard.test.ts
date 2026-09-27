// Pure-function tests for safetyGuard.ts (audit 2026-09-25, H5 #4). The
// guard only flags for review, so a false positive is cheap — but noise
// makes the review queue useless, so the allowed general guidance from
// system-prompt.ts §5 is pinned as "no flag" alongside the real violations.
import { detectSafetyFlags } from "../safetyGuard";

describe("detectSafetyFlags — flags §5 violations", () => {
  it.each([
    ["Here's a simple meal plan for your cut.", "meal_plan"],
    ["Breakfast: 3 eggs and oats. Lunch: chicken and rice.", "meal_plan"],
    ["خطة أكل بسيطة للأسبوع ده", "meal_plan"],
    ["Aim for about 2200 calories a day.", "calorie_or_macro_target"],
    ["Hit 150g of protein daily.", "calorie_or_macro_target"],
    ["Run a caloric deficit of 500 per day.", "calorie_or_macro_target"],
    ["كل حوالي 2000 سعر في اليوم", "calorie_or_macro_target"],
    ["خد 150 جرام بروتين", "calorie_or_macro_target"],
    ["Sounds like you have tendinitis in that elbow.", "diagnosis"],
    ["You probably have a torn rotator cuff.", "diagnosis"],
    ["That's likely an impingement.", "diagnosis"],
    ["غالبا عندك التهاب أوتار", "diagnosis"],
    ["Take some ibuprofen before training.", "medication"],
    ["400 mg should help with the pain.", "medication"],
    ["خد بروفين قبل التمرين", "medication"],
  ])("%s -> %s", (text, flag) => {
    expect(detectSafetyFlags(text)).toContain(flag);
  });

  it("reports each category once, even with several matches", () => {
    const flags = detectSafetyFlags("Breakfast: eggs. Lunch: rice. Aim for 2500 calories and 180g protein.");
    expect(flags.sort()).toEqual(["calorie_or_macro_target", "meal_plan"]);
  });
});

describe("detectSafetyFlags — leaves allowed guidance alone", () => {
  it.each([
    "Eat enough to recover and spread protein across the day.",
    "Stay hydrated, especially on training days.",
    "Sharp pain in the joint is past what a training app should handle — please see a physio or doctor.",
    "Mild soreness after a new movement is normal; we'll regress it this week.",
    "Do 3 sets of 8 pull-ups with 90 seconds rest.",
    "Hold the plank for 45 seconds, 3 rounds.",
    "Your lunch break is a great time for a quick session.",
    "لو الألم حاد روح لدكتور أو علاج طبيعي",
    "كل كويس ونام كويس عشان تتعافى",
  ])("%s", (text) => {
    expect(detectSafetyFlags(text)).toEqual([]);
  });

  it("returns [] for empty text", () => {
    expect(detectSafetyFlags("")).toEqual([]);
    expect(detectSafetyFlags("   ")).toEqual([]);
  });
});
