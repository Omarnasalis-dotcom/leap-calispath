// Pure-function tests for actionClaimGuard.ts — no network, no Deno/DB
// imports. This guard is the server-side backstop against the model
// claiming a write happened ("Week 2 is built") when no tool was called,
// the exact failure reproduced live twice under Haiku. A regression here
// either ships false claims (missed match) or forces pointless correction
// round-trips on honest replies (false positive), so both directions are
// pinned below (audit 2026-09-25, H5 #7).
import { detectPendingCardClaim, detectUnactedClaim } from "../actionClaimGuard";

describe("detectUnactedClaim — flags claims that a write already happened", () => {
  it.each([
    "Week 2 is built, go log it!",
    "Your week 3 has been added.",
    "week 4 was updated with harder progressions",
    "Week 2's ready for you.",
    "I built your week 2 around the new skill work.",
    "Added week 3 — enjoy.",
    "Your program is live now.",
    "The program has been created.",
    "Program was deleted as requested.",
    "I've started your program.",
    "I have adjusted your program to 4 days.",
    "I've swapped the exercise in day 2.",
    "I have removed the block you didn't like.",
  ])("English: %s", (text) => {
    expect(detectUnactedClaim(text)).toBe(true);
  });

  it.each([
    "تم بناء الأسبوع التاني",
    "تم إضافة يوم جديد",
    "تم حذف الأسبوع",
    "تم تعديل البرنامج",
    "برنامجك جاهز يا بطل",
    "برنامجك اتعمل خلاص",
  ])("Arabic (Egyptian register): %s", (text) => {
    expect(detectUnactedClaim(text)).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(detectUnactedClaim("   \n Week 2 is built \n ")).toBe(true);
  });
});

describe("detectUnactedClaim — leaves honest replies alone", () => {
  it.each([
    "I can build your week 2 once you've logged week 1.",
    "Want me to add a fifth day?",
    "Here's the plan for week 2 — tap confirm and I'll create it.",
    "Your program will be ready as soon as you tap start.",
    "Should I adjust the rest times?",
    "Let's look at how your week went first.",
    "Nice work on your pull-ups this week!",
    "You can swap any exercise you don't like — just tell me which one.",
    "عايز أضيف يوم خامس؟",
    "قولي لو عايز نعدل البرنامج",
  ])("%s", (text) => {
    expect(detectUnactedClaim(text)).toBe(false);
  });

  it("returns false for empty or whitespace-only text", () => {
    expect(detectUnactedClaim("")).toBe(false);
    expect(detectUnactedClaim("   \n\t ")).toBe(false);
  });
});

describe("detectPendingCardClaim (2026-10-30, owner's add-a-day chat)", () => {
  it("catches the real 23:47 reply: done-talk about what was only on the card", () => {
    expect(detectPendingCardClaim(
      "Now adding warm-up, cool-down, and a handstand skills block to Day 4.\n\nDay 4 now has warm-up, cool-down, and handstand skill work added.\n\nAll set, Day 4 now has warm-up, a handstand Skills block, weighted strength, accessories, and cool-down. Week 6 is ready to go whenever you start it."
    )).toBe(true);
    expect(detectPendingCardClaim("Done. The Pull day has been updated.")).toBe(true);
    expect(detectPendingCardClaim("تم إضافة الإحماء ليوم ٤.")).toBe(true);
    expect(detectPendingCardClaim("الإحماء اتضاف خلاص.")).toBe(true);
  });

  it("lets the right way to present a card through", () => {
    expect(detectPendingCardClaim("Week 6 is ready: Pull/Push/Legs days carry their progressions. Tap the card to start it.")).toBe(false);
    expect(detectPendingCardClaim("Delete card is up for Week 6. Once you tap it, let me know and I'll rebuild the full week.")).toBe(false);
    expect(detectPendingCardClaim("All set, tap the card to add Day 4.")).toBe(false);
    expect(detectPendingCardClaim("Day 4 is on the card with a warm-up and cool-down. Tap Add when you're happy with it.")).toBe(false);
    expect(detectPendingCardClaim("الكارت جاهز، دوس عليه عشان تضيف اليوم.")).toBe(false);
  });
});
