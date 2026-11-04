// Found live (2026-11-04, TestFlight): after the athlete taps Add, the app
// writes its own confirmation into the chat as a coach reply ("**PULL DAY**
// added."). The model read it as its own words and copied it for the next
// day — "**PUSH DAY** added. Last one left, Legs." — without calling
// propose_add_day, so nothing was built. Same fix as usageNotices.ts: each
// app confirmation is swapped for a note that keeps the fact (what the
// athlete confirmed) and says it isn't the coach's words. Replaced, not
// removed, so user/assistant turns still alternate.

// The app's confirmations (coach.dayAdded/dayUpdated/programLive/
// weekDeleted/programEnded in src/i18n/locales/en.ts and ar.ts), whole
// message only. The jest test renders the real strings to keep these in sync.
const APP_NOTES: Array<{ re: RegExp; note: (m: RegExpMatchArray) => string }> = [
  { re: /^\*\*(.+?)\*\* added\.$/, note: (m) => `the athlete tapped Add and "${m[1]}" was added to their program` },
  { re: /^تمت إضافة \*\*(.+?)\*\*\.$/, note: (m) => `the athlete tapped Add and "${m[1]}" was added to their program` },
  { re: /^\*\*(.+?)\*\* updated\.$/, note: (m) => `the athlete tapped Redo and "${m[1]}" was replaced in their program` },
  { re: /^تم تحديث \*\*(.+?)\*\*\.$/, note: (m) => `the athlete tapped Redo and "${m[1]}" was replaced in their program` },
  { re: /^\*\*(.+?)\*\* is live — check your Workout Program to see it\.$/, note: (m) => `the athlete confirmed the last card and "${m[1]}" is now their active program` },
  { re: /^\*\*(.+?)\*\* جاهز الآن — افتح برنامج تمرينك لتراه\.$/, note: (m) => `the athlete confirmed the last card and "${m[1]}" is now their active program` },
  { re: /^Week (\d+) has been deleted\.$/, note: (m) => `the athlete confirmed and week ${m[1]} was deleted` },
  { re: /^تم حذف الأسبوع (\d+)\.$/, note: (m) => `the athlete confirmed and week ${m[1]} was deleted` },
  { re: /^Your program has been ended\.$/, note: () => "the athlete confirmed and their program was ended" },
  { re: /^تم إنهاء برنامجك\.$/, note: () => "the athlete confirmed and their program was ended" },
];

export function appNoteFor(text: string): string | null {
  const trimmed = text.trim();
  for (const { re, note } of APP_NOTES) {
    const m = trimmed.match(re);
    if (m) {
      return `[App note, not written by you: ${note(m)}. Never write a line like this yourself: something is only added, changed or ended when they tap a card you proposed.]`;
    }
  }
  return null;
}

export function neutralizeAppNotes<T extends { role: string; content: unknown }>(messages: T[]): T[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || typeof m.content !== "string") return m;
    const note = appNoteFor(m.content);
    return note ? { ...m, content: note } : m;
  });
}
