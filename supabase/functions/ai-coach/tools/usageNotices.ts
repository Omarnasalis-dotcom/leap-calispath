// Real bug found live (2026-09-29): when a message cap or the $ budget is
// hit, CoachScreen shows its own notice ("You've used this period's AI
// Coach budget — more opens up when your plan renews.") as a coach reply,
// and it stays in the chat history the app sends with every message. The
// model then read those as its own words and kept telling an athlete who
// had just upgraded to wait for their plan to renew. The server is the only
// judge of limits (it never reaches the model when a limit is hit), so each
// such notice is swapped for a note saying it no longer applies. Replaced,
// not removed, so user/assistant turns still alternate.

// The app's notices (coach.quota* in src/i18n/locales/en.ts and ar.ts), by
// their opening words.
const NOTICE_PATTERNS: RegExp[] = [
  /^You've used (this period's|this week's|today's|all your) (AI Coach budget|coaching messages)/,
  /^استهلكت (ميزانية المدرب الذكي|رسائل التدريب|جميع رسائل التدريب)/,
];

export const USAGE_NOTICE_REPLACEMENT =
  "[App notice, not written by you: a usage limit was reached at this point. It no longer applies — this request reached you, so the athlete has access now. Never tell them to wait for their plan to renew.]";

export function isUsageNotice(text: string): boolean {
  const trimmed = text.trim();
  return NOTICE_PATTERNS.some((re) => re.test(trimmed));
}

export function neutralizeUsageNotices<T extends { role: string; content: unknown }>(messages: T[]): T[] {
  return messages.map((m) =>
    m.role === "assistant" && typeof m.content === "string" && isUsageNotice(m.content)
      ? { ...m, content: USAGE_NOTICE_REPLACEMENT }
      : m
  );
}
