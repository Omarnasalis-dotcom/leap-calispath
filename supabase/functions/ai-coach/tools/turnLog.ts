// Builds the ai_coach_turns row for one exchange (migration
// 20261030120000_ai_coach_chat_review.sql): what the athlete said, what the
// coach did, how it ended. Read only by the owner on the admin-web AI Coach
// chats page, to find and fix mistakes. Kept pure so it is testable from Jest.

// Big tool payloads (get_workout_logs, get_program_structure) are cut, not
// dropped: the start of a result is usually enough to see what the model
// was looking at, and the row stays small.
const MAX_INPUT_CHARS = 4000;
const MAX_RESULT_CHARS = 6000;

export type TurnOutcome = "ok" | "deadline" | "max_tokens" | "empty" | "unacted_blocked" | "max_turns" | "error";

export interface ToolTrace {
  name: string;
  input: string;
  ok: boolean;
  error: string | null;
  result: string | null;
  ms: number;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… [${text.length - max} more chars]` : text;
}

export function traceTool(
  name: string,
  input: unknown,
  ms: number,
  outcome: { result: unknown } | { error: string },
): ToolTrace {
  const ok = "result" in outcome;
  return {
    name,
    input: clip(JSON.stringify(input ?? {}), MAX_INPUT_CHARS),
    ok,
    error: ok ? null : outcome.error,
    result: ok ? clip(JSON.stringify(outcome.result ?? null), MAX_RESULT_CHARS) : null,
    ms,
  };
}

// The athlete's newest message. Content is a string from the app; an array
// of blocks is joined from its text parts.
export function lastUserText(messages: Array<{ role: string; content: unknown }>): string | null {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return null;
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content)) {
    const text = last.content
      .map((b) => (b && typeof b === "object" && (b as { type?: string }).type === "text" ? (b as { text?: string }).text ?? "" : ""))
      .filter((text) => text)
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}
