// Backstop for the exact failure Haiku reproduced twice live (2026-08-23,
// 2026-08-26): it ended a turn with plain text claiming an action happened
// ("Week 2 is built... go log it") with no matching tool call anywhere in
// the request — the athlete checked and nothing was actually written.
// System-prompt §1 ("ACT — DON'T NARRATE") already tells the model never to do
// this; that's prompt-only enforcement and it already failed twice under
// Haiku. This is independent of prompt compliance: a keyword/regex check on
// the model's own final text, paired with a bounded self-correction retry
// in index.ts's tool loop. It cannot be a perfect classifier for open-ended
// bilingual language — it doesn't need to be, since it never blocks a
// legitimate reply on its own, it only ever triggers one corrective
// round-trip (or a safe fallback reply) instead of shipping a claim with
// nothing behind it.
//
// English side: verbs/phrases a model uses to claim one of the write-tool
// actions already happened. Arabic side: the same, in the Egyptian
// colloquial register §3/§18 already require the model to answer in.
const CLAIM_PATTERNS: RegExp[] = [
  // "Week 2 is built" / "week 3 has been added" / "your week is ready"
  /\bweek\s*\d*\s*(is|has been|was|'s)\s*(now\s*)?(built|added|created|written|done|ready|live|updated)\b/i,
  /\b(built|added|created|wrote|finished)\s+(your\s+)?week\s*\d*\b/i,
  // "your program is live" / "program has been created" / "I've started your program"
  /\b(your\s+)?program\s*(is|has been|was)\s*(now\s*)?(live|built|created|ready|started|ended|deleted)\b/i,
  /\bI('ve| have)\s+(built|created|started|ended|deleted|removed|added|adjusted|updated|swapped|replaced)\s+(your\s+)?(program|week|day|block|exercise)\b/i,
  // Arabic: "تم بناء/إضافة/حذف/تعديل" (was built/added/deleted/adjusted), "برنامجك جاهز" (your program is ready)
  /تم\s*(بناء|إضاف|حذف|تعديل|إنشاء|إنهاء)/,
  /برنامجك\s*(جاهز|جاهزة|اتعمل|إتعمل)/,
];

export function detectUnactedClaim(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return CLAIM_PATTERNS.some((re) => re.test(trimmed));
}
