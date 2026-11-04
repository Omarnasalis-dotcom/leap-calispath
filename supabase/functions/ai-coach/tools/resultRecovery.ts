// Keeps an answer when the athlete's phone drops the connection mid-turn
// (migration 20261104120000_ai_coach_results.sql). Found live 2026-11-04:
// a phone disconnected near the end of a 34s Day 1 build, the next write to
// the closed stream threw "The stream controller cannot close or enqueue",
// and the finished card was lost. Kept pure so it is testable from Jest.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The id the app tags a message with so it can collect the answer later.
// Older app builds don't send one: nothing is stored for them.
export function parseClientRequestId(raw: unknown): string | null {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

// Writes SSE events to the response stream. Once the phone is gone, the
// stream throws on every write; this drops the write instead, so the run
// finishes, records its cost and stores the answer for the app to collect.
// Before this, a disconnect during any stage event ended the whole run.
export function createEventSink(enqueue: (text: string) => void) {
  let open = true;
  return {
    write(event: string, data: unknown): boolean {
      if (!open) return false;
      // Built outside the try: a payload that can't be serialized is a real
      // bug and still throws to the caller, it is not a disconnect.
      const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      try {
        enqueue(text);
        return true;
      } catch {
        open = false;
        return false;
      }
    },
    close() {
      open = false;
    },
    get isOpen() {
      return open;
    },
  };
}

export type StoredStatus = "done" | "failed";

// What the ai_coach_results row says once the turn is over: the final event
// exactly as sent, or failed when the turn ended without one.
export function finalRow(finalPayload: unknown): { status: StoredStatus; payload: unknown } {
  return finalPayload ? { status: "done", payload: finalPayload } : { status: "failed", payload: null };
}
