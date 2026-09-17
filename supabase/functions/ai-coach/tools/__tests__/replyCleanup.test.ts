// Jest coverage for replyCleanup.ts — pure string in/string out, zero
// imports, no Deno/DB needed. Server-side backstop for system-prompt.ts §1
// ("ACT, DON'T NARRATE") and §3 (no em dash) — see that file's own header
// comment for why this exists on top of the prompt rule.
import { sanitizeReply } from "../replyCleanup";

describe("sanitizeReply — em dash removal", () => {
  it("replaces a mid-sentence em dash with a comma", () => {
    expect(sanitizeReply("Pull-ups first — they're the harder pull.")).toBe(
      "Pull-ups first, they're the harder pull."
    );
  });

  it("replaces multiple em dashes in one reply", () => {
    expect(sanitizeReply("Day 1 — Pull. Day 2 — Push. Day 3 — Legs.")).toBe(
      "Day 1, Pull. Day 2, Push. Day 3, Legs."
    );
  });

  it("collapses surrounding whitespace around the dash, not just the dash itself", () => {
    expect(sanitizeReply("solid pick  —  adjusted for you")).toBe("solid pick, adjusted for you");
  });

  it("leaves text with no em dash untouched", () => {
    expect(sanitizeReply("Pull-ups first, since they're the harder pull.")).toBe(
      "Pull-ups first, since they're the harder pull."
    );
  });
});

describe("sanitizeReply — tool-narration line removal", () => {
  it("strips a standalone \"Let me search...\" line", () => {
    expect(sanitizeReply("Let me search for that...\nFound a solid Pull day for you.")).toBe(
      "Found a solid Pull day for you."
    );
  });

  it("strips a standalone \"Now let me pull...\" line", () => {
    expect(sanitizeReply("Now let me pull your logs.\nYou're on track this week.")).toBe(
      "You're on track this week."
    );
  });

  it("strips a standalone \"Let me check...\" line", () => {
    expect(sanitizeReply("Let me check your program.\nWeek 2 is ready when you are.")).toBe(
      "Week 2 is ready when you are."
    );
  });

  it("strips a narration line even when it's the only content", () => {
    expect(sanitizeReply("Let me verify that for you...")).toBe("");
  });

  it("collapses the blank line left behind by a stripped narration line", () => {
    expect(sanitizeReply("Let me check your logs.\n\nYou're all caught up.")).toBe("You're all caught up.");
  });

  it("does NOT strip a real sentence that merely starts the same way", () => {
    const text = "I'll make sure to check in next week and see how it went.";
    expect(sanitizeReply(text)).toBe(text);
  });

  it("does NOT strip a line where the narration verb isn't immediately after the anchor", () => {
    const text = "Let me know if you want to adjust the reps.";
    expect(sanitizeReply(text)).toBe(text);
  });

  it("does NOT strip a narration-shaped line that also carries real content", () => {
    const text = "Let me check something: your pull-up count looks off compared to last week.";
    expect(sanitizeReply(text)).toBe(text);
  });
});

describe("sanitizeReply — auto-fix/validation leak removal (added 2026-09-17)", () => {
  it("strips a line mentioning an auto-fix", () => {
    expect(sanitizeReply("Auto-fixed: defaulted rounds to 3.\nYour Legs day is ready.")).toBe(
      "Your Legs day is ready."
    );
  });

  it("strips a line mentioning an auto-repair, case-insensitive", () => {
    expect(sanitizeReply("I auto-repaired the finisher block for you.\nAll set.")).toBe("All set.");
  });

  it("strips a line mentioning a validation error", () => {
    expect(sanitizeReply("There was a validation error on that block.\nHere's the fixed version.")).toBe(
      "Here's the fixed version."
    );
  });

  it("strips a line that leaks a raw metadata field name", () => {
    expect(sanitizeReply("metadata.rounds was missing so I set it to 3.\nReady when you are.")).toBe(
      "Ready when you are."
    );
  });

  it("does NOT strip an unrelated line that just contains the word \"fixed\" in normal use", () => {
    const text = "Fixed that typo in your split, all good now.";
    expect(sanitizeReply(text)).toBe(text);
  });
});

describe("sanitizeReply — combined and edge cases", () => {
  it("handles both an em dash and a narration line in the same reply", () => {
    const input = "Let me pull your data.\nBoth days matched — adjusted for your pull-up count.";
    expect(sanitizeReply(input)).toBe("Both days matched, adjusted for your pull-up count.");
  });

  it("returns an empty string unchanged", () => {
    expect(sanitizeReply("")).toBe("");
  });

  it("trims leading/trailing whitespace left behind by stripped lines", () => {
    expect(sanitizeReply("Let me check that.\nAll set.\n")).toBe("All set.");
  });
});
