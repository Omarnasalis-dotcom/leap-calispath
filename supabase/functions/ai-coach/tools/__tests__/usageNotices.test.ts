// Jest coverage for usageNotices.ts. Reads the app's real notice copy, so a
// wording change in the app that stops matching fails here.
import en from "../../../../../src/i18n/locales/en";
import ar from "../../../../../src/i18n/locales/ar";
import { isUsageNotice, neutralizeUsageNotices, USAGE_NOTICE_REPLACEMENT } from "../usageNotices";

const KEYS = ["quotaBudget", "quotaCap", "quotaWeekly", "quotaDaily", "quotaDefault"] as const;

describe("usage notices", () => {
  it.each(KEYS)("recognizes the app's %s notice in English and Arabic", (key) => {
    expect(isUsageNotice(en.coach[key])).toBe(true);
    expect(isUsageNotice(ar.coach[key])).toBe(true);
  });

  it("leaves real coach replies alone", () => {
    expect(isUsageNotice("You've used a great tempo on those pull-ups.")).toBe(false);
    expect(isUsageNotice("Week 2 is ready. Tap the card to start it.")).toBe(false);
  });

  it("replaces only assistant notices, keeping turn order", () => {
    const messages = [
      { role: "user", content: "Yes" },
      { role: "assistant", content: en.coach.quotaBudget },
      { role: "user", content: en.coach.quotaBudget },
      { role: "assistant", content: "Here's how Week 1 went." },
    ];
    const out = neutralizeUsageNotices(messages);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(out[1].content).toBe(USAGE_NOTICE_REPLACEMENT);
    expect(out[2].content).toBe(en.coach.quotaBudget);
    expect(out[3].content).toBe("Here's how Week 1 went.");
  });
});
