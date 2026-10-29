// What the athlete actually wrote on a workout log, apart from the app's own
// lines. workout_logs.notes mixes both: the log sheet writes "[LOG] …" lines
// (AMRAP result, ladder progress, weight used) and appends the athlete's
// note after them; a missed block's notes are just "[STATUS:MISSED]" and its
// note is in missed_detail instead (log_block_with_sets).
//
// Seen live (2026-10-14): "Don't have rings so i did rear delt fly instead"
// sat inside notes next to the [LOG] lines, the sets were logged under the
// prescribed Ring Face Pull, and the coach carried Ring Face Pull and Ring
// Row into weeks 4 and 5. Pulling the note out on its own is what lets the
// prompt require a decision on every one (system-prompt.ts §6, §12).

const MAX_NOTE_CHARS = 500;

export function athleteNoteFrom(notes: string | null | undefined, missedDetail?: string | null): string | null {
  const own = (notes ?? "")
    .replace(/^\[STATUS:MISSED\]/, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("[LOG]"))
    .join("\n");
  const note = own || (missedDetail ?? "").trim();
  if (!note) return null;
  return note.length > MAX_NOTE_CHARS ? `${note.slice(0, MAX_NOTE_CHARS)}…` : note;
}
