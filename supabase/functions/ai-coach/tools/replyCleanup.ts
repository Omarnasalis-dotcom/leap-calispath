// Server-side backstop for two prompt rules that are otherwise only prose
// (system-prompt.ts §1 "ACT, DON'T NARRATE" and §3's no-em-dash rule) —
// found live (2026-09-16) that low-effort Sonnet still occasionally slips
// on both under a dense schema. Neither check is a substitute for the
// prompt rule; both exist so a slip never actually reaches the athlete.
// Zero imports, pure string in/string out — Jest-testable without Deno.

// Collapses " — " (any surrounding whitespace) to ", " — cannot fix a
// sentence that only reads correctly with the harder break an em dash
// provides, but guarantees the character itself never ships.
const EM_DASH_RE = /\s*—\s*/g;

// A tool-narration line is the WHOLE line (after trim): "[now] let me /
// let's / I'll / I will VERB ..." with no other sentence packed into it.
// Anchored and requiring no mid-line ./!/? keeps this from eating a real
// sentence that happens to start the same way — "I'll make sure to check
// in next week." has "make sure to" between "I'll" and "check", so it
// doesn't match the verb immediately following the anchor and survives.
const NARRATION_LINE_RE =
  /^(now\s+)?(let me|let's|i'll|i will)\s+(search|check|pull|grab|fetch|look|verify|confirm|get|call|run|see)\b[^.!?:]*\.{0,3}$/i;

// Backstop for the auto-repair pass (blockHelpers.ts's normalizeBlockStructure)
// and its tool-internal "auto_fixed"/rejection-message vocabulary — §1 of the
// prompt now tells the model never to relay this, but that is prose, same as
// "ACT — DON'T NARRATE" was prose before this file existed. Same
// belt-and-suspenders reasoning: catches a whole line built around
// "auto-fixed"/"auto-repaired"/validation-error language even if the model
// slips, in either language mentioned in the prompt's own examples.
const AUTO_FIX_LEAK_RE = /auto[- ]?(fixed|repaired|corrected)|validation error|metadata\.\w+/i;

export function sanitizeReply(text: string): string {
  if (!text) return text;

  let cleaned = text.replace(EM_DASH_RE, ", ");

  cleaned = cleaned
    .split("\n")
    .filter((line) => !NARRATION_LINE_RE.test(line.trim()) && !AUTO_FIX_LEAK_RE.test(line))
    .join("\n");

  // Collapse any run of blank lines the filter above left behind.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}
