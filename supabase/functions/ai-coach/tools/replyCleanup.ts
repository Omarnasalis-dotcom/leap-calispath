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

export function sanitizeReply(text: string): string {
  if (!text) return text;

  let cleaned = text.replace(EM_DASH_RE, ", ");

  cleaned = cleaned
    .split("\n")
    .filter((line) => !NARRATION_LINE_RE.test(line.trim()))
    .join("\n");

  // Collapse any run of blank lines the filter above left behind.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}
